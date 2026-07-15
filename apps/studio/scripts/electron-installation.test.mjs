import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { ensureElectronInstallation } from "./electron-installation.mjs";

const temporaryDirectories = [];

function createElectronPackage() {
  const electronPackageDir = mkdtempSync(join(tmpdir(), "flowweave-electron-installation-test-"));
  temporaryDirectories.push(electronPackageDir);
  writeFileSync(join(electronPackageDir, "install.js"), "", "utf8");
  return electronPackageDir;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("ensureElectronInstallation", () => {
  it("Electron 可执行文件已存在时直接复用且不重复安装", () => {
    const electronPackageDir = createElectronPackage();
    mkdirSync(join(electronPackageDir, "dist"), { recursive: true });
    writeFileSync(join(electronPackageDir, "path.txt"), "electron", "utf8");
    writeFileSync(join(electronPackageDir, "dist", "electron"), "", "utf8");

    const executablePath = ensureElectronInstallation({
      electronPackageDir,
      execFileSyncImpl() {
        throw new Error("不应重复执行 Electron 安装脚本");
      },
      platform: "linux",
    });

    expect(executablePath).toBe(join(electronPackageDir, "dist", "electron"));
  });

  it("Electron 可执行文件缺失时调用官方安装脚本并返回安装结果", () => {
    const electronPackageDir = createElectronPackage();
    const calls = [];

    const executablePath = ensureElectronInstallation({
      electronPackageDir,
      env: { ELECTRON_SKIP_BINARY_DOWNLOAD: "1" },
      execFileSyncImpl(command, args, options) {
        calls.push({ command, args, options });
        mkdirSync(join(electronPackageDir, "dist"), { recursive: true });
        writeFileSync(join(electronPackageDir, "path.txt"), "electron", "utf8");
        writeFileSync(join(electronPackageDir, "dist", "electron"), "", "utf8");
      },
      nodeExecutable: "/test/node",
      platform: "linux",
    });

    expect(executablePath).toBe(join(electronPackageDir, "dist", "electron"));
    expect(calls).toHaveLength(1);
    expect(calls[0].command).toBe("/test/node");
    expect(calls[0].args).toEqual([join(electronPackageDir, "install.js")]);
    expect(calls[0].options.env).not.toHaveProperty("ELECTRON_SKIP_BINARY_DOWNLOAD");
  });

  it("官方安装脚本结束后仍缺少可执行文件时明确失败", () => {
    const electronPackageDir = createElectronPackage();

    expect(() =>
      ensureElectronInstallation({
        electronPackageDir,
        execFileSyncImpl() {},
        platform: "linux",
      }),
    ).toThrow("Electron 官方安装脚本执行后仍缺少可执行文件");
  });
});
