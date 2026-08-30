import { afterEach, describe, expect, it, vi } from "vitest";
import type { FlowDocument } from "@flowweave/flow-dsl";
import type { ProjectKnowledgeRepository } from "@flowweave/project-knowledge";

import {
  apiAllocateRunDirectory,
  apiExportFlow,
  apiGetFlow,
  apiGetFlowVersion,
  apiImportFlow,
  apiListProjects,
  apiRenameFlow,
  apiRestoreFlowVersion,
  apiSaveFlow,
  configureLocalKnowledgeRepository,
} from "./knowledge-client.js";

afterEach(() => {
  configureLocalKnowledgeRepository();
  vi.unstubAllGlobals();
});

describe("Electron 本地知识库模式", () => {
  it("打包应用直接读取项目和默认环境，不访问外部 API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    configureLocalKnowledgeRepository({
      listProjects: () => [{ id: "project_local", name: "本地项目", createdAt: "2026-07-15" }],
      getDefaultEnvironment: () => ({
        id: "env_local",
        projectId: "project_local",
        name: "默认环境",
        baseUrl: "https://example.test",
        isDefault: true,
      }),
    } as unknown as ProjectKnowledgeRepository);

    await expect(apiListProjects()).resolves.toEqual([
      {
        id: "project_local",
        name: "本地项目",
        createdAt: "2026-07-15",
        baseUrl: "https://example.test",
      },
    ]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("本地模式覆盖 Flow 查询、重命名和运行目录分配", async () => {
    const flow = {
      id: "flow_local",
      name: "本地流程",
      meta: { createdAt: "2026-07-15" },
    } as unknown as FlowDocument;
    const renameFlow = vi.fn(() => ({ ...flow, name: "新名称" }));
    configureLocalKnowledgeRepository({
      getFlowInProject: vi.fn(() => flow),
      renameFlow,
      getFlowRevision: vi.fn(() => ({ document: flow, revision: 8, updatedAt: "2026-07-15" })),
      allocateRunDirectory: vi.fn(() => "/tmp/run-local"),
    } as unknown as ProjectKnowledgeRepository);

    await expect(apiGetFlow("project_local", "flow_local")).resolves.toBe(flow);
    await expect(apiRenameFlow("project_local", "flow_local", "新名称", 7)).resolves.toEqual({
      flowId: "flow_local",
      name: "新名称",
      createdAt: "2026-07-15",
      revision: 8,
      schemaVersion: flow.schemaVersion,
    });
    expect(renameFlow).toHaveBeenCalledWith("project_local", "flow_local", "新名称", 7);
    await expect(apiAllocateRunDirectory("project_local", "execution_local")).resolves.toBe(
      "/tmp/run-local",
    );
  });

  it("导入只调用专用 importFlow，不复用 saveFlow/upsert", async () => {
    const source = {
      schemaVersion: 1,
      id: "flow_source",
      projectId: "project_source",
      name: "导入来源",
      variables: [],
      steps: [{ id: "navigate", type: "navigate", url: "/" }],
      meta: {
        createdAt: "2026-08-23T08:00:00.000Z",
        updatedAt: "2026-08-23T08:00:00.000Z",
        source: "recorded",
      },
    } as FlowDocument;
    const imported = { ...source, id: "flow_new", projectId: "project_target" };
    const importFlow = vi.fn(() => ({ flow: imported, warnings: [] }));
    const saveFlow = vi.fn();
    configureLocalKnowledgeRepository({
      importFlow,
      saveFlow,
    } as unknown as ProjectKnowledgeRepository);

    await expect(apiImportFlow("project_target", source)).resolves.toEqual({
      flow: imported,
      warnings: [],
    });
    expect(importFlow).toHaveBeenCalledWith("project_target", source);
    expect(saveFlow).not.toHaveBeenCalled();
  });

  it("本地模式用 flow 归属读取 v2 历史，并直接调用 revision-aware restore", async () => {
    const v2 = {
      schemaVersion: 2,
      id: "flow_v2_local",
      projectId: "project_local",
      name: "v2 历史",
      steps: [],
      meta: {
        createdAt: "2026-08-30T00:00:00.000Z",
        updatedAt: "2026-08-30T00:00:00.000Z",
        source: "manual",
      },
    } as const;
    const getFlowVersionInFlow = vi.fn(() => v2);
    const restoreFlowRevision = vi.fn(() => ({
      document: v2,
      revision: 9,
      updatedAt: "2026-08-30T01:00:00.000Z",
    }));
    const legacyRestore = vi.fn();
    configureLocalKnowledgeRepository({
      getFlowVersionInFlow,
      restoreFlowRevision,
      restoreFlowVersion: legacyRestore,
    } as unknown as ProjectKnowledgeRepository);

    await expect(
      apiGetFlowVersion("project_local", "flow_v2_local", "version_v2"),
    ).resolves.toBe(v2);
    await expect(
      apiRestoreFlowVersion("project_local", "flow_v2_local", "version_v2", 8),
    ).resolves.toMatchObject({ revision: 9, document: { schemaVersion: 2 } });
    expect(getFlowVersionInFlow).toHaveBeenCalledWith(
      "project_local",
      "flow_v2_local",
      "version_v2",
    );
    expect(restoreFlowRevision).toHaveBeenCalledWith({
      projectId: "project_local",
      flowId: "flow_v2_local",
      versionId: "version_v2",
      expectedRevision: 8,
      changeMessage: "从版本恢复",
    });
    expect(legacyRestore).not.toHaveBeenCalled();
  });

  it("开发态通过 G2 专用 flow-imports endpoint 导入裸文档", async () => {
    const source = {
      schemaVersion: 1,
      id: "flow_http_source",
      projectId: "project_source",
      name: "HTTP 导入来源",
      variables: [],
      steps: [{ id: "navigate", type: "navigate", url: "/" }],
      meta: {
        createdAt: "2026-08-23T08:00:00.000Z",
        updatedAt: "2026-08-23T08:00:00.000Z",
        source: "recorded",
      },
    } as FlowDocument;
    const responseBody = {
      flow: { ...source, id: "flow_http_new", projectId: "project_target" },
      warnings: [],
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(responseBody),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiImportFlow("project_target", source)).resolves.toEqual(responseBody);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:3847/api/projects/project_target/flow-imports",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(source),
      }),
    );
  });

  it("HTTP mutation 精确透传 expectedRevision，export 使用专用安全 endpoint", async () => {
    const source = {
      schemaVersion: 1,
      id: "flow_http_cas",
      projectId: "project_target",
      name: "HTTP CAS",
      variables: [],
      steps: [{ id: "navigate", type: "navigate", url: "/" }],
      meta: {
        createdAt: "2026-08-23T08:00:00.000Z",
        updatedAt: "2026-08-23T08:00:00.000Z",
        source: "recorded",
      },
    } as FlowDocument;
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(source),
    });
    vi.stubGlobal("fetch", fetchMock);

    await apiSaveFlow("project_target", source, "CAS 保存", 4);
    await apiRenameFlow("project_target", source.id, "新名称", 5);
    await apiGetFlowVersion("project_target", source.id, "version_1");
    await apiRestoreFlowVersion("project_target", source.id, "version_1", 6);
    await apiExportFlow("project_target", source.id);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "http://127.0.0.1:3847/api/projects/project_target/flows",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ flow: source, changeMessage: "CAS 保存", expectedRevision: 4 }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `http://127.0.0.1:3847/api/projects/project_target/flows/${source.id}`,
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ name: "新名称", expectedRevision: 5 }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      `http://127.0.0.1:3847/api/projects/project_target/flow-versions/version_1?flowId=${source.id}`,
      expect.any(Object),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "http://127.0.0.1:3847/api/projects/project_target/flow-versions/version_1/restore",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ flowId: source.id, expectedRevision: 6 }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      5,
      `http://127.0.0.1:3847/api/projects/project_target/flows/${source.id}/export`,
      expect.any(Object),
    );
  });
});
