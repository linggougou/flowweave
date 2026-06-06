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
  it("对 runtime-error 诊断展示通用步骤错误元信息", () => {
    const html = renderToStaticMarkup(
      <DiagnosticInspector
        steps={[
          buildStep({
            stepIndex: 2,
            stepId: "s3",
            label: "等待支付弹层",
            message: "wait 条件 visible 需要 target",
            diagnostic: {
              kind: "runtime-error",
              stepId: "s3",
              stepIndex: 2,
              stepType: "wait",
              message: "wait 条件 visible 需要 target",
              errorCode: "WAIT_TARGET_REQUIRED",
              cause: "缺少 target",
              url: "https://staging.example.com/orders",
              title: "订单页",
            } as unknown as ExecutionStepLog["diagnostic"],
          }),
        ]}
        selectedStepIndex={2}
        onSelectStepIndex={() => {}}
        onOpenPath={() => {}}
      />,
    );

    expect(html).toContain("诊断工作台");
    expect(html).toContain("步骤类型");
    expect(html).toContain("wait");
    expect(html).toContain("错误码");
    expect(html).toContain("WAIT_TARGET_REQUIRED");
    expect(html).toContain("诊断消息");
    expect(html).toContain("wait 条件 visible 需要 target");
    expect(html).toContain("https://staging.example.com/orders");
    expect(html).toContain("订单页");
    expect(html).not.toContain("定位策略尝试");
    expect(html).not.toContain("目标提示");
  });

  it("对动作后状态被页面重置的 runtime-error 展示更具体的洞察与建议", () => {
    const html = renderToStaticMarkup(
      <DiagnosticInspector
        steps={[
          buildStep({
            stepIndex: 3,
            stepId: "s4",
            label: "填写订单备注",
            message: "fill 后目标值未稳定写入",
            stepType: "fill",
            diagnostic: {
              kind: "runtime-error",
              stepId: "s4",
              stepIndex: 3,
              stepType: "fill",
              message: "fill 后目标值未稳定写入",
              errorCode: "RUNTIME_STEP_FAILED",
              cause: "fill-value-reset",
              url: "https://staging.example.com/orders/edit",
              title: "订单编辑页",
            } as unknown as ExecutionStepLog["diagnostic"],
          }),
        ]}
        selectedStepIndex={3}
        onSelectStepIndex={() => {}}
        onOpenPath={() => {}}
      />,
    );

    expect(html).toContain("输入值被页面重置");
    expect(html).toContain("核对输入后是否被页面回写");
    expect(html).toContain("受控字段");
    expect(html).toContain("blur");
    expect(html).toContain("fill-value-reset");
  });

  it("对广义 runtimeCauseCategory 展示根因分类与恢复次数", () => {
    const html = renderToStaticMarkup(
      <DiagnosticInspector
        steps={[
          buildStep({
            stepIndex: 4,
            stepId: "s5",
            label: "确认发布动作",
            message:
              "locator.click: <div class=\"dialog-mask\">…</div> intercepts pointer events",
            stepType: "click",
            diagnostic: {
              kind: "runtime-error",
              stepId: "s5",
              stepIndex: 4,
              stepType: "click",
              message:
                "locator.click: <div class=\"dialog-mask\">…</div> intercepts pointer events",
              errorCode: "RUNTIME_STEP_FAILED",
              runtimeCauseCategory: "intercepted",
              recoveryTried: true,
              recoveredAttemptCount: 1,
              url: "https://staging.example.com/orders/publish",
              title: "订单发布页",
            } as unknown as ExecutionStepLog["diagnostic"],
          }),
        ]}
        selectedStepIndex={4}
        onSelectStepIndex={() => {}}
        onOpenPath={() => {}}
      />,
    );

    expect(html).toContain("目标被遮挡或点击面被拦截");
    expect(html).toContain("先清掉遮挡层再操作最终控件");
    expect(html).toContain("根因分类");
    expect(html).toContain("intercepted");
    expect(html).toContain("恢复状态");
    expect(html).toContain("已尝试恢复");
    expect(html).toContain("恢复次数");
    expect(html).toContain("runtime 已尝试恢复 1 次");
  });

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
