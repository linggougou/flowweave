import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** 在加载 @flowweave/runtime / playwright 之前固定浏览器缓存目录（Electron 下路径偶发不一致） */
export function setupPlaywrightEnv(): void {
  if (process.env.PLAYWRIGHT_BROWSERS_PATH) {
    return;
  }

  const localAppData = process.env.LOCALAPPDATA;
  const browsersPath =
    process.platform === "win32" && localAppData
      ? join(localAppData, "ms-playwright")
      : join(homedir(), ".cache", "ms-playwright");

  process.env.PLAYWRIGHT_BROWSERS_PATH = browsersPath;
}

/** Windows 上 headed Chromium 可执行文件路径（revision 与 playwright@1.60 一致） */
export function getWindowsChromiumExe(): string {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH ?? join(homedir(), "AppData", "Local", "ms-playwright");
  return join(base, "chromium-1223", "chrome-win64", "chrome.exe");
}

export function isChromiumInstalled(): boolean {
  if (process.platform === "win32") {
    return existsSync(getWindowsChromiumExe());
  }
  return true;
}

setupPlaywrightEnv();
