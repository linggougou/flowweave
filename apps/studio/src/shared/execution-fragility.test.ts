import { describe, expect, it } from "vitest";

import { FLOW_SCHEMA_VERSION } from "@flowweave/shared";
import type { FlowDocument } from "@flowweave/flow-dsl";

import {
  buildExecutionCompatibilityWarnings,
  buildExecutionFragilityIssues,
  hasFragilityRelevantRunContext,
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

describe("buildExecutionCompatibilityWarnings", () => {
  it("缺少 Flow 快照与运行上下文时提示旧记录边界", () => {
    const warnings = buildExecutionCompatibilityWarnings({});
    const codes = warnings.map((warning) => warning.code);

    expect(codes).toEqual(["FLOW_SNAPSHOT_MISSING", "RUN_CONTEXT_MISSING"]);
  });

  it("仅缺少运行上下文时只提示上下文不完整", () => {
    const warnings = buildExecutionCompatibilityWarnings({
      flowSnapshot: sampleFlow(),
    });

    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.code).toBe("RUN_CONTEXT_MISSING");
  });

  it("Flow 快照与运行上下文完整时不再提示兼容边界", () => {
    const warnings = buildExecutionCompatibilityWarnings({
      flowSnapshot: sampleFlow(),
      runContext: {
        environmentName: "预发已登录",
        baseUrl: "https://staging.example.com",
        variables: {
          username: "alice",
        },
      },
    });

    expect(warnings).toEqual([]);
  });

  it("只有环境名但缺少 baseUrl 与变量时，仍提示上下文不完整", () => {
    const warnings = buildExecutionCompatibilityWarnings({
      flowSnapshot: sampleFlow(),
      runContext: {
        environmentName: "仅名称环境",
      },
    });

    expect(warnings.map((warning) => warning.code)).toContain("RUN_CONTEXT_MISSING");
  });

  it("不依赖环境与变量的旧记录，不应误报上下文不完整", () => {
    const standaloneFlow: FlowDocument = {
      ...sampleFlow(),
      steps: [
        {
          id: "s1",
          type: "navigate",
          url: "https://example.com/dashboard",
        },
      ],
      variables: [],
    };

    const warnings = buildExecutionCompatibilityWarnings({
      flowSnapshot: standaloneFlow,
    });

    expect(warnings).toEqual([]);
  });

  it("仅在说明字段出现字面变量占位符时，不应误报上下文不完整", () => {
    const previewOnlyFlow: FlowDocument = {
      ...sampleFlow(),
      steps: [
        {
          id: "s1",
          label: "说明 {{preview-only}}",
          type: "click",
          target: {
            strategies: [{ kind: "role", role: "button", name: "保存" }],
            hints: {
              labelText: "{{hint-only}}",
              textSample: "{{sample-only}}",
            },
          },
        },
      ],
      variables: [],
    };

    const warnings = buildExecutionCompatibilityWarnings({
      flowSnapshot: previewOnlyFlow,
    });

    expect(warnings).toEqual([]);
  });

  it("变量已有默认值时，缺少运行上下文也不应误报", () => {
    const defaultVariableFlow: FlowDocument = {
      ...sampleFlow(),
      steps: [
        {
          id: "s1",
          type: "navigate",
          url: "https://example.com/dashboard",
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
      variables: [
        {
          name: "username",
          type: "string",
          required: false,
          defaultValue: "alice",
        },
      ],
    };

    const warnings = buildExecutionCompatibilityWarnings({
      flowSnapshot: defaultVariableFlow,
    });

    expect(warnings).toEqual([]);
  });
});

describe("hasFragilityRelevantRunContext", () => {
  it("不依赖环境与变量的 Flow，不应误报上下文不完整", () => {
    const standaloneFlow: FlowDocument = {
      ...sampleFlow(),
      steps: [
        {
          id: "s1",
          type: "navigate",
          url: "https://example.com/dashboard",
        },
      ],
      variables: [],
    };

    expect(
      hasFragilityRelevantRunContext(
        {
          environmentName: "仅名称环境",
        },
        standaloneFlow,
      ),
    ).toBe(true);
  });

  it("Flow 不依赖环境与变量时，即使 runContext 缺失也视为上下文充分", () => {
    const standaloneFlow: FlowDocument = {
      ...sampleFlow(),
      steps: [
        {
          id: "s1",
          type: "navigate",
          url: "https://example.com/dashboard",
        },
      ],
      variables: [],
    };

    expect(hasFragilityRelevantRunContext(undefined, standaloneFlow)).toBe(true);
  });
});
