import { describe, expect, it } from "vitest";

import type { FlowDocument } from "@flowweave/flow-dsl";
import { FLOW_SCHEMA_VERSION } from "@flowweave/shared";

import {
  buildRunDraftState,
  collectRunPreflightIssues,
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
