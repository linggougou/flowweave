import { afterEach, describe, expect, it, vi } from "vitest";
import type { FlowDocument } from "@flowweave/flow-dsl";
import type { ProjectKnowledgeRepository } from "@flowweave/project-knowledge";

import {
  apiAllocateRunDirectory,
  apiGetFlow,
  apiImportFlow,
  apiListProjects,
  apiRenameFlow,
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
    configureLocalKnowledgeRepository({
      getFlowInProject: vi.fn(() => flow),
      renameFlow: vi.fn(() => ({ ...flow, name: "新名称" })),
      allocateRunDirectory: vi.fn(() => "/tmp/run-local"),
    } as unknown as ProjectKnowledgeRepository);

    await expect(apiGetFlow("project_local", "flow_local")).resolves.toBe(flow);
    await expect(apiRenameFlow("project_local", "flow_local", "新名称")).resolves.toEqual({
      flowId: "flow_local",
      name: "新名称",
      createdAt: "2026-07-15",
    });
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
});
