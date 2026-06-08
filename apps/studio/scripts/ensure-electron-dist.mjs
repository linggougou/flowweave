#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const RESIDUAL_SIGNATURE_ERROR =
  "code has no resources but signature indicates they must be present";

function report(message) {
  console.log(`[ensure-electron-dist] ${message}`);
}

function hasValidFrameworkSymlink(frameworkLinkPath) {
  try {
    return lstatSync(frameworkLinkPath).isSymbolicLink();
  } catch {
    return false;
  }
}

function formatExecError(error) {
  return [error.stdout, error.stderr]
    .filter(Boolean)
    .map((chunk) => chunk.toString().trim())
    .filter(Boolean)
    .join("\n");
}

function verifyBundleSignature(appPath) {
  try {
    execFileSync("codesign", ["--verify", "--deep", "--strict", appPath], {
      stdio: "pipe",
    });
    return { ok: true, output: "" };
  } catch (error) {
    return {
      ok: false,
      output: formatExecError(error) || error.message,
    };
  }
}

function ensureBundleSignature(appPath) {
  const initialVerification = verifyBundleSignature(appPath);
  if (initialVerification.ok) {
    report("Electron bundle 严格签名校验通过");
    return;
  }

  if (!initialVerification.output.includes(RESIDUAL_SIGNATURE_ERROR)) {
    report(
      `警告：Electron bundle 严格签名校验未通过，保留当前可启动链路，请人工处理：${initialVerification.output}`,
    );
    return;
  }

  report("检测到 Electron bundle 缺少 CodeResources，开始执行本地 ad-hoc 重签名");

  try {
    execFileSync("codesign", ["--force", "--deep", "--sign", "-", appPath], {
      stdio: "inherit",
    });
  } catch (error) {
    report(
      `警告：Electron bundle 重签名失败，当前仍可尝试启动，但严格签名校验未通过：${formatExecError(error) || error.message}`,
    );
    return;
  }

  const finalVerification = verifyBundleSignature(appPath);
  if (finalVerification.ok) {
    report("Electron bundle 重签名完成，严格签名校验已通过");
    return;
  }

  report(
    `警告：Electron bundle 重签名后严格签名校验仍未通过，当前仍可尝试启动：${finalVerification.output}`,
  );
}

if (process.platform !== "darwin") {
  report("非 macOS 环境，跳过 Electron bundle 结构校正");
  process.exit(0);
}

const requireFromHere = createRequire(import.meta.url);
const electronPackageJsonPath = requireFromHere.resolve("electron/package.json");
const electronPackageDir = dirname(electronPackageJsonPath);
const electronRequire = createRequire(electronPackageJsonPath);

const electronPackage = JSON.parse(readFileSync(electronPackageJsonPath, "utf8"));
const { downloadArtifact } = electronRequire("@electron/get");
const checksums = electronRequire("./checksums.json");

const distDir = process.env.ELECTRON_OVERRIDE_DIST_PATH ?? join(electronPackageDir, "dist");
const frameworkLinkPath = join(
  distDir,
  "Electron.app",
  "Contents",
  "Frameworks",
  "Electron Framework.framework",
  "Electron Framework",
);
const electronAppPath = join(distDir, "Electron.app");

if (!hasValidFrameworkSymlink(frameworkLinkPath)) {
  report("检测到 Electron Framework symlink 缺失，开始使用 ditto 重新解压官方 zip");

  const zipPath = await downloadArtifact({
    version: electronPackage.version,
    artifactName: "electron",
    platform: "darwin",
    arch: process.arch,
    cacheRoot: process.env.electron_config_cache,
    checksums,
  });

  rmSync(distDir, { recursive: true, force: true });
  execFileSync("ditto", ["-x", "-k", zipPath, distDir], {
    stdio: "inherit",
  });

  if (!hasValidFrameworkSymlink(frameworkLinkPath)) {
    throw new Error("Electron bundle 修复后仍缺少 framework symlink");
  }

  report("Electron bundle 结构修复完成");
} else {
  report("Electron Framework symlink 正常");
}

ensureBundleSignature(electronAppPath);
