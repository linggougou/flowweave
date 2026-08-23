import { describe, expect, it } from "vitest";
import {
  isCurrentVersionRequest,
  isMatchingExecutionDeletionResult,
} from "./maintenance-request-guards.js";

describe("维护请求上下文守卫", () => {
  it("v1 慢响应不能覆盖后来选择的 v2", () => {
    expect(
      isCurrentVersionRequest({
        requestId: 1,
        latestRequestId: 2,
        projectId: "p1",
        selectedProjectId: "p1",
        flowId: "f1",
        selectedFlowId: "f1",
        versionId: "v1",
        selectedVersionId: "v2",
      }),
    ).toBe(false);
    expect(
      isCurrentVersionRequest({
        requestId: 2,
        latestRequestId: 2,
        projectId: "p1",
        selectedProjectId: "p1",
        flowId: "f1",
        selectedFlowId: "f1",
        versionId: "v2",
        selectedVersionId: "v2",
      }),
    ).toBe(true);
  });

  it("删除伪响应的项目或 execution 不匹配时拒绝更新", () => {
    expect(
      isMatchingExecutionDeletionResult(
        {
          projectId: "p2",
          executionId: "e1",
          status: "deleted",
          artifacts: "deleted",
        },
        "p1",
        "e1",
      ),
    ).toBe(false);
    expect(
      isMatchingExecutionDeletionResult(
        {
          projectId: "p1",
          executionId: "e2",
          status: "already-absent",
          artifacts: "untouched",
        },
        "p1",
        "e1",
      ),
    ).toBe(false);
  });
});
