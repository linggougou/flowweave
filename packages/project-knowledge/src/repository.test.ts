import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { FLOW_SCHEMA_VERSION } from "@flowweave/shared";
import { describe, expect, it, afterEach } from "vitest";

import { ProjectKnowledgeRepository } from "./repository.js";
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

  it("renameFlow 更新名称且不新增版本", () => {
    dataDir = mkdtempSync(join(tmpdir(), "flowweave-pk-"));
    const repo = new ProjectKnowledgeRepository({ dataDir });

    const project = repo.createProject("重命名项目");
    const flowId = "flow_rename_1";
    repo.saveFlow(project.id, sampleFlow(project.id, flowId));

    const renamed = repo.renameFlow(project.id, flowId, "新名称");
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

    const limited = repo.listExecutions(project.id, 1);
    expect(limited).toHaveLength(1);
    expect(limited[0]?.executionId).toBe("exec_newer");

    const loaded = repo.getExecution("exec_older");
    expect(loaded?.projectId).toBe(project.id);
    expect(loaded?.flowId).toBe(flowId);
    expect(loaded?.status).toBe("failed");
    expect(loaded?.steps).toHaveLength(1);
    expect(loaded?.steps[0]?.errorMessage).toBe("超时");

    expect(repo.getExecution("missing_exec")).toBeNull();
  });

  it("saveFlow 更新时写入版本历史并可恢复", () => {
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
    repo.saveFlow(project.id, v2, "新增提交按钮");

    const versions = repo.listFlowVersions(project.id, flowId);
    expect(versions).toHaveLength(1);
    expect(versions[0]?.version).toBe(1);
    expect(versions[0]?.stepCount).toBe(1);
    expect(versions[0]?.changeMessage).toBe("新增提交按钮");

    const current = repo.getFlowInProject(project.id, flowId);
    expect(current?.steps).toHaveLength(2);

    repo.restoreFlowVersion(project.id, versions[0]!.id);
    const restored = repo.getFlowInProject(project.id, flowId);
    expect(restored?.steps).toHaveLength(1);

    const afterRestore = repo.listFlowVersions(project.id, flowId);
    expect(afterRestore.length).toBeGreaterThanOrEqual(2);
  });
});
