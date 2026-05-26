import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { FLOW_SCHEMA_VERSION } from "@flowweave/shared";
import { ProjectKnowledgeRepository } from "@flowweave/project-knowledge";
import { afterEach, describe, expect, it } from "vitest";

describe("web API 数据层", () => {
  let dataDir: string;

  afterEach(() => {
    if (dataDir) {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it("listFlowVersions 与 restoreFlowVersion 可被控制台消费", () => {
    dataDir = mkdtempSync(join(tmpdir(), "flowweave-web-"));
    const repo = new ProjectKnowledgeRepository({ dataDir });
    const project = repo.createProject("Web 测试");
    const flowId = "flow_web_1";
    const base = {
      schemaVersion: FLOW_SCHEMA_VERSION,
      id: flowId,
      projectId: project.id,
      name: "流程 A",
      variables: [],
      steps: [{ id: "s1", type: "navigate" as const, url: "https://example.com" }],
      meta: {
        createdAt: "2026-05-25T10:00:00.000Z",
        updatedAt: "2026-05-25T10:00:00.000Z",
        source: "recorded" as const,
      },
    };
    repo.saveFlow(project.id, base);
    repo.saveFlow(
      project.id,
      {
        ...base,
        name: "流程 B",
        steps: [...base.steps, { id: "s2", type: "click" as const, target: { strategies: [{ kind: "css" as const, selector: "a" }] } }],
      },
      "加一步",
    );

    const versions = repo.listFlowVersions(project.id, flowId);
    expect(versions).toHaveLength(1);

    repo.restoreFlowVersion(project.id, versions[0]!.id);
    const current = repo.getFlowInProject(project.id, flowId);
    expect(current?.name).toBe("流程 A");
  });

  it("saveFlow 支持扩展同步写入", () => {
    dataDir = mkdtempSync(join(tmpdir(), "flowweave-web-save-"));
    const repo = new ProjectKnowledgeRepository({ dataDir });
    const project = repo.createProject("扩展同步");
    const flowId = "flow_ext_sync";
    const flow = {
      schemaVersion: FLOW_SCHEMA_VERSION,
      id: flowId,
      projectId: project.id,
      name: "扩展录制流程",
      variables: [],
      steps: [{ id: "s1", type: "navigate" as const, url: "https://example.com" }],
      meta: {
        createdAt: "2026-05-25T10:00:00.000Z",
        updatedAt: "2026-05-25T10:00:00.000Z",
        source: "recorded" as const,
      },
    };
    repo.saveFlow(project.id, flow, "扩展侧栏同步");
    const loaded = repo.getFlowInProject(project.id, flowId);
    expect(loaded?.name).toBe("扩展录制流程");
  });
});
