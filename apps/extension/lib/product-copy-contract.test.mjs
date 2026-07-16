import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";

import { describe, expect, it } from "vitest";

describe("扩展首次连接文案", () => {
  it("离线恢复不要求用户理解开发环境", () => {
    const mainSource = readFileSync(
      fileURLToPath(new URL("../entrypoints/sidepanel/main.ts", import.meta.url)),
      "utf8",
    );
    const htmlSource = readFileSync(
      fileURLToPath(new URL("../entrypoints/sidepanel/index.html", import.meta.url)),
      "utf8",
    );

    expect(`${mainSource}\n${htmlSource}`).not.toMatch(/pnpm|3847|dev:web/);
    expect(mainSource).toContain("未连接织流 Studio");
    expect(htmlSource).toContain("保存到 Studio");
  });
});
