import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { ExecutionStepLog } from "./shared/studio-api-types.js";
import { DiagnosticInspector } from "./DiagnosticInspector.js";

function buildStep(overrides?: Partial<ExecutionStepLog>): ExecutionStepLog {
  return {
    stepIndex: 0,
    stepId: "s1",
    label: "点击登录按钮",
    status: "failed",
    message: "定位失败",
    startedAt: "2026-06-07T00:01:00.000Z",
    finishedAt: "2026-06-07T00:01:01.000Z",
    diagnosticPath: "/tmp/step-0-diagnostic.json",
    screenshotPath: "/tmp/step-0.png",
    pageSnapshotPath: "/tmp/page-0.json",
    diagnostic: {
      stepId: "s1",
      stepIndex: 0,
      url: "https://staging.example.com/login",
      title: "登录页",
      strategyAttempts: [
        {
          label: "role=button[name=登录]",
          matchedCount: 0,
          visibleCount: 0,
          success: false,
          error: "未找到元素",
        },
        {
          label: "css=#submit",
          matchedCount: 1,
          visibleCount: 1,
          success: true,
        },
      ],
      targetHints: {
        tagName: "button",
        textSample: "登录",
        labelText: "提交登录",
      },
    },
    pageSnapshot: {
      url: "https://staging.example.com/login",
      title: "登录页",
      formCount: 1,
      buttonCount: 2,
      linkCount: 1,
      capturedAt: "2026-06-07T00:01:01.000Z",
    },
    ...overrides,
  };
}

describe("DiagnosticInspector", () => {
  it("把诊断信息提升为更适合排障的工作台视图", () => {
    const html = renderToStaticMarkup(
      <DiagnosticInspector
        steps={[buildStep()]}
        selectedStepIndex={0}
        onSelectStepIndex={() => {}}
        onOpenPath={() => {}}
      />,
    );

    expect(html).toContain("诊断工作台");
    expect(html).toContain("失败类别");
    expect(html).toContain("当前页未找到目标");
    expect(html).toContain("页面快照摘要");
    expect(html).toContain("登录页 · 表单 1 · 按钮 2 · 链接 1");
    expect(html).toContain("修复建议");
    expect(html).toContain("诊断 JSON");
    expect(html).toContain("页面快照");
    expect(html).toContain("步骤截图");
    expect(html).toContain("testId");
    expect(html).toContain("提交登录");
  });

  it("在歧义目标场景下展示作用域线索和重新录制提示", () => {
    const html = renderToStaticMarkup(
      <DiagnosticInspector
        steps={[
          buildStep({
            label: "编辑订单行",
            diagnostic: {
              stepId: "s2",
              stepIndex: 1,
              url: "https://staging.example.com/orders",
              title: "订单列表",
              strategyAttempts: [
                {
                  label: "role=button[name=编辑]",
                  matchedCount: 2,
                  visibleCount: 2,
                  success: false,
                  error: "候选评分并列，无法唯一确认目标",
                },
              ],
              targetHints: {
                tagName: "button",
                labelText: "编辑",
                scopeKind: "row",
                scopeText: "订单 A-102 / 张三",
              },
            },
            pageSnapshot: {
              url: "https://staging.example.com/orders",
              title: "订单列表",
              formCount: 1,
              buttonCount: 6,
              linkCount: 2,
              capturedAt: "2026-06-07T00:04:01.000Z",
            },
          }),
        ]}
        selectedStepIndex={0}
        onSelectStepIndex={() => {}}
        onOpenPath={() => {}}
      />,
    );

    expect(html).toContain("歧义线索");
    expect(html).toContain("作用域类型");
    expect(html).toContain("列表行");
    expect(html).toContain("作用域文本");
    expect(html).toContain("订单 A-102 / 张三");
    expect(html).toContain("候选并列");
    expect(html).toContain("重新录制到正确列表行");
  });
});
