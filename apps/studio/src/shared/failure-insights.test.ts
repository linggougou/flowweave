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

  it.each([
    {
      cause: "fill-value-reset",
      stepType: "fill",
      message: "fill 后目标值未稳定写入",
      categoryLabel: "输入值被页面重置",
      title: "核对输入后是否被页面回写",
      actionFragment: "blur",
      summaryFragment: "受控字段",
    },
    {
      cause: "select-value-reset",
      stepType: "select",
      message: "select 后选中值未稳定保留",
      categoryLabel: "下拉选项被页面重置",
      title: "核对下拉值是否被联动改回",
      actionFragment: "option value",
      summaryFragment: "默认值",
    },
    {
      cause: "checked-state-reset",
      stepType: "setChecked",
      message: "setChecked 后勾选状态未稳定保留",
      categoryLabel: "勾选状态被页面重置",
      title: "核对勾选状态是否被脚本撤销",
      actionFragment: "同组单选/复选",
      summaryFragment: "互斥",
    },
    {
      cause: "upload-files-reset",
      stepType: "upload",
      message: "upload 后文件列表未稳定保留",
      categoryLabel: "上传文件被页面清空",
      title: "核对上传控件是否被页面重建",
      actionFragment: "input[type=file]",
      summaryFragment: "重渲染",
    },
  ])("对 $cause cause 输出更可行动的失败洞察", (scenario) => {
    const insight = buildFailureInsight(
      buildStep({
        label: "更新表单字段",
        message: scenario.message,
        diagnostic: {
          kind: "runtime-error",
          stepId: "s3",
          stepIndex: 2,
          stepType: scenario.stepType as NonNullable<ExecutionStepLog["stepType"]>,
          message: scenario.message,
          errorCode: "RUNTIME_STEP_FAILED",
          cause: scenario.cause,
          url: "https://staging.example.com/orders/edit",
          title: "订单编辑页",
        } as unknown as ExecutionStepLog["diagnostic"],
      }),
    );

    expect(insight).toMatchObject({
      category: "action-state-reset",
      categoryLabel: scenario.categoryLabel,
      title: scenario.title,
    });
    expect(insight?.summary).toContain(scenario.message);
    expect(insight?.summary).toContain(scenario.summaryFragment);
    expect(insight?.recommendedAction).toContain(scenario.actionFragment);
  });

  it.each([
    {
      runtimeCauseCategory: "detached",
      message: "locator.click: Element is not attached to the DOM",
      categoryLabel: "目标节点已重挂载",
      title: "重新对准最终渲染后的控件",
      summaryFragment: "重渲染了目标",
      actionFragment: "最终渲染后的按钮",
      recoveryFragment: "已尝试恢复 1 次",
    },
    {
      runtimeCauseCategory: "intercepted",
      message: "locator.click: <div class=\"mask\">…</div> intercepts pointer events",
      categoryLabel: "目标被遮挡或点击面被拦截",
      title: "先清掉遮挡层再操作最终控件",
      summaryFragment: "遮罩",
      actionFragment: "遮罩层",
      recoveryFragment: "已尝试恢复 1 次",
    },
    {
      runtimeCauseCategory: "not-ready",
      message: "locator.click: element is not visible",
      categoryLabel: "目标还没进入可操作状态",
      title: "补一条更明确的就绪等待",
      summaryFragment: "不可见",
      actionFragment: "loading",
      recoveryFragment: "未触发恢复重试",
    },
    {
      runtimeCauseCategory: "not-editable",
      message: "locator.fill: element is not editable",
      categoryLabel: "目标不是当前可编辑控件",
      title: "重新对准真实可编辑控件",
      summaryFragment: "只读壳层",
      actionFragment: "contenteditable",
      recoveryFragment: "已尝试恢复 1 次",
    },
    {
      runtimeCauseCategory: "unknown",
      message: "locator.click: unknown runtime failure",
      categoryLabel: "运行时根因仍不明确",
      title: "先打开诊断产物确认失败阶段",
      summaryFragment: "还不能把这次失败稳定归类",
      actionFragment: "diagnostic JSON",
      recoveryFragment: "未触发恢复重试",
    },
  ])("对 $runtimeCauseCategory 根因输出更具体的 runtime 洞察", (scenario) => {
    const insight = buildFailureInsight(
      buildStep({
        label: "提交动作",
        message: scenario.message,
        diagnostic: {
          kind: "runtime-error",
          stepId: "s5",
          stepIndex: 4,
          stepType: "click",
          message: scenario.message,
          errorCode: "RUNTIME_STEP_FAILED",
          runtimeCauseCategory: scenario.runtimeCauseCategory,
          recoveryTried: scenario.recoveryFragment.includes("已尝试"),
          recoveredAttemptCount: scenario.recoveryFragment.includes("已尝试") ? 1 : 0,
          url: "https://staging.example.com/orders/edit",
          title: "订单编辑页",
        } as unknown as ExecutionStepLog["diagnostic"],
      }),
    );

    expect(insight).toMatchObject({
      category: "runtime-cause",
      categoryLabel: scenario.categoryLabel,
      title: scenario.title,
    });
    expect(insight?.summary).toContain(scenario.summaryFragment);
    expect(insight?.summary).toContain(scenario.recoveryFragment);
    expect(insight?.recommendedAction).toContain(scenario.actionFragment);
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

  it("把候选并列失败总结成更可执行的歧义洞察", () => {
    const insight = buildFailureInsight(
      buildStep({
        label: "编辑订单行",
        diagnostic: {
          stepId: "s6",
          stepIndex: 5,
          url: "https://staging.example.com/orders",
          title: "订单列表",
          strategyAttempts: [
            {
              label: "role=button[name=编辑]",
              matchedCount: 2,
              visibleCount: 2,
              success: false,
              error: "候选评分并列，无法唯一确认目标",
              ambiguityReason: "最高分 40 并列，无法唯一确定候选",
              candidateSummaries: [
                {
                  index: 0,
                  score: 40,
                  visible: true,
                  scopeKind: "row",
                  scopeText: "订单 A-102 / 张三",
                  labelText: "编辑",
                  textSample: "编辑订单",
                  matchedHints: ["scopeText", "labelText"],
                },
                {
                  index: 1,
                  score: 40,
                  visible: true,
                  scopeKind: "row",
                  scopeText: "订单 A-103 / 李四",
                  labelText: "编辑",
                  textSample: "编辑订单",
                  matchedHints: ["scopeText", "labelText"],
                },
              ],
            },
          ],
          targetHints: {
            tagName: "button",
            labelText: "编辑",
            scopeKind: "row",
            scopeText: "订单 A-103 / 李四",
          },
        },
      }),
    );

    expect(insight).toMatchObject({
      category: "ambiguous-target",
      categoryLabel: "目标不唯一",
      title: "重新录制到正确列表行",
    });
    expect(insight?.summary).toContain("最高分 40 并列，无法唯一确定候选");
    expect(insight?.summary).toContain("scopeText、labelText");
    expect(insight?.summary).toContain("仍不足");
    expect(insight?.recommendedAction).toContain("订单 A-103 / 李四");
  });

  it("对单个成功策略里的消歧命中输出可执行洞察，而不是退回通用摘要", () => {
    const insight = buildFailureInsight(
      buildStep({
        status: "passed",
        message: "runtime 已从多个候选中收窄到唯一目标",
        label: "编辑订单行",
        diagnostic: {
          stepId: "s7",
          stepIndex: 6,
          url: "https://staging.example.com/orders",
          title: "订单列表",
          strategyAttempts: [
            {
              label: "role=button[name=编辑]",
              matchedCount: 2,
              visibleCount: 2,
              success: true,
              selectedIndex: 1,
              candidateSummaries: [
                {
                  index: 0,
                  score: 34,
                  visible: true,
                  scopeKind: "row",
                  scopeText: "订单 A-102 / 张三",
                  labelText: "编辑",
                  matchedHints: ["labelText"],
                },
                {
                  index: 1,
                  score: 46,
                  visible: true,
                  scopeKind: "row",
                  scopeText: "订单 A-103 / 李四",
                  labelText: "编辑",
                  matchedHints: ["scopeText", "labelText", "tagName"],
                },
              ],
            },
          ],
          targetHints: {
            tagName: "button",
            labelText: "编辑",
            scopeKind: "row",
            scopeText: "订单 A-103 / 李四",
          },
        },
      }),
    );

    expect(insight).toMatchObject({
      category: "disambiguated-target",
      categoryLabel: "已完成候选收窄",
      title: "补强已选中列表行的唯一线索",
    });
    expect(insight?.summary).toContain("选中了候选 #2");
    expect(insight?.summary).toContain("scopeText、labelText、tagName");
    expect(insight?.summary).toContain("仍有 2 个相似候选");
    expect(insight?.recommendedAction).toContain("订单 A-103 / 李四");
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
