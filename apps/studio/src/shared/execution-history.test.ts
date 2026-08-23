import { describe, expect, it } from "vitest";

import type { FlowDocument } from "@flowweave/flow-dsl";
import type { ExecutionWithProject } from "@flowweave/project-knowledge";
import { FLOW_SCHEMA_VERSION } from "@flowweave/shared";

import {
  mapStoredExecutionToStudioExecution,
  shouldUseCachedExecution,
} from "./execution-history.js";

function buildFlow(options?: Partial<FlowDocument>): FlowDocument {
  return {
    schemaVersion: FLOW_SCHEMA_VERSION,
    id: "flow_history_mapping",
    projectId: "project_history_mapping",
    name: "历史执行映射",
    variables: [],
    steps: [
      {
        id: "s1",
        label: "历史导航",
        type: "navigate",
        url: "/orders",
      },
      {
        id: "s2",
        label: "历史填写用户名",
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
    ...options,
  };
}

function buildExecution(
  overrides?: Partial<ExecutionWithProject>,
): ExecutionWithProject {
  return {
    executionId: "exec_history_mapping",
    projectId: "project_history_mapping",
    flowId: "flow_history_mapping",
    status: "failed",
    startedAt: "2026-06-06T00:01:00.000Z",
    finishedAt: "2026-06-06T00:01:05.000Z",
    flowSnapshot: buildFlow(),
    runContext: {
      environmentName: "预发环境",
      variables: {},
    },
    steps: [
      {
        stepIndex: 0,
        stepId: "s1",
        status: "passed",
      },
      {
        stepIndex: 1,
        stepId: "s2",
        status: "failed",
        errorMessage: "变量缺失",
        diagnosticPath: "/tmp/diag.json",
      },
    ],
    ...overrides,
  };
}

describe("mapStoredExecutionToStudioExecution", () => {
  it("把知识库 cancelled 状态保留为已取消", () => {
    const execution = mapStoredExecutionToStudioExecution(
      buildExecution({ status: "cancelled" }),
    );

    expect(execution.status).toBe("cancelled");
  });

  it("优先使用执行当时的 Flow 快照生成步骤标签与 fragility", () => {
    const currentFlow = buildFlow({
      steps: [
        {
          id: "s1",
          label: "当前导航",
          type: "navigate",
          url: "https://example.com/orders",
        },
        {
          id: "s2",
          label: "当前填写用户名",
          type: "fill",
          target: {
            strategies: [{ kind: "css", selector: "#username" }],
          },
          value: "alice",
        },
      ],
      variables: [],
    });

    const execution = mapStoredExecutionToStudioExecution(buildExecution(), {
      fallbackFlow: currentFlow,
    });

    expect(execution.steps[0]?.label).toBe("历史导航");
    expect(execution.steps[1]?.label).toBe("历史填写用户名");
    expect(execution.fragilityIssues?.map((issue) => issue.code)).toContain("MISSING_ENVIRONMENT");
    expect(execution.fragilityIssues?.map((issue) => issue.code)).toContain("MISSING_VARIABLE");
  });

  it("允许调用方在公共映射之上补充步骤扩展字段", () => {
    const execution = mapStoredExecutionToStudioExecution(buildExecution(), {
      decorateStep: (step) => ({
        diagnostic: step.diagnosticPath
          ? {
              stepId: step.stepId,
              stepIndex: step.stepIndex,
              url: "https://example.com/orders",
              title: "订单页",
              strategyAttempts: [],
            }
          : undefined,
        pageSnapshotPath: "/tmp/page-1.json",
        pageSnapshot: {
          url: "https://example.com/orders",
          title: "订单页",
          formCount: 1,
          buttonCount: 2,
          linkCount: 3,
          capturedAt: "2026-06-06T00:01:02.000Z",
        },
      }),
    });

    expect(execution.steps[1]?.diagnosticPath).toBe("/tmp/diag.json");
    expect(execution.steps[1]?.diagnostic?.title).toBe("订单页");
    expect(execution.steps[1]?.pageSnapshotPath).toBe("/tmp/page-1.json");
    expect(execution.steps[1]?.pageSnapshot?.buttonCount).toBe(2);
  });
});

describe("shouldUseCachedExecution", () => {
  it("缺少 Flow 快照时不允许直接命中缓存", () => {
    const studioExecution = mapStoredExecutionToStudioExecution(
      buildExecution({
        flowSnapshot: undefined,
      }),
      {
        fallbackFlow: buildFlow(),
      },
    );

    expect(shouldUseCachedExecution(studioExecution)).toBe(false);
  });

  it("Flow 不依赖环境与变量时，即使缺少 runContext 也允许复用缓存", () => {
    const standaloneFlow = buildFlow({
      steps: [
        {
          id: "s1",
          label: "绝对地址导航",
          type: "navigate",
          url: "https://example.com/orders",
        },
      ],
      variables: [],
    });
    const studioExecution = mapStoredExecutionToStudioExecution(
      buildExecution({
        flowSnapshot: standaloneFlow,
        runContext: undefined,
        steps: [
          {
            stepIndex: 0,
            stepId: "s1",
            status: "passed",
          },
        ],
      }),
    );

    expect(shouldUseCachedExecution(studioExecution)).toBe(true);
  });
});
