import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const appSource = readFileSync(fileURLToPath(new URL("./App.tsx", import.meta.url)), "utf8");

describe("Web 产品合同", () => {
  it("默认进入最近运行结果，而不是版本或专业信息", () => {
    expect(appSource).toContain('useState<MainTab>("executions")');
    expect(appSource).toContain("最近运行结果");
    expect(appSource).toContain("专业日志");
  });

  it("默认业务层不再使用 Flow、UUID 与原始状态作为识别信息", () => {
    expect(appSource).not.toContain(">Flow<");
    expect(appSource).not.toContain("flow-item-id");
    expect(appSource).not.toContain("execution-history-id");
    expect(appSource).not.toContain("item.status}");
  });
});
