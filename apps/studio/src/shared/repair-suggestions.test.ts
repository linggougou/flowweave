import { describe, expect, it } from "vitest";

import type { FragilityIssue } from "@flowweave/page-intelligence";

import type { ExecutionStepLog } from "./studio-api-types.js";
import {
  buildDiagnosticRepairSuggestions,
  buildFragilityRepairSuggestions,
} from "./repair-suggestions.js";

function buildStep(overrides?: Partial<ExecutionStepLog>): ExecutionStepLog {
  return {
    stepIndex: 2,
    stepId: "s3",
    label: "填写备注",
    status: "failed",
    message: "定位失败",
    startedAt: "2026-06-07T00:03:00.000Z",
    finishedAt: "2026-06-07T00:03:01.000Z",
    diagnostic: {
      stepId: "s3",
      stepIndex: 2,
      url: "https://staging.example.com/orders",
      title: "订单页",
      strategyAttempts: [],
    },
    ...overrides,
  };
}

describe("buildFragilityRepairSuggestions", () => {
  it("把缺少环境与变量的问题转成明确修复动作", () => {
    const warnings: FragilityIssue[] = [
      {
        stepId: "s1",
        stepIndex: 0,
        code: "MISSING_ENVIRONMENT",
        message: "流程包含相对地址，但当前没有可用 baseUrl，真实页面回放会直接失败",
        severity: "error",
      },
      {
        stepId: "s2",
        stepIndex: 1,
        code: "MISSING_VARIABLE",
        message: "步骤引用了缺失变量：username、otp",
        severity: "error",
      },
    ];

    const suggestions = buildFragilityRepairSuggestions(warnings);

    expect(suggestions).toEqual([
      expect.objectContaining({
        code: "MISSING_ENVIRONMENT",
        severity: "error",
        title: "先补运行环境",
        action: expect.stringContaining("Base URL"),
        stepNumbers: [1],
      }),
      expect.objectContaining({
        code: "MISSING_VARIABLE",
        severity: "error",
        title: "补齐缺失变量",
        action: expect.stringContaining("运行面板"),
        reason: expect.stringContaining("username、otp"),
        stepNumbers: [2],
      }),
    ]);
  });
});

