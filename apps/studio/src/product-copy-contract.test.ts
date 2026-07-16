import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

describe("Studio 首次任务文案", () => {
  it("空项目引导不暴露开发命令、端口或源码目录", () => {
    const source = readFileSync(fileURLToPath(new URL("./FlowEmptyGuide.tsx", import.meta.url)), "utf8");

    expect(source).not.toMatch(/pnpm|3847|apps\/extension/);
    expect(source).toContain("录制第一个自动化任务");
    expect(source).toContain("保存到 Studio");
  });
});
