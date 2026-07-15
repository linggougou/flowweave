import { describe, expect, it } from "vitest";

import { resolveStudioResourcePaths } from "./resource-paths.js";

describe("resolveStudioResourcePaths", () => {
  it("开发环境继续使用 monorepo 内的 native binding 与登录 fixture", () => {
    const paths = resolveStudioResourcePaths({
      isPackaged: false,
      moduleUrl: "file:///repo/apps/studio/dist-electron/services.mjs",
      resourcesPath: "/Applications/Electron.app/Contents/Resources",
    });

    expect(paths.electronNativeBindingPath).toBe(
      "/repo/apps/studio/dist-electron/native/better_sqlite3.node",
    );
    expect(paths.loginFixturePath).toBe("/repo/examples/fixtures/login.html");
  });

  it("打包环境从 Contents/Resources 读取额外资源", () => {
    const paths = resolveStudioResourcePaths({
      isPackaged: true,
      moduleUrl:
        "file:///Applications/FlowWeave.app/Contents/Resources/app.asar/dist-electron/services.mjs",
      resourcesPath: "/Applications/FlowWeave.app/Contents/Resources",
    });

    expect(paths.electronNativeBindingPath).toBe(
      "/Applications/FlowWeave.app/Contents/Resources/native/better_sqlite3.node",
    );
    expect(paths.loginFixturePath).toBe(
      "/Applications/FlowWeave.app/Contents/Resources/examples/fixtures/login.html",
    );
  });
});
