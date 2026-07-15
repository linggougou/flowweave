import { describe, expect, it } from "vitest";

import { resolvePlaywrightBrowsersPath } from "./env-setup.js";

describe("resolvePlaywrightBrowsersPath", () => {
  it("打包应用优先使用 Resources 内置浏览器", () => {
    expect(
      resolvePlaywrightBrowsersPath({
        defaultApp: false,
        exists: (path) => path.endsWith("/ms-playwright"),
        platform: "darwin",
        resourcesPath: "/Applications/FlowWeave.app/Contents/Resources",
      }),
    ).toBe("/Applications/FlowWeave.app/Contents/Resources/ms-playwright");
  });

  it("macOS 开发态保留 Playwright 默认缓存发现逻辑", () => {
    expect(
      resolvePlaywrightBrowsersPath({
        defaultApp: true,
        exists: () => false,
        platform: "darwin",
        resourcesPath: "/Applications/Electron.app/Contents/Resources",
      }),
    ).toBeUndefined();
  });
});
