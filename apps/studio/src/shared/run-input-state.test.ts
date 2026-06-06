import { describe, expect, it } from "vitest";

import type { FlowDocument } from "@flowweave/flow-dsl";
import { FLOW_SCHEMA_VERSION } from "@flowweave/shared";

import {
  buildVariableInputsForFlow,
  buildRunDraftState,
  collectRunPreflightIssues,
  shouldRestoreRecentRunInput,
} from "./run-input-state.js";

function buildFlow(): FlowDocument {
  return {
    schemaVersion: FLOW_SCHEMA_VERSION,
    id: "flow_run_input_state",
    projectId: "project_run_input_state",
    name: "运行输入状态",
    variables: [
      {
        name: "username",
        type: "string",
        required: true,
      },
      {
        name: "retryCount",
        type: "number",
        required: false,
        defaultValue: 1,
      },
      {
        name: "rememberMe",
        type: "boolean",
        required: false,
      },
    ],
    steps: [
      {
        id: "s1",
        type: "navigate",
        url: "/orders",
      },
    ],
    meta: {
      createdAt: "2026-06-07T00:00:00.000Z",
      updatedAt: "2026-06-07T00:00:00.000Z",
      source: "manual",
    },
  };
}

describe("buildRunDraftState", () => {
  it("能用最近一次执行输入回填环境与变量草稿", () => {
    const restored = buildRunDraftState(buildFlow(), {
      executionId: "exec_recent_input",
      environmentName: "预发已登录",
      baseUrl: "https://staging.example.com/app",
      storageStatePath: "/tmp/flowweave/state.json",
      variables: {
        username: "alice",
        retryCount: "3",
        rememberMe: "true",
      },
    });

    expect(restored).toEqual({
      selectedEnvironmentName: "预发已登录",
      baseUrlDraft: "https://staging.example.com/app",
      storageStatePathDraft: "/tmp/flowweave/state.json",
      variableInputs: {
        username: "alice",
        retryCount: "3",
        rememberMe: "true",
      },
    });
  });
});

describe("buildVariableInputsForFlow", () => {
  it("同一个 Flow 重新加载时保留当前草稿值", () => {
    const inputs = buildVariableInputsForFlow(buildFlow(), {
      previousFlowId: "flow_run_input_state",
      previous: {
        username: "alice",
        retryCount: "5",
        rememberMe: "true",
      },
    });

    expect(inputs).toEqual({
      username: "alice",
      retryCount: "5",
      rememberMe: "true",
    });
  });

  it("切换到其他 Flow 时不继承上一个 Flow 的草稿值", () => {
    const inputs = buildVariableInputsForFlow(buildFlow(), {
      previousFlowId: "flow_previous",
      previous: {
        username: "alice",
        retryCount: "5",
        rememberMe: "true",
      },
    });

    expect(inputs).toEqual({
      username: "",
      retryCount: "1",
      rememberMe: "",
    });
  });
});

describe("shouldRestoreRecentRunInput", () => {
  it("只有当前文档与选中的 Flow 一致时才允许恢复最近运行输入", () => {
    expect(shouldRestoreRecentRunInput(buildFlow(), "flow_run_input_state")).toBe(true);
    expect(shouldRestoreRecentRunInput(buildFlow(), "flow_other")).toBe(false);
    expect(shouldRestoreRecentRunInput(null, "flow_run_input_state")).toBe(false);
  });
});

describe("collectRunPreflightIssues", () => {
  it("在运行前阻断缺少 baseUrl 和必填变量的场景", () => {
    const issues = collectRunPreflightIssues(buildFlow(), {
      baseUrl: "",
      storageStatePath: "",
      variables: {
        username: "   ",
        retryCount: "1",
      },
    });

    expect(issues).toEqual([
      {
        code: "MISSING_BASE_URL",
        field: "baseUrl",
        message: "当前 Flow 含相对地址步骤，运行前必须填写 Base URL。",
      },
      {
        code: "MISSING_REQUIRED_VARIABLE",
        field: "username",
        message: "变量 username 为必填项，请先补充运行值。",
      },
    ]);
  });
});
