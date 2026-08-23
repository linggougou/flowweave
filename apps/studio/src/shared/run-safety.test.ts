import { describe, expect, it } from "vitest";

import type { FlowDocument } from "@flowweave/flow-dsl";
import { FLOW_SCHEMA_VERSION } from "@flowweave/shared";

import { buildRunConfirmationSummary, classifyHighRiskActions } from "./run-safety.js";

const flow: FlowDocument = {
  schemaVersion: FLOW_SCHEMA_VERSION,
  id: "flow_safe_run",
  projectId: "project_safe_run",
  name: "提交并发送订单",
  variables: [],
  steps: [
    { id: "s1", type: "navigate", url: "/orders/new" },
    {
      id: "s2",
      label: "保存草稿",
      type: "click",
      target: {
        strategies: [{ kind: "role", role: "button", name: "保存" }],
        hints: { labelText: "保存" },
      },
    },
    {
      id: "s3",
      label: "删除旧订单",
      type: "click",
      target: {
        strategies: [{ kind: "text", text: "删除" }],
      },
    },
    {
      id: "s4",
      label: "发送通知",
      type: "press",
      key: "Enter",
    },
  ],
  meta: {
    createdAt: "2026-08-23T00:00:00.000Z",
    updatedAt: "2026-08-23T00:00:00.000Z",
    source: "manual",
  },
};

describe("安全运行摘要", () => {
  it("汇总任务、目标域名、环境、步骤数与去重后的高风险动作", () => {
    expect(
      buildRunConfirmationSummary(flow, {
        environmentName: "预发环境",
        baseUrl: "https://staging.example.com/app/",
      }),
    ).toEqual({
      flowId: "flow_safe_run",
      taskName: "提交并发送订单",
      domains: ["staging.example.com"],
      environmentName: "预发环境",
      stepCount: 4,
      highRiskActions: [
        { kind: "save", label: "保存", stepIndexes: [1] },
        { kind: "delete", label: "删除", stepIndexes: [2] },
        { kind: "send", label: "发送", stepIndexes: [3] },
      ],
      requiresConfirmation: true,
    });
  });

  it("不会把 fill 的值或变量内容带入风险描述", () => {
    const sensitiveFlow: FlowDocument = {
      ...flow,
      name: "填写登录信息",
      steps: [
        {
          id: "secret",
          type: "fill",
          label: "填写密码",
          value: "{{secret_password}}",
          target: { strategies: [{ kind: "css", selector: "#password" }] },
        },
      ],
    };

    const actions = classifyHighRiskActions(sensitiveFlow.steps);

    expect(actions).toEqual([]);
    expect(JSON.stringify(actions)).not.toContain("secret_password");
  });

  it("识别提交动作但不读取输入值", () => {
    expect(
      classifyHighRiskActions([
        {
          id: "submit",
          type: "click",
          label: "提交审批",
          target: { strategies: [{ kind: "role", role: "button", name: "确认提交" }] },
        },
      ]),
    ).toEqual([{ kind: "submit", label: "提交", stepIndexes: [0] }]);
  });
});
