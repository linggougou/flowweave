import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { StudioExecution } from "./shared/studio-api-types.js";
import { ExecutionResultSummary } from "./ExecutionResultSummary.js";

describe("Studio 运行结果摘要", () => {
  it("失败时先展示业务原因与一个建议，不暴露底层错误", () => {
    const execution: StudioExecution = {
      executionId: "execution-sensitive-uuid",
      projectId: "project-uuid",
      flowId: "flow-uuid",
      status: "failed",
      startedAt: "2026-08-23T08:00:00.000Z",
      finishedAt: "2026-08-23T08:00:02.000Z",
      steps: [
        {
          stepIndex: 0,
          stepId: "submit",
          label: "提交报表",
          status: "failed",
          startedAt: "2026-08-23T08:00:00.000Z",
          finishedAt: "2026-08-23T08:00:02.000Z",
          message: "locator.waitFor: timeout",
        },
      ],
    };

    const html = renderToStaticMarkup(
      <ExecutionResultSummary execution={execution} taskName="提交每日报表" />,
    );

    expect(html).toContain("失败");
    expect(html).toContain("提交报表");
    expect(html).toContain("建议");
    expect(html).not.toContain("locator.waitFor");
    expect(html).not.toContain("execution-sensitive-uuid");
  });
});
