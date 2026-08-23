import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { ExecutionResult } from "@flowweave/project-knowledge";
import {
  EmptyWorkspaceGuide,
  ExecutionResultSummary,
  WorkspaceBreadcrumb,
} from "./business-view.js";

const failedExecution: ExecutionResult = {
  executionId: "execution-contract-uuid",
  flowId: "flow-contract-uuid",
  status: "failed",
  startedAt: "2026-08-23T08:00:00.000Z",
  finishedAt: "2026-08-23T08:00:03.000Z",
  steps: [
    { stepIndex: 0, stepId: "open", status: "passed", durationMs: 800 },
    {
      stepIndex: 1,
      stepId: "submit",
      status: "failed",
      durationMs: 2200,
      errorMessage: "locator.waitFor: Timeout 30000ms exceeded",
      diagnosticPath: "/tmp/raw-diagnostic.json",
    },
  ],
};

describe("Web 业务结果视图", () => {
  it("用人话展示失败主因、一个建议与步骤摘要", () => {
    const html = renderToStaticMarkup(
      <ExecutionResultSummary execution={failedExecution} taskName="提交每日报表" />,
    );

    expect(html).toContain("失败");
    expect(html).toContain("页面在预期时间内没有准备好");
    expect(html).toContain("建议");
    expect(html).toContain("2 个步骤");
    expect(html.match(/建议/g)).toHaveLength(1);
    expect(html).not.toContain("locator.waitFor");
    expect(html).not.toContain("execution-contract-uuid");
  });

  it("空状态明确引导打开 Studio 并去浏览器录制", () => {
    const html = renderToStaticMarkup(<EmptyWorkspaceGuide kind="projects" />);

    expect(html).toContain("打开织流 Studio");
    expect(html).toContain("打开浏览器扩展开始录制");
  });

  it("主区提供项目、任务、当前视图上下文", () => {
    const html = renderToStaticMarkup(
      <WorkspaceBreadcrumb
        projectName="财务运营"
        taskName="提交每日报表"
        viewName="最近运行结果"
      />,
    );

    expect(html).toContain("财务运营");
    expect(html).toContain("提交每日报表");
    expect(html).toContain("最近运行结果");
    expect(html).toContain('aria-label="当前位置"');
  });
});
