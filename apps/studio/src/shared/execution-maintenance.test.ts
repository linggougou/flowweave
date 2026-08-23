import { describe, expect, it } from "vitest";
import type { ExecutionSummary } from "./studio-api-types.js";
import { resolveExecutionSelectionAfterDeletion } from "./execution-maintenance.js";

const item = (executionId: string): ExecutionSummary => ({
  executionId,
  flowId: "flow_orders",
  status: "passed",
});

describe("删除执行后的选择恢复", () => {
  it("删除当前项时优先选择原位置下一条较旧记录，并可补入原第 6 条", () => {
    const previous = ["e1", "e2", "e3", "e4", "e5"].map(item);
    const refreshed = ["e1", "e2", "e3", "e4", "e6"].map(item);
    expect(resolveExecutionSelectionAfterDeletion(previous, refreshed, "e5", "e5")).toBe("e6");
  });

  it("没有较旧记录时选择上一条较新记录", () => {
    expect(
      resolveExecutionSelectionAfterDeletion(["e1", "e2"].map(item), ["e2"].map(item), "e1", "e1"),
    ).toBe("e2");
  });

  it("删除非当前项保持选择，空列表归零", () => {
    expect(
      resolveExecutionSelectionAfterDeletion(["e1", "e2"].map(item), ["e1"].map(item), "e2", "e1"),
    ).toBe("e1");
    expect(resolveExecutionSelectionAfterDeletion([item("e1")], [], "e1", "e1")).toBeNull();
  });
});
