import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function platformExecutableName(platform) {
  switch (platform) {
    case "darwin":
    case "mas":
      return "Electron.app/Contents/MacOS/Electron";
    case "win32":
      return "electron.exe";
    default:
      return "electron";
  }
}

function resolveElectronExecutable({ electronPackageDir, env, platform }) {
  let executableName;
  try {
    executableName = readFileSync(join(electronPackageDir, "path.txt"), "utf8").trim();
  } catch {
    executableName = env.ELECTRON_OVERRIDE_DIST_PATH ? platformExecutableName(platform) : "";
  }

  if (!executableName) {
    return undefined;
  }

  const distPath = env.ELECTRON_OVERRIDE_DIST_PATH ?? join(electronPackageDir, "dist");
  const executablePath = join(distPath, executableName);
  return existsSync(executablePath) ? executablePath : undefined;
}

export function ensureElectronInstallation({
  electronPackageDir,
  env = process.env,
  execFileSyncImpl = execFileSync,
  nodeExecutable = process.execPath,
  onInstall = () => {},
  platform = process.platform,
}) {
  const existingExecutable = resolveElectronExecutable({
    electronPackageDir,
    env,
    platform,
  });
  if (existingExecutable) {
    return existingExecutable;
  }

  onInstall();
  const installEnv = { ...env };
  delete installEnv.ELECTRON_SKIP_BINARY_DOWNLOAD;
  execFileSyncImpl(nodeExecutable, [join(electronPackageDir, "install.js")], {
    cwd: electronPackageDir,
    env: installEnv,
    stdio: "inherit",
  });

  const installedExecutable = resolveElectronExecutable({
    electronPackageDir,
    env: installEnv,
    platform,
  });
  if (!installedExecutable) {
    throw new Error("Electron 官方安装脚本执行后仍缺少可执行文件");
  }

  return installedExecutable;
}
