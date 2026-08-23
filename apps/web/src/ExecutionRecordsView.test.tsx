import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { ExecutionResult } from "@flowweave/project-knowledge";
import { ExecutionRecordsView } from "./ExecutionRecordsView.js";

const newest: ExecutionResult = {
  executionId: "execution-newest",
  flowId: "flow-a",
  status: "success",
  startedAt: "2026-08-23T09:00:00.000Z",
  finishedAt: "2026-08-23T09:00:02.000Z",
  steps: [{ stepIndex: 0, stepId: "new-step", status: "passed" }],
};

const older: ExecutionResult = {
  executionId: "execution-older",
  flowId: "flow-a",
  status: "failed",
  startedAt: "2026-08-22T09:00:00.000Z",
  finishedAt: "2026-08-22T09:00:03.000Z",
  steps: [
    {
      stepIndex: 0,
      stepId: "old-step",
      status: "failed",
      errorMessage: "timeout",
      diagnosticPath: "/tmp/older.json",
    },
  ],
};

function findButtonIn(
  node: ReactNode,
  label: string,
): ReactElement<{ onClick: () => void }> | undefined {
  if (isValidElement(node)) {
    const element = node as ReactElement<{ children?: ReactNode; onClick?: () => void }>;
    const html = renderToStaticMarkup(element);
    if (element.type === "button" && html.includes(label)) {
      return element as ReactElement<{ onClick: () => void }>;
    }
    const children = element.props.children;
    for (const child of Array.isArray(children) ? children : [children]) {
      const found = child ? findButtonIn(child, label) : undefined;
      if (found) return found;
    }
  }
  return undefined;
}

function findButton(node: ReactNode, label: string): ReactElement<{ onClick: () => void }> {
  const found = findButtonIn(node, label);
  if (found) return found;
  throw new Error(`没有找到按钮：${label}`);
}

describe("Web 运行记录交互一致性", () => {
  it("点击较早记录会回传该记录标识", () => {
    const onSelect = vi.fn();
    const view = ExecutionRecordsView({
      taskName: "提交每日报表",
      executions: [newest, older],
      selectedExecutionId: newest.executionId,
      executionDetail: newest,
      detailLoading: false,
      onSelect,
    });

    findButton(view, "较早记录 1").props.onClick();
    expect(onSelect).toHaveBeenCalledWith(older.executionId);
  });

  it("切到较早记录的加载期间，摘要使用所选摘要且专业区不展示旧详情", () => {
    const html = renderToStaticMarkup(
      <ExecutionRecordsView
        taskName="提交每日报表"
        executions={[newest, older]}
        selectedExecutionId={older.executionId}
        executionDetail={newest}
        detailLoading
        onSelect={vi.fn()}
      />,
    );

    expect(html).toContain("页面在预期时间内没有准备好");
    expect(html).toContain("正在加载所选运行记录");
    expect(html).not.toContain("execution-newest");
    expect(html).not.toContain("new-step");
  });

  it("详情匹配后摘要、专业日志与标识均来自同一条较早记录", () => {
    const html = renderToStaticMarkup(
      <ExecutionRecordsView
        taskName="提交每日报表"
        executions={[newest, older]}
        selectedExecutionId={older.executionId}
        executionDetail={older}
        detailLoading={false}
        onSelect={vi.fn()}
      />,
    );

    expect(html).toContain("页面在预期时间内没有准备好");
    expect(html).toContain("execution-older");
    expect(html).toContain("old-step");
    expect(html).not.toContain("execution-newest");
    expect(html).not.toContain("new-step");
  });
});