describe("buildDiagnosticRepairSuggestions", () => {
  it.each([
    {
      cause: "fill-value-reset",
      stepType: "fill",
      message: "fill 后目标值未稳定写入",
      title: "核对输入后是否被页面回写",
      actionFragment: "blur",
      reasonFragment: "受控字段",
    },
    {
      cause: "select-value-reset",
      stepType: "select",
      message: "select 后选中值未稳定保留",
      title: "核对下拉值是否被联动改回",
      actionFragment: "option value",
      reasonFragment: "默认值",
    },
    {
      cause: "checked-state-reset",
      stepType: "setChecked",
      message: "setChecked 后勾选状态未稳定保留",
      title: "核对勾选状态是否被脚本撤销",
      actionFragment: "同组单选/复选",
      reasonFragment: "互斥",
    },
    {
      cause: "upload-files-reset",
      stepType: "upload",
      message: "upload 后文件未稳定保留",
      title: "核对上传控件是否被页面重建",
      actionFragment: "input[type=file]",
      reasonFragment: "重渲染",
    },
  ])("对 $cause cause 输出专用修复建议", (scenario) => {
    const suggestions = buildDiagnosticRepairSuggestions(
      buildStep({
        label: "更新字段状态",
        message: scenario.message,
        stepType: scenario.stepType as NonNullable<ExecutionStepLog["stepType"]>,
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

    expect(suggestions[0]).toMatchObject({
      source: "runtime-cause",
      severity: "error",
      title: scenario.title,
    });
    expect(suggestions[0]?.action).toContain(scenario.actionFragment);
    expect(suggestions[0]?.reason).toContain(scenario.reasonFragment);
    expect(suggestions[0]?.reason).toContain(scenario.message);
  });

  it.each([
    {
      runtimeCauseCategory: "detached",
      message: "locator.click: Element is not attached to the DOM",
      title: "重新对准最终渲染后的控件",
      actionFragment: "最终渲染后的按钮",
      reasonFragment: "重渲染了目标",
      recoveryFragment: "已尝试恢复 1 次",
    },
    {
      runtimeCauseCategory: "intercepted",
      message: "locator.click: <div class=\"mask\">…</div> intercepts pointer events",
      title: "先清掉遮挡层再操作最终控件",
      actionFragment: "遮罩层",
      reasonFragment: "遮罩",
      recoveryFragment: "已尝试恢复 1 次",
    },
    {
      runtimeCauseCategory: "not-ready",
      message: "locator.click: element is not visible",
      title: "补一条更明确的就绪等待",
      actionFragment: "loading",
      reasonFragment: "不可见",
      recoveryFragment: "未触发恢复重试",
    },
    {
      runtimeCauseCategory: "not-editable",
      message: "locator.fill: element is not editable",
      title: "重新对准真实可编辑控件",
      actionFragment: "contenteditable",
      reasonFragment: "只读壳层",
      recoveryFragment: "已尝试恢复 1 次",
    },
    {
      runtimeCauseCategory: "unknown",
      message: "locator.click: unknown runtime failure",
      title: "先打开诊断产物确认失败阶段",
      actionFragment: "diagnostic JSON",
      reasonFragment: "还不能把这次失败稳定归类",
      recoveryFragment: "未触发恢复重试",
    },
  ])("对 $runtimeCauseCategory 输出广义 runtime 修复建议", (scenario) => {
    const suggestions = buildDiagnosticRepairSuggestions(
      buildStep({
        label: "提交动作",
        message: scenario.message,
        stepType: "click",
        diagnostic: {
          kind: "runtime-error",
          stepId: "s8",
          stepIndex: 7,
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

    expect(suggestions[0]).toMatchObject({
      source: "runtime-cause",
      severity: "error",
      title: scenario.title,
    });
    expect(suggestions[0]?.action).toContain(scenario.actionFragment);
    expect(suggestions[0]?.reason).toContain(scenario.reasonFragment);
    expect(suggestions[0]?.reason).toContain(scenario.recoveryFragment);
  });

  it("把失败策略错误转成收窄范围和可见性修复动作", () => {
    const suggestions = buildDiagnosticRepairSuggestions(
      buildStep({
        diagnostic: {
          stepId: "s3",
          stepIndex: 2,
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
              label: "css=.drawer .save",
              matchedCount: 1,
              visibleCount: 0,
              success: false,
              error: "Timeout 3000ms exceeded while waiting for locator",
            },
          ],
          targetHints: {
            tagName: "select",
            labelText: "任务状态",
            textSample: "待审核",
          },
        },
      }),
    );

    expect(suggestions.some((item) => item.title === "先收窄目标范围")).toBe(true);
    expect(
      suggestions.some(
        (item) =>
          item.title === "先让目标进入可见状态" &&
          item.action.includes("展开面板") &&
          item.reason.includes("css=.drawer .save"),
      ),
    ).toBe(true);
    expect(
      suggestions.some(
        (item) =>
          item.title === "核对下拉选项值与文案" &&
          item.action.includes("option value") &&
          item.reason.includes("任务状态"),
      ),
    ).toBe(true);
  });

  it("对候选并列且已带列表行线索的歧义失败，提示重新录制到正确行", () => {
    const suggestions = buildDiagnosticRepairSuggestions(
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
            },
          ],
          targetHints: {
            tagName: "button",
            labelText: "编辑",
            scopeKind: "row",
            scopeText: "订单 A-102 / 张三",
          },
        },
      }),
    );

    expect(
      suggestions.some(
        (item) =>
          item.title === "重新录制到正确列表行" &&
          item.action.includes("订单 A-102 / 张三") &&
          item.reason.includes("候选并列"),
      ),
    ).toBe(true);
  });

  it("对多命中但缺少作用域线索的失败，提示补上上下文后再重录", () => {
    const suggestions = buildDiagnosticRepairSuggestions(
      buildStep({
        label: "保存订单",
        diagnostic: {
          stepId: "s7",
          stepIndex: 6,
          url: "https://staging.example.com/orders",
          title: "订单列表",
          strategyAttempts: [
            {
              label: "role=button[name=保存]",
              matchedCount: 4,
              visibleCount: 4,
              success: false,
              error: "strict mode violation: locator resolved to 4 elements",
            },
          ],
          targetHints: {
            tagName: "button",
            labelText: "保存",
          },
        },
      }),
    );

    expect(
      suggestions.some(
        (item) =>
          item.title === "补上作用域线索后再重录" &&
          item.action.includes("列表行、卡片或弹层") &&
          item.reason.includes("没有记录到"),
      ),
    ).toBe(true);
  });

  it("对上传控件给出重新对准真实 input 的建议", () => {
    const suggestions = buildDiagnosticRepairSuggestions(
      buildStep({
        label: "上传简历",
        diagnostic: {
          stepId: "s4",
          stepIndex: 3,
          url: "https://staging.example.com/profile",
          title: "资料页",
          strategyAttempts: [
            {
              label: "css=.upload-trigger",
              matchedCount: 0,
              visibleCount: 0,
              success: false,
              error: "Timeout 3000ms exceeded while waiting for locator",
            },
          ],
          targetHints: {
            tagName: "input",
            inputType: "file",
            nameAttr: "resume",
            labelText: "上传简历",
          },
        },
      }),
    );

    expect(
      suggestions.some(
        (item) =>
          item.title === "确认上传步骤仍指向真实文件控件" &&
          item.action.includes("input[type=file]") &&
          item.reason.includes("上传简历"),
      ),
    ).toBe(true);
  });

  it("对富文本或自定义输入容器给出可编辑区域提示", () => {
    const suggestions = buildDiagnosticRepairSuggestions(
      buildStep({
        diagnostic: {
          stepId: "s5",
          stepIndex: 4,
          url: "https://staging.example.com/orders",
          title: "订单备注",
          strategyAttempts: [
            {
              label: "text=请填写备注",
              matchedCount: 0,
              visibleCount: 0,
              success: false,
              error: "未找到元素",
            },
          ],
          targetHints: {
            tagName: "div",
            labelText: "备注",
            textSample: "请填写备注",
          },
        },
      }),
    );

    expect(
      suggestions.some(
        (item) =>
          item.title === "确认是否命中富文本或自定义输入区域" &&
          item.action.includes("可编辑容器") &&
          item.reason.includes("备注"),
      ),
    ).toBe(true);
  });
});
