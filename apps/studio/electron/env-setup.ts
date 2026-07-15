import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join } from "node:path";

export function resolvePlaywrightBrowsersPath({
  defaultApp,
  exists = existsSync,
  resourcesPath,
}: {
  defaultApp?: boolean;
  exists?: (path: string) => boolean;
  platform: NodeJS.Platform;
  resourcesPath?: string;
}): string | undefined {
  if (defaultApp === false && resourcesPath) {
    const bundledPath = join(resourcesPath, "ms-playwright");
    if (exists(bundledPath)) {
      return bundledPath;
    }
  }
  return undefined;
}

/** 在加载 @flowweave/runtime / playwright 之前固定浏览器缓存目录（Electron 下路径偶发不一致） */
export function setupPlaywrightEnv(): void {
  if (process.env.PLAYWRIGHT_BROWSERS_PATH) {
    return;
  }

  const bundledPath = resolvePlaywrightBrowsersPath({
    defaultApp: process.defaultApp,
    platform: process.platform,
    resourcesPath: process.resourcesPath,
  });
  if (bundledPath) {
    process.env.PLAYWRIGHT_BROWSERS_PATH = bundledPath;
    return;
  }

  const localAppData = process.env.LOCALAPPDATA;
  if (process.platform === "win32" && localAppData) {
    process.env.PLAYWRIGHT_BROWSERS_PATH = join(localAppData, "ms-playwright");
  }
}

/** Windows 上 headed Chromium 可执行文件路径（revision 与 playwright@1.60 一致） */
export function getWindowsChromiumExe(): string {
  const base =
    process.env.PLAYWRIGHT_BROWSERS_PATH ?? join(homedir(), "AppData", "Local", "ms-playwright");
  return join(base, "chromium-1223", "chrome-win64", "chrome.exe");
}

export function isChromiumInstalled(): boolean {
  try {
    const requireFromHere = createRequire(import.meta.url);
    const { chromium } = requireFromHere("playwright") as {
      chromium: { executablePath(): string };
    };
    return existsSync(chromium.executablePath());
  } catch {
    return false;
  }
}

setupPlaywrightEnv();
