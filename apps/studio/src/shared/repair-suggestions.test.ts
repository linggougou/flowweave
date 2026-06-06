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
