import { describe, expect, it, vi } from "vitest";

import { getStudioApi, mapExecutionStatusToStudio } from "./studio-client.js";

describe("Studio HTTP fallback 执行状态映射", () => {
  it("保留 cancelled，不把用户取消误报为失败", () => {
    expect(mapExecutionStatusToStudio("cancelled")).toBe("cancelled");
    expect(mapExecutionStatusToStudio("success")).toBe("passed");
    expect(mapExecutionStatusToStudio("failed")).toBe("failed");
  });
});

describe("Studio 原生文件能力", () => {
  it("Browser fallback 明确关闭 native file portability", () => {
    vi.stubGlobal("window", {});

    expect(getStudioApi().nativeFilePortability).toBe(false);

    vi.unstubAllGlobals();
  });
});
