import { describe, expect, it } from "vitest";

import type { ExecutionStepLog } from "./studio-api-types.js";
import { buildFailureInsight } from "./failure-insights.js";

function buildStep(overrides?: Partial<ExecutionStepLog>): ExecutionStepLog {
  return {
    stepIndex: 1,
    stepId: "s2",
    label: "点击保存",
    status: "failed",
    message: "定位失败",
    startedAt: "2026-06-07T00:02:00.000Z",
    finishedAt: "2026-06-07T00:02:02.000Z",
    diagnosticPath: "/tmp/step-1-diagnostic.json",
    screenshotPath: "/tmp/step-1.png",
    pageSnapshotPath: "/tmp/page-1.json",
    diagnostic: {
      stepId: "s2",
      stepIndex: 1,
      url: "https://staging.example.com/orders",
      title: "订单页",
      strategyAttempts: [],
    },
    pageSnapshot: {
      url: "https://staging.example.com/orders",
      title: "订单页",
      formCount: 1,
      buttonCount: 3,
      linkCount: 2,
      capturedAt: "2026-06-07T00:02:02.000Z",
    },
    ...overrides,
  };
}

describe("buildFailureInsight", () => {
  it("对 runtime-error 诊断输出可读的执行失败摘要", () => {
    const insight = buildFailureInsight(
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
    );

    expect(insight).toMatchObject({
      category: "execution-error",
      categoryLabel: "执行报错",
      title: "先查看当前错误反馈",
    });
    expect(insight?.summary).toContain("wait");
    expect(insight?.summary).toContain("WAIT_TARGET_REQUIRED");
    expect(insight?.summary).toContain("wait 条件 visible 需要 target");
    expect(insight?.recommendedAction).toBeUndefined();
  });

  it("对先失败后成功的通过步骤降级为备用策略告警语义", () => {
    const insight = buildFailureInsight(
      buildStep({
        status: "passed",
        message: "备用策略兜底成功",
        diagnostic: {
          stepId: "s2",
          stepIndex: 1,
          url: "https://staging.example.com/orders",
          title: "订单页",
          strategyAttempts: [
            {
              label: "role=button[name=保存]",
              matchedCount: 4,
              visibleCount: 3,
              success: false,
              error: "strict mode violation: locator resolved to 4 elements",
            },
            {
              label: "css=[data-testid=save-button]",
              matchedCount: 1,
              visibleCount: 1,
              success: true,
            },
          ],
        },
      }),
    );

    expect(insight).toMatchObject({
      category: "fallback-success",
      categoryLabel: "备用策略已命中",
      title: "备用策略兜底成功",
    });
    expect(insight?.summary).toContain("本次执行已通过");
    expect(insight?.summary).toContain("css=[data-testid=save-button]");
  });

  it("把目标过宽的失败整理成前移摘要、页面摘要和 artifact 清单", () => {
    const insight = buildFailureInsight(
      buildStep({
        diagnostic: {
          stepId: "s2",
          stepIndex: 1,
          url: "https://staging.example.com/orders",
          title: "订单页",
          strategyAttempts: [
            {
              label: "role=button[name=保存]",
              matchedCount: 4,
              visibleCount: 3,
              success: false,
              error: "strict mode violation: locator resolved to 4 elements",
            },
          ],
          targetHints: {
            tagName: "button",
            labelText: "保存",
            textSample: "保存并提交",
          },
        },
      }),
    );

    expect(insight).toMatchObject({
      category: "ambiguous-target",
      categoryLabel: "目标不唯一",
      title: "先收窄目标范围",
      pageSummary: "订单页 · 表单 1 · 按钮 3 · 链接 2",
    });
    expect(insight?.summary).toContain("4 个候选");
    expect(insight?.recommendedAction).toContain("更稳定的 name、label 或 testId");
    expect(insight?.artifacts.map((item) => item.label)).toEqual([
      "诊断 JSON",
      "页面快照",
      "步骤截图",
    ]);
  });

  it("把命中但不可见的失败识别为页面状态问题", () => {
    const insight = buildFailureInsight(
      buildStep({
        diagnostic: {
          stepId: "s2",
          stepIndex: 1,
          url: "https://staging.example.com/orders",
          title: "订单页",
          strategyAttempts: [
            {
              label: "css=.drawer .save",
              matchedCount: 1,
              visibleCount: 0,
              success: false,
              error: "Timeout 3000ms exceeded while waiting for locator",
            },
          ],
        },
      }),
    );

    expect(insight).toMatchObject({
      category: "hidden-target",
      categoryLabel: "目标不可见",
      title: "先让目标进入可见状态",
    });
    expect(insight?.summary).toContain("1 个候选");
    expect(insight?.summary).toContain("不可见");
  });

  it("在只有页面快照时也能给出可直接阅读的摘要", () => {
    const insight = buildFailureInsight(
      buildStep({
        status: "passed",
        message: undefined,
        diagnosticPath: undefined,
        screenshotPath: undefined,
        diagnostic: undefined,
        pageSnapshotPath: "/tmp/page-1.json",
      }),
    );

    expect(insight).toMatchObject({
      category: "page-snapshot",
      categoryLabel: "页面快照可用",
      title: "先核对页面当前状态",
      pageSummary: "订单页 · 表单 1 · 按钮 3 · 链接 2",
    });
    expect(insight?.summary).toContain("没有可直接读取的策略诊断");
    expect(insight?.artifacts.map((item) => item.label)).toEqual(["页面快照"]);
  });
});
