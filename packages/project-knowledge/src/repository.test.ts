import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import Database from "better-sqlite3";
import { FLOW_SCHEMA_VERSION, FLOW_SCHEMA_VERSION_V2 } from "@flowweave/shared";
import { describe, expect, it, afterEach } from "vitest";

import { ProjectKnowledgeRepository } from "./repository.js";
import { resolveProjectStorePath } from "./db/client.js";
import type { ExecutionResult } from "./types.js";

function sampleFlow(projectId: string, flowId: string) {
  return {
    schemaVersion: FLOW_SCHEMA_VERSION,
    id: flowId,
    projectId,
    name: "登录流程",
    variables: [],
    steps: [
      {
        id: "s1",
        type: "navigate" as const,
        url: "https://example.com/login",
      },
    ],
    meta: {
      createdAt: "2026-05-25T10:00:00.000Z",
      updatedAt: "2026-05-25T10:00:00.000Z",
      source: "recorded" as const,
    },
  };
}

describe("ProjectKnowledgeRepository", () => {
  let dataDir: string;

  afterEach(() => {
    if (dataDir) {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it("createProject / listProjects / saveFlow / getFlow", () => {
    dataDir = mkdtempSync(join(tmpdir(), "flowweave-pk-"));
    const repo = new ProjectKnowledgeRepository({ dataDir });

    const project = repo.createProject("演示项目");
    expect(project.name).toBe("演示项目");
    expect(project.id).toBeTruthy();

    const flowId = "flow_demo_1";
    repo.saveFlow(project.id, sampleFlow(project.id, flowId));

    const listed = repo.listProjects();
    expect(listed).toHaveLength(1);
    expect(listed[0]?.id).toBe(project.id);

    const loaded = repo.getFlow(flowId);
    expect(loaded?.id).toBe(flowId);
    expect(loaded?.name).toBe("登录流程");

    const flows = repo.listFlows(project.id);
    expect(flows).toHaveLength(1);
    expect(flows[0]?.id).toBe(flowId);
    expect(flows[0]?.createdAt).toBeTruthy();
  });

  it("legacy saveFlow 拒绝 v2 且不创建 Flow", () => {
    dataDir = mkdtempSync(join(tmpdir(), "flowweave-pk-"));
    const repo = new ProjectKnowledgeRepository({ dataDir });
    const project = repo.createProject("v1 repository 边界");
    const v2Flow = {
      schemaVersion: FLOW_SCHEMA_VERSION_V2,
      id: "flow_v2_rejected",
      projectId: project.id,
      name: "v2",
      steps: [{ id: "open", type: "navigate", url: "https://example.com" }],
      meta: {
        createdAt: "2026-08-30T00:00:00.000Z",
        updatedAt: "2026-08-30T00:00:00.000Z",
        source: "manual",
      },
    };

    expect(() => repo.saveFlow(project.id, v2Flow as never)).toThrow();
    expect(repo.listFlows(project.id)).toEqual([]);
    expect(repo.getFlowInProject(project.id, v2Flow.id)).toBeNull();
  });

  it("renameFlow 更新名称且不新增版本", () => {
    dataDir = mkdtempSync(join(tmpdir(), "flowweave-pk-"));
    const repo = new ProjectKnowledgeRepository({ dataDir });

    const project = repo.createProject("重命名项目");
    const flowId = "flow_rename_1";
    repo.saveFlow(project.id, sampleFlow(project.id, flowId));

    const renamed = repo.renameFlow(project.id, flowId, "新名称", 1);
    expect(renamed.name).toBe("新名称");

    const loaded = repo.getFlowInProject(project.id, flowId);
    expect(loaded?.name).toBe("新名称");

    const flows = repo.listFlows(project.id);
    expect(flows[0]?.name).toBe("新名称");

    const versions = repo.listFlowVersions(project.id, flowId);
    expect(versions).toHaveLength(0);
  });

  it("saveExecution 持久化步骤日志且截图仅存路径", () => {
    dataDir = mkdtempSync(join(tmpdir(), "flowweave-pk-"));
    const repo = new ProjectKnowledgeRepository({ dataDir });

    const project = repo.createProject("执行记录项目");
    const flowId = "flow_exec_1";
    repo.saveFlow(project.id, sampleFlow(project.id, flowId));

    const result: ExecutionResult = {
      executionId: "exec_001",
      flowId,
      status: "success",
      startedAt: "2026-05-25T11:00:00.000Z",
      finishedAt: "2026-05-25T11:00:05.000Z",
      steps: [
        {
          stepIndex: 0,
          stepId: "s1",
          status: "passed",
          durationMs: 1200,
          screenshotPath: "/tmp/flowweave/screenshots/exec_001_step0.png",
        },
      ],
    };

    expect(() => repo.saveExecution(project.id, result)).not.toThrow();
  });

  it("saveExecution / listExecutions / getExecution 持久化执行上下文", () => {
    dataDir = mkdtempSync(join(tmpdir(), "flowweave-pk-"));
    const repo = new ProjectKnowledgeRepository({ dataDir });

    const project = repo.createProject("执行上下文项目");
    const flowId = "flow_exec_context_1";
    repo.saveFlow(project.id, sampleFlow(project.id, flowId));

    const result: ExecutionResult = {
      executionId: "exec_context_1",
      flowId,
      status: "success",
      startedAt: "2026-05-25T11:30:00.000Z",
      finishedAt: "2026-05-25T11:30:03.000Z",
      flowSnapshot: sampleFlow(project.id, flowId),
      runContext: {
        environmentName: "预发已登录",
        baseUrl: "https://staging.example.com/app",
        storageStatePath: "/tmp/flowweave/state.json",
        variables: {
          username: "alice",
          retryCount: 2,
          rememberMe: true,
        },
      },
      steps: [
        {
          stepIndex: 0,
          stepId: "s1",
          status: "passed",
        },
      ],
    };

    repo.saveExecution(project.id, result);

    const listed = repo.listExecutions(project.id, 10);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.runContext).toEqual(result.runContext);

    const loaded = repo.getExecution(result.executionId);
    expect(loaded?.projectId).toBe(project.id);
    expect(loaded?.runContext).toEqual(result.runContext);
    expect(loaded?.flowSnapshot).toEqual(result.flowSnapshot);
  });

  it("旧库首次读取执行记录时自动补齐执行上下文列", () => {
    dataDir = mkdtempSync(join(tmpdir(), "flowweave-pk-"));
    const projectId = "project_legacy_exec_columns";
    const storePath = resolveProjectStorePath(projectId, dataDir);
    mkdirSync(dirname(storePath), { recursive: true });

    const sqlite = new Database(storePath);
    sqlite.pragma("foreign_keys = ON");
    sqlite.exec(`
CREATE TABLE projects (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE flows (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  document_json TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE executions (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  flow_id TEXT NOT NULL REFERENCES flows(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT
);
CREATE TABLE execution_steps (
  id TEXT PRIMARY KEY NOT NULL,
  execution_id TEXT NOT NULL REFERENCES executions(id) ON DELETE CASCADE,
  step_index INTEGER NOT NULL,
  step_id TEXT NOT NULL,
  status TEXT NOT NULL,
  duration_ms INTEGER,
  error_message TEXT,
  screenshot_path TEXT
);
CREATE TABLE project_environments (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  base_url TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE page_snapshots (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  title TEXT,
  summary_json TEXT NOT NULL,
  snapshot_path TEXT,
  captured_at TEXT NOT NULL
);
CREATE TABLE flow_versions (
  id TEXT PRIMARY KEY NOT NULL,
  flow_id TEXT NOT NULL REFERENCES flows(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  document_json TEXT NOT NULL,
  change_message TEXT,
  created_at TEXT NOT NULL
);
    `);

    const flow = sampleFlow(projectId, "flow_legacy_1");
    sqlite
      .prepare(
        `
INSERT INTO projects (id, name, created_at, updated_at)
VALUES (?, ?, ?, ?)
      `,
      )
      .run(projectId, "旧库项目", "2026-05-25T10:00:00.000Z", "2026-05-25T10:00:00.000Z");
    sqlite
      .prepare(
        `
INSERT INTO flows (id, project_id, name, document_json, schema_version, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      )
      .run(
        flow.id,
        projectId,
        flow.name,
        JSON.stringify(flow),
        flow.schemaVersion,
        flow.meta.createdAt,
        flow.meta.updatedAt,
      );
    sqlite
      .prepare(
        `
INSERT INTO executions (id, project_id, flow_id, status, started_at, finished_at)
VALUES (?, ?, ?, ?, ?, ?)
      `,
      )
      .run(
        "exec_legacy_1",
        projectId,
        flow.id,
        "success",
        "2026-05-25T11:00:00.000Z",
        "2026-05-25T11:00:05.000Z",
      );
    sqlite
      .prepare(
        `
INSERT INTO execution_steps (id, execution_id, step_index, step_id, status)
VALUES (?, ?, ?, ?, ?)
      `,
      )
      .run("step_legacy_1", "exec_legacy_1", 0, "s1", "passed");
    sqlite.close();

    const repo = new ProjectKnowledgeRepository({ dataDir });
    const listed = repo.listExecutions(projectId, 10);
    expect(listed).toHaveLength(1);

    const upgradedDb = new Database(storePath);
    const columnsAfterList = upgradedDb.pragma("table_info(executions)") as Array<{ name: string }>;
    upgradedDb.close();
    expect(columnsAfterList.map((column) => column.name)).toEqual(
      expect.arrayContaining([
        "flow_snapshot_json",
        "environment_name",
        "base_url",
        "storage_state_path",
        "variables_json",
      ]),
    );

    const loaded = repo.getExecution("exec_legacy_1");
    expect(loaded?.executionId).toBe("exec_legacy_1");
  });

  it("getFlow 在未知 id 时返回 null", () => {
    dataDir = mkdtempSync(join(tmpdir(), "flowweave-pk-"));
    const repo = new ProjectKnowledgeRepository({ dataDir });
    expect(repo.getFlow("missing_flow")).toBeNull();
  });

  it("saveEnvironment 与 getDefaultEnvironment", () => {
    dataDir = mkdtempSync(join(tmpdir(), "flowweave-pk-"));
    const repo = new ProjectKnowledgeRepository({ dataDir });
    const project = repo.createProject("环境测试");
    const env = repo.saveEnvironment(project.id, "预发", "https://staging.example.com", true);
    expect(env.baseUrl).toBe("https://staging.example.com");
    const loaded = repo.getDefaultEnvironment(project.id);
    expect(loaded?.id).toBe(env.id);
  });

  it("saveEnvironment 支持持久化 storageStatePath", () => {
    dataDir = mkdtempSync(join(tmpdir(), "flowweave-pk-"));
    const repo = new ProjectKnowledgeRepository({ dataDir });
    const project = repo.createProject("登录态环境");

    const env = repo.saveEnvironment(
      project.id,
      "已登录环境",
      "https://example.com/app",
      true,
      "/tmp/flowweave/state.json",
    );

    expect(env.storageStatePath).toBe("/tmp/flowweave/state.json");

    const loaded = repo.getDefaultEnvironment(project.id);
    expect(loaded?.storageStatePath).toBe("/tmp/flowweave/state.json");
  });

  it("savePageSnapshot 与 listPageSnapshots", () => {
    dataDir = mkdtempSync(join(tmpdir(), "flowweave-pk-"));
    const repo = new ProjectKnowledgeRepository({ dataDir });
    const project = repo.createProject("快照");
    const record = repo.savePageSnapshot(project.id, {
      url: "https://example.com",
      title: "示例",
      formCount: 1,
      buttonCount: 2,
      linkCount: 3,
      capturedAt: new Date().toISOString(),
    });
    const list = repo.listPageSnapshots(project.id);
    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe(record.id);
  });

  it("allocateRunDirectory 创建 runs 子目录", () => {
    dataDir = mkdtempSync(join(tmpdir(), "flowweave-pk-"));
    const repo = new ProjectKnowledgeRepository({ dataDir });
    const project = repo.createProject("运行目录");
    const runDir = repo.allocateRunDirectory(project.id, "exec_test_1");
    expect(runDir).toContain(join(project.id, "runs", "exec_test_1"));
    expect(existsSync(runDir)).toBe(true);
  });

  it("listExecutions / getExecution 从 executions 与 execution_steps 组装", () => {
    dataDir = mkdtempSync(join(tmpdir(), "flowweave-pk-"));
    const repo = new ProjectKnowledgeRepository({ dataDir });

    const project = repo.createProject("历史查询项目");
    const flowId = "flow_history_1";
    repo.saveFlow(project.id, sampleFlow(project.id, flowId));

    const older: ExecutionResult = {
      executionId: "exec_older",
      flowId,
      status: "failed",
      startedAt: "2026-05-25T10:00:00.000Z",
      finishedAt: "2026-05-25T10:00:02.000Z",
      steps: [
        {
          stepIndex: 0,
          stepId: "s1",
          status: "failed",
          durationMs: 800,
          errorMessage: "超时",
        },
      ],
    };

    const newer: ExecutionResult = {
      executionId: "exec_newer",
      flowId,
      status: "success",
      startedAt: "2026-05-25T12:00:00.000Z",
      finishedAt: "2026-05-25T12:00:05.000Z",
      steps: [
        {
          stepIndex: 0,
          stepId: "s1",
          status: "passed",
          durationMs: 1200,
          screenshotPath: "/tmp/flowweave/screenshots/exec_newer_step0.png",
          diagnosticPath: "/tmp/flowweave/diagnostics/exec_newer_step0.json",
        },
      ],
    };

    repo.saveExecution(project.id, older);
    repo.saveExecution(project.id, newer);

    const listed = repo.listExecutions(project.id, 10);
    expect(listed).toHaveLength(2);
    expect(listed[0]?.executionId).toBe("exec_newer");
    expect(listed[1]?.executionId).toBe("exec_older");
    expect(listed[0]?.steps[0]?.screenshotPath).toContain("exec_newer_step0");
    expect(listed[0]?.steps[0]?.diagnosticPath).toContain("exec_newer_step0.json");

    const limited = repo.listExecutions(project.id, 1);
    expect(limited).toHaveLength(1);
    expect(limited[0]?.executionId).toBe("exec_newer");

    const loaded = repo.getExecution("exec_older");
    expect(loaded?.projectId).toBe(project.id);
    expect(loaded?.flowId).toBe(flowId);
    expect(loaded?.status).toBe("failed");
    expect(loaded?.steps).toHaveLength(1);
    expect(loaded?.steps[0]?.errorMessage).toBe("超时");
    expect(loaded?.steps[0]?.diagnosticPath).toBeUndefined();

    expect(repo.getExecution("missing_exec")).toBeNull();
  });

  it("可以按 Flow 读取最近一次执行记录用于恢复运行输入", () => {
    dataDir = mkdtempSync(join(tmpdir(), "flowweave-pk-"));
    const repo = new ProjectKnowledgeRepository({ dataDir });

    const project = repo.createProject("最近输入恢复项目");
    const flowId = "flow_recent_input";
    repo.saveFlow(project.id, sampleFlow(project.id, flowId));

    repo.saveExecution(project.id, {
      executionId: "exec_recent_old",
      flowId,
      status: "failed",
      startedAt: "2026-05-25T09:00:00.000Z",
      finishedAt: "2026-05-25T09:00:01.000Z",
      runContext: {
        environmentName: "旧环境",
        baseUrl: "https://old.example.com",
        variables: {
          username: "old-user",
        },
      },
      steps: [],
    });

    repo.saveExecution(project.id, {
      executionId: "exec_recent_new",
      flowId,
      status: "success",
      startedAt: "2026-05-25T10:00:00.000Z",
      finishedAt: "2026-05-25T10:00:02.000Z",
      runContext: {
        environmentName: "新环境",
        baseUrl: "https://new.example.com",
        storageStatePath: "/tmp/flowweave/state.json",
        variables: {
          username: "alice",
          retryCount: 2,
        },
      },
      steps: [],
    });

    const maybeMethod = repo as ProjectKnowledgeRepository & {
      getLatestExecutionForFlow?: (
        projectId: string,
        flowId: string,
      ) => ReturnType<ProjectKnowledgeRepository["getExecution"]>;
    };

    expect(maybeMethod.getLatestExecutionForFlow).toBeTypeOf("function");

    const latest = maybeMethod.getLatestExecutionForFlow?.(project.id, flowId);
    expect(latest?.executionId).toBe("exec_recent_new");
    expect(latest?.runContext?.environmentName).toBe("新环境");
    expect(latest?.runContext?.variables).toEqual({
      username: "alice",
      retryCount: 2,
    });
  });

  it("revision save 更新时写入版本历史并可恢复", () => {
    dataDir = mkdtempSync(join(tmpdir(), "flowweave-pk-"));
    const repo = new ProjectKnowledgeRepository({ dataDir });
    const project = repo.createProject("版本项目");
    const flowId = "flow_version_1";

    const v1 = sampleFlow(project.id, flowId);
    repo.saveFlow(project.id, v1);

    const v2 = {
      ...v1,
      name: "登录流程 v2",
      steps: [
        ...v1.steps,
        {
          id: "s2",
          type: "click" as const,
          target: { strategies: [{ kind: "css" as const, selector: "#submit" }] },
        },
      ],
      meta: { ...v1.meta, updatedAt: new Date().toISOString() },
    };
    repo.saveFlowRevision({
      projectId: project.id,
      flowId,
      document: v2,
      expectedRevision: 1,
      changeMessage: "新增提交按钮",
    });

    const versions = repo.listFlowVersions(project.id, flowId);
    expect(versions).toHaveLength(1);
    expect(versions[0]?.version).toBe(1);
    expect(versions[0]?.stepCount).toBe(1);
    expect(versions[0]?.changeMessage).toBe("新增提交按钮");

    const current = repo.getFlowInProject(project.id, flowId);
    expect(current?.steps).toHaveLength(2);

    repo.restoreFlowVersion(project.id, versions[0]!.id, 2);
    const restored = repo.getFlowInProject(project.id, flowId);
    expect(restored?.steps).toHaveLength(1);

    const afterRestore = repo.listFlowVersions(project.id, flowId);
    expect(afterRestore.length).toBeGreaterThanOrEqual(2);
  });
});
