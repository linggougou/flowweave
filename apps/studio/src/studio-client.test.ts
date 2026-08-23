import { describe, expect, it } from "vitest";

import { mapExecutionStatusToStudio } from "./studio-client.js";

describe("Studio HTTP fallback 执行状态映射", () => {
  it("保留 cancelled，不把用户取消误报为失败", () => {
    expect(mapExecutionStatusToStudio("cancelled")).toBe("cancelled");
    expect(mapExecutionStatusToStudio("success")).toBe("passed");
    expect(mapExecutionStatusToStudio("failed")).toBe("failed");
  });
});
