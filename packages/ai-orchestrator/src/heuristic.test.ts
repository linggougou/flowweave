import { describe, expect, it } from "vitest";
import { generateFlowFromPrompt } from "./generate.js";

describe("generateFlowFromPrompt", () => {
  it("登录类 prompt 生成多步 Flow", async () => {
    const { flow, source } = await generateFlowFromPrompt("打开登录页并完成登录", {
      projectId: "proj_ai",
      baseUrl: "file:///tmp/login.html",
    });
    expect(source).toBe("heuristic");
    expect(flow.steps.length).toBeGreaterThanOrEqual(4);
    expect(flow.meta.source).toBe("ai");
  });
});
