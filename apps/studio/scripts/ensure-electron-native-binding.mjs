#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { ensureElectronInstallation } from "./electron-installation.mjs";

function report(message) {
  console.log(`[ensure-electron-native-binding] ${message}`);
}

function formatExecError(error) {
  return [error.stdout, error.stderr]
    .filter(Boolean)
    .map((chunk) => chunk.toString().trim())
    .filter(Boolean)
    .join("\n");
}

function verifyElectronBinding({ electronCliPath, nativeBindingPath, studioRoot }) {
  try {
    execFileSync(
      process.execPath,
      [
        electronCliPath,
        "-e",
        [
          "const Database=require('better-sqlite3');",
          "const nativeBinding=process.env.FLOWWEAVE_ELECTRON_NATIVE_BINDING;",
          "const db=new Database(':memory:', { nativeBinding });",
          "db.prepare('select 1').get();",
          "db.close();",
          "console.log('electron-binding-ok');",
        ].join(""),
      ],
      {
        cwd: studioRoot,
        env: {
          ...process.env,
          ELECTRON_RUN_AS_NODE: "1",
          FLOWWEAVE_ELECTRON_NATIVE_BINDING: nativeBindingPath,
        },
        stdio: "pipe",
      },
    );
    return { ok: true, output: "" };
  } catch (error) {
    return {
      ok: false,
      output: formatExecError(error) || error.message,
    };
  }
}

const studioRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const requireFromStudio = createRequire(join(studioRoot, "package.json"));

const electronPackageJsonPath = requireFromStudio.resolve("electron/package.json");
const betterSqlitePackageJsonPath = requireFromStudio.resolve("better-sqlite3/package.json");
const electronPackage = JSON.parse(readFileSync(electronPackageJsonPath, "utf8"));
const betterSqlitePackage = JSON.parse(readFileSync(betterSqlitePackageJsonPath, "utf8"));

const electronCliPath = join(dirname(electronPackageJsonPath), "cli.js");
ensureElectronInstallation({
  electronPackageDir: dirname(electronPackageJsonPath),
  onInstall: () => report("检测到 Electron 可执行文件缺失，开始运行官方安装脚本恢复"),
});
const targetDir = join(studioRoot, "dist-electron", "native");
const targetPath = join(targetDir, "better_sqlite3.node");
const pnpmCmd = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

if (existsSync(targetPath)) {
  const existing = verifyElectronBinding({
    electronCliPath,
    nativeBindingPath: targetPath,
    studioRoot,
  });
  if (existing.ok) {
    report("Electron 专用 better-sqlite3 native binding 已就绪");
    process.exit(0);
  }

  report(`现有 Electron native binding 校验失败，准备重建：${existing.output}`);
}

const buildRoot = mkdtempSync(join(tmpdir(), "flowweave-studio-native-"));
const packageRoot = join(buildRoot, "package");

try {
  mkdirSync(packageRoot, { recursive: true });
  writeFileSync(
    join(packageRoot, "package.json"),
    JSON.stringify(
      {
        name: "flowweave-studio-electron-native-builder",
        private: true,
        packageManager: "pnpm@9.15.4",
        dependencies: {
          "better-sqlite3": betterSqlitePackage.version,
        },
      },
      null,
      2,
    ),
    "utf8",
  );

  report(`开始生成 Electron ${electronPackage.version} 专用 better-sqlite3 native binding`);

  execFileSync(pnpmCmd, ["install", "--force"], {
    cwd: packageRoot,
    env: {
      ...process.env,
      npm_config_runtime: "electron",
      npm_config_target: electronPackage.version,
      npm_config_disturl: "https://electronjs.org/headers",
    },
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  const requireFromTemp = createRequire(join(packageRoot, "package.json"));
  const tempBetterSqlitePackageJson = requireFromTemp.resolve("better-sqlite3/package.json");
  const builtBinaryPath = join(
    dirname(tempBetterSqlitePackageJson),
    "build",
    "Release",
    "better_sqlite3.node",
  );

  mkdirSync(targetDir, { recursive: true });
  cpSync(builtBinaryPath, targetPath);

  const verified = verifyElectronBinding({
    electronCliPath,
    nativeBindingPath: targetPath,
    studioRoot,
  });
  if (!verified.ok) {
    throw new Error(
      `Electron 专用 better-sqlite3 native binding 重建后校验失败：${verified.output}`,
    );
  }

  report(`Electron 专用 better-sqlite3 native binding 已写入 ${targetPath}`);
} finally {
  rmSync(buildRoot, { recursive: true, force: true });
}
