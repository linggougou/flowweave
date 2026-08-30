import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { FlowDocumentV2 } from "@flowweave/flow-dsl";
import {
  FLOW_SCHEMA_VERSION,
  FLOW_SCHEMA_VERSION_V2,
  FlowWeaveError,
} from "@flowweave/shared";
import { afterEach, describe, expect, it } from "vitest";

import { resolveProjectStorePath } from "./db/client.js";
import { ProjectKnowledgeRepository } from "./repository.js";

function portableInput() {
  return {
    schemaVersion: FLOW_SCHEMA_VERSION,
    id: "flow_source",
    projectId: "project_source",
    name: "登录流程",
    variables: [
      {
        name: "secret_password",
        type: "string" as const,
        required: false,
        defaultValue: "do-not-import",
      },
    ],
    steps: [
      {
        id: "open-login",
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

function portableV2Input(): FlowDocumentV2 {
  return {
    schemaVersion: FLOW_SCHEMA_VERSION_V2,
    id: "flow_v2_source",
    projectId: "project_v2_source",
    name: "v2 安全流程",
    steps: [
      {
        id: "input_profile_01",
        type: "input",
        name: "运行输入",
        fields: [
          {
            fieldId: "field_name_01",
            label: "名称",
            type: "string",
            required: true,
            sensitive: false,
            remember: "never",
          },
        ],
      },
      {
        id: "fill_name",
        type: "fill",
        target: { strategies: [{ kind: "css", selector: "#name" }] },
        value: "{{field_name_01}}",
      },
    ],
    meta: {
      createdAt: "2026-08-30T00:00:00.000Z",
      updatedAt: "2026-08-30T00:00:00.000Z",
      source: "manual",
    },
  };
}

describe("ProjectKnowledgeRepository.importFlow", () => {
  let dataDir = "";

  afterEach(() => {
    if (dataDir) {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it("将历史裸 Flow 导入为目标项目中的安全新副本", () => {
    dataDir = mkdtempSync(join(tmpdir(), "flowweave-import-"));
    const repo = new ProjectKnowledgeRepository({ dataDir });
    const target = repo.createProject("目标项目");
    const input = portableInput();

    const result = repo.importFlow(target.id, input);

    expect(result.flow.id).not.toBe(input.id);
    expect(result.flow.projectId).toBe(target.id);
    expect(result.flow.name).toBe("登录流程（导入）");
    expect(result.flow.meta.createdAt).toBe(result.flow.meta.updatedAt);
    expect(result.flow.meta.createdAt).not.toBe(input.meta.createdAt);
    expect(result.flow.schemaVersion).toBe(FLOW_SCHEMA_VERSION);
    expect(result.flow.schemaVersion === FLOW_SCHEMA_VERSION && result.flow.variables).toEqual([
      { name: "secret_password", type: "string", required: true },
    ]);
    expect(result.warnings).toEqual([
      expect.objectContaining({
        code: "secret-default-removed",
        variableName: "secret_password",
      }),
    ]);
    expect(repo.getFlowInProject(target.id, result.flow.id)).toEqual(result.flow);
  });

  it("每次导入都生成唯一 ID 与可预测的递增名称且不覆盖来源 ID", () => {
    dataDir = mkdtempSync(join(tmpdir(), "flowweave-import-"));
    const repo = new ProjectKnowledgeRepository({ dataDir });
    const target = repo.createProject("重复导入项目");
    const input = portableInput();
    repo.saveFlow(target.id, { ...input, projectId: target.id });

    const first = repo.importFlow(target.id, input).flow;
    const second = repo.importFlow(target.id, input).flow;
    const third = repo.importFlow(target.id, input).flow;

    expect(new Set([first.id, second.id, third.id]).size).toBe(3);
    expect([first.name, second.name, third.name]).toEqual([
      "登录流程（导入）",
      "登录流程（导入 2）",
      "登录流程（导入 3）",
    ]);
    expect(repo.getFlowInProject(target.id, input.id)?.name).toBe("登录流程");
    expect(repo.listFlows(target.id)).toHaveLength(4);
  });

  it("目标项目不存在时先拒绝且不创建数据库目录", () => {
    dataDir = mkdtempSync(join(tmpdir(), "flowweave-import-"));
    const repo = new ProjectKnowledgeRepository({ dataDir });
    const missingProjectId = "missing_project";
    const missingStore = resolveProjectStorePath(missingProjectId, dataDir);

    expect(existsSync(missingStore)).toBe(false);
    try {
      repo.importFlow(missingProjectId, { schemaVersion: 2 });
      throw new Error("预期导入失败");
    } catch (error) {
      expect(error).toBeInstanceOf(FlowWeaveError);
      expect((error as FlowWeaveError).code).toBe("PROJECT_NOT_FOUND");
    }
    expect(existsSync(missingStore)).toBe(false);
  });

  it("无效 schema 不产生 Flow 或版本半成品", () => {
    dataDir = mkdtempSync(join(tmpdir(), "flowweave-import-"));
    const repo = new ProjectKnowledgeRepository({ dataDir });
    const target = repo.createProject("失败无副作用项目");
    const before = repo.listFlows(target.id);

    try {
      repo.importFlow(target.id, { ...portableInput(), schemaVersion: 3 });
      throw new Error("预期导入失败");
    } catch (error) {
      expect(error).toBeInstanceOf(FlowWeaveError);
      expect((error as FlowWeaveError).code).toBe("VALIDATION_FAILED");
    }

    expect(repo.listFlows(target.id)).toEqual(before);
  });

  it("v1 与 v2 都按原 schema 安全导出并原子导入为 revision=1 新副本", () => {
    dataDir = mkdtempSync(join(tmpdir(), "flowweave-import-roundtrip-"));
    const repo = new ProjectKnowledgeRepository({ dataDir });
    const sourceProject = repo.createProject("来源项目");
    const targetProject = repo.createProject("目标项目");
    const sourceV1 = { ...portableInput(), projectId: sourceProject.id };
    repo.saveFlow(sourceProject.id, sourceV1);
    const importedV1 = repo.importFlow(targetProject.id, repo.exportFlow(sourceProject.id, sourceV1.id));

    const sourceV2 = { ...portableV2Input(), projectId: sourceProject.id };
    const importedV2 = repo.importFlow(targetProject.id, sourceV2);
    const exportedV2 = repo.exportFlow(targetProject.id, importedV2.flow.id);
    const roundTrippedV2 = repo.importFlow(sourceProject.id, exportedV2);

    expect(importedV1.flow.schemaVersion).toBe(FLOW_SCHEMA_VERSION);
    expect(importedV2.flow.schemaVersion).toBe(FLOW_SCHEMA_VERSION_V2);
    expect(roundTrippedV2.flow.schemaVersion).toBe(FLOW_SCHEMA_VERSION_V2);
    expect(importedV2.flow.id).not.toBe(sourceV2.id);
    expect(importedV2.flow.projectId).toBe(targetProject.id);
    expect(repo.getFlowRevision(targetProject.id, importedV2.flow.id)?.revision).toBe(1);
    expect(repo.listFlowVersions(targetProject.id, importedV2.flow.id)).toEqual([]);
    expect(repo.getFlowFieldRecentValues(targetProject.id, importedV2.flow.id)).toEqual({});
    expect(JSON.stringify(exportedV2)).not.toContain(dataDir);
  });

  it("未知版本和不安全 v2 upload 路径失败时零写入", () => {
    dataDir = mkdtempSync(join(tmpdir(), "flowweave-import-v2-failure-"));
    const repo = new ProjectKnowledgeRepository({ dataDir });
    const target = repo.createProject("v2 导入失败");
    const before = repo.listFlows(target.id);

    expect(() => repo.importFlow(target.id, { ...portableV2Input(), schemaVersion: 3 })).toThrow();
    expect(() =>
      repo.importFlow(target.id, {
        ...portableV2Input(),
        steps: [
          ...portableV2Input().steps,
          {
            id: "upload_local",
            type: "upload",
            target: { strategies: [{ kind: "css", selector: "input[type=file]" }] },
            files: ["/Users/example/secret.txt"],
          },
        ],
      }),
    ).toThrowError(expect.objectContaining({ code: "VALIDATION_FAILED" }));
    expect(repo.listFlows(target.id)).toEqual(before);
  });
});
