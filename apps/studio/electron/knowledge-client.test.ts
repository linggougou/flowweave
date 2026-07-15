import { afterEach, describe, expect, it, vi } from "vitest";
import type { FlowDocument } from "@flowweave/flow-dsl";
import type { ProjectKnowledgeRepository } from "@flowweave/project-knowledge";

import {
  apiAllocateRunDirectory,
  apiGetFlow,
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
});
