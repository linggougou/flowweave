import { describe, expect, it } from "vitest";

import { FLOW_SCHEMA_VERSION } from "@flowweave/shared";
import type { FlowDocument } from "@flowweave/flow-dsl";

import {
  buildExecutionFragilityIssues,
  resolveExecutionFlow,
} from "./execution-fragility.js";

function sampleFlow(): FlowDocument {
  return {
    schemaVersion: FLOW_SCHEMA_VERSION,
    id: "flow_history_fragility",
    projectId: "project_history_fragility",
    name: "历史 fragility 复原",
    variables: [
      {
        name: "username",
        type: "string",
        required: true,
      },
    ],
    steps: [
      {
        id: "s1",
        type: "navigate",
        url: "/dashboard",
      },
      {
        id: "s2",
        type: "fill",
        target: {
          strategies: [{ kind: "css", selector: "#username" }],
        },
        value: "{{username}}",
      },
    ],
    meta: {
      createdAt: "2026-06-06T00:00:00.000Z",
      updatedAt: "2026-06-06T00:00:00.000Z",
      source: "manual",
    },
  };
}

describe("buildExecutionFragilityIssues", () => {
  it("历史执行缺少 baseUrl 时继续报 MISSING_ENVIRONMENT", () => {
    const issues =
      buildExecutionFragilityIssues(sampleFlow(), {
        environmentName: "默认环境",
        variables: {
          username: "alice",
        },
      }) ?? [];

    expect(issues.some((issue) => issue.code === "MISSING_ENVIRONMENT")).toBe(true);
  });

  it("历史执行变量缺失时继续报 MISSING_VARIABLE", () => {
    const issues =
      buildExecutionFragilityIssues(sampleFlow(), {
        environmentName: "预发已登录",
        baseUrl: "https://staging.example.com",
        variables: {},
      }) ?? [];

    expect(issues.some((issue) => issue.code === "MISSING_VARIABLE")).toBe(true);
  });

  it("历史执行存在 baseUrl 和变量时不再误报上下文错误", () => {
    const issues =
      buildExecutionFragilityIssues(sampleFlow(), {
        environmentName: "预发已登录",
        baseUrl: "https://staging.example.com",
        variables: {
          username: "alice",
        },
      }) ?? [];

    const codes = issues.map((issue) => issue.code);
    expect(codes).not.toContain("MISSING_ENVIRONMENT");
    expect(codes).not.toContain("MISSING_VARIABLE");
  });

  it("历史执行优先使用执行当时的 Flow 快照", () => {
    const currentFlow: FlowDocument = {
      ...sampleFlow(),
      steps: [
        {
          id: "s1",
          type: "navigate",
          url: "https://staging.example.com/dashboard",
        },
        {
          id: "s2",
          type: "fill",
          target: {
            strategies: [{ kind: "css", selector: "#username" }],
          },
          value: "alice",
        },
      ],
      variables: [],
    };

    const issues =
      buildExecutionFragilityIssues(
        resolveExecutionFlow(sampleFlow(), currentFlow),
        {
          environmentName: "默认环境",
          variables: {},
        },
      ) ?? [];

    const codes = issues.map((issue) => issue.code);
    expect(codes).toContain("MISSING_ENVIRONMENT");
    expect(codes).toContain("MISSING_VARIABLE");
  });
});
