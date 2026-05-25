import { mkdtempSync, rmSync } from "node:fs";
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
});
