import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const studioRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const requireFromTest = createRequire(import.meta.url);

describe("Studio v1 macOS 发布配置", () => {
  it("应用版本、打包脚本与发布标识保持 v1 口径", () => {
    const packageJson = JSON.parse(readFileSync(join(studioRoot, "package.json"), "utf8"));
    const config = requireFromTest("../electron-builder.config.cjs");

    expect(packageJson.version).toBe("1.0.0");
    expect(packageJson.scripts["package:dir"]).toContain("electron-builder");
    expect(packageJson.scripts["package:mac"]).toContain("dmg");
    expect(config.appId).toBe("com.flowweave.studio");
    expect(config.productName).toBe("织流 Studio");
    expect(config.directories.output).toBe("release");
    expect(config.afterPack).toEqual(expect.any(Function));
  });

  it("只收集运行产物并把 native binding 与 fixture 复制到 Resources", () => {
    const config = requireFromTest("../electron-builder.config.cjs");

    expect(config.files).toEqual(expect.arrayContaining(["dist/**/*", "dist-electron/**/*"]));
    expect(config.extraResources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          from: "dist-electron/native",
          to: "native",
        }),
        expect.objectContaining({
          from: "../../examples/fixtures/login.html",
          to: "examples/fixtures/login.html",
        }),
        expect.objectContaining({
          to: expect.stringMatching(/^ms-playwright\/chromium-\d+$/),
        }),
        expect.objectContaining({
          to: expect.stringMatching(/^ms-playwright\/chromium_headless_shell-\d+$/),
        }),
      ]),
    );
    expect(config.mac.identity).toBeNull();
  });
});
