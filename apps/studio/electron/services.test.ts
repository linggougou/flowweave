import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AnyFlowDocument, FlowDocument } from "@flowweave/flow-dsl";
import type { ExecutionWithProject } from "@flowweave/project-knowledge";
import { FLOW_SCHEMA_VERSION } from "@flowweave/shared";

const mockExecuteFlow = vi.fn();
const mockIsChromiumInstalled = vi.fn(() => true);
const mockApiAllocateRunDirectory = vi.fn();
const mockApiCreateProject = vi.fn();
const mockApiDeleteExecution = vi.fn();
const mockApiGetExecution = vi.fn();
const mockApiExportFlow = vi.fn();
const mockApiGetFlow = vi.fn();
const mockApiGetFlowRevision = vi.fn();
const mockApiGetFlowVersion = vi.fn();
const mockApiListExecutions = vi.fn();
const mockApiListFlowVersions = vi.fn();
const mockApiListFlows = vi.fn();
const mockApiListProjects = vi.fn();
const mockApiRenameFlow = vi.fn();
const mockApiRestoreFlowVersion = vi.fn();
const mockApiSaveExecution = vi.fn();
const mockApiSaveFlow = vi.fn();
const mockApiSavePageSnapshot = vi.fn();
const mockConfigureLocalKnowledgeRepository = vi.fn();
const mockProjectKnowledgeRepositoryCtor = vi.fn();
const mockRepoGetDefaultEnvironment = vi.fn();
const mockRepoSaveEnvironment = vi.fn();
const mockRepoGetLatestExecutionForFlow = vi.fn();
const mockRepoGetExecutionScreenshotPreview = vi.fn();

type ServicesModule = {
  assertProjectExistsForFileOperation?: (projectId: string) => Promise<void>;
  getFlowRunInput?: (projectId: string, flowId: string) => Promise<unknown>;
  getFlowForExport?: (projectId: string, flowId: string) => Promise<AnyFlowDocument>;
  renameFlow?: (
    projectId: string,
    flowId: string,
    name: string,
    expectedRevision: number,
  ) => Promise<unknown>;
  restoreFlowVersion?: (
    projectId: string,
    versionId: string,
    expectedRevision: number,
  ) => Promise<unknown>;
  getExecutionScreenshotPreview?: (request: {
    projectId: string;
    executionId: string;
    stepIndex: number;
  }) => unknown;
};

vi.mock("./env-setup.js", () => ({
  isChromiumInstalled: mockIsChromiumInstalled,
}));

vi.mock("electron", () => ({
  app: { isPackaged: false },
}));

vi.mock("@flowweave/runtime", () => ({
  executeFlow: mockExecuteFlow,
}));

vi.mock("@flowweave/project-knowledge", () => ({
  ProjectKnowledgeRepository: class {
    constructor(...args: unknown[]) {
      mockProjectKnowledgeRepositoryCtor(...args);
    }

    getDefaultEnvironment(...args: unknown[]) {
      return mockRepoGetDefaultEnvironment(...args);
    }

    saveEnvironment(...args: unknown[]) {
      return mockRepoSaveEnvironment(...args);
    }

    getLatestExecutionForFlow(...args: unknown[]) {
      return mockRepoGetLatestExecutionForFlow(...args);
    }

    getExecutionScreenshotPreview(...args: unknown[]) {
      return mockRepoGetExecutionScreenshotPreview(...args);
    }
  },
  getDefaultDataDir: () => "/tmp/flowweave-services-tests",
  resolveRunDirectory: (_dataDir: string, projectId: string, executionId: string) =>
    join("/tmp/flowweave-services-tests", projectId, "runs", executionId),
}));

vi.mock("./knowledge-client.js", () => ({
  apiAllocateRunDirectory: mockApiAllocateRunDirectory,
  apiCreateProject: mockApiCreateProject,
  apiDeleteExecution: mockApiDeleteExecution,
  apiExportFlow: mockApiExportFlow,
  apiGetExecution: mockApiGetExecution,
  apiGetFlow: mockApiGetFlow,
  apiGetFlowRevision: mockApiGetFlowRevision,
  apiGetFlowVersion: mockApiGetFlowVersion,
  apiListExecutions: mockApiListExecutions,
  apiListFlowVersions: mockApiListFlowVersions,
  apiListFlows: mockApiListFlows,
  apiListProjects: mockApiListProjects,
  apiRenameFlow: mockApiRenameFlow,
  apiRestoreFlowVersion: mockApiRestoreFlowVersion,
  apiSaveExecution: mockApiSaveExecution,
  apiSaveFlow: mockApiSaveFlow,
  apiSavePageSnapshot: mockApiSavePageSnapshot,
  configureLocalKnowledgeRepository: mockConfigureLocalKnowledgeRepository,
}));

function buildFlow(overrides?: Partial<FlowDocument>): FlowDocument {
  return {
    schemaVersion: FLOW_SCHEMA_VERSION,
    id: "flow_service_history",
    projectId: "project_service_history",
    name: "服务层历史执行",
    variables: [],
    steps: [
      {
        id: "s1",
        type: "navigate",
        url: "/orders",
      },
    ],
    meta: {
      createdAt: "2026-06-06T00:00:00.000Z",
      updatedAt: "2026-06-06T00:00:00.000Z",
      source: "manual",
    },
    ...overrides,
  };
}

function buildExecution(overrides?: Partial<ExecutionWithProject>): ExecutionWithProject {
  return {
    executionId: "exec_service_history",
    projectId: "project_service_history",
    flowId: "flow_service_history",
    status: "success",
    startedAt: "2026-06-06T00:01:00.000Z",
    finishedAt: "2026-06-06T00:01:02.000Z",
    steps: [
      {
        stepIndex: 0,
        stepId: "s1",
        status: "passed",
      },
    ],
    ...overrides,
  };
}

async function loadServicesModule() {
  return import("./services.js");
}

describe("getExecution 缓存命中策略", () => {
  beforeEach(() => {
    vi.resetModules();
    mockApiAllocateRunDirectory.mockReset();
    mockApiCreateProject.mockReset();
    mockApiDeleteExecution.mockReset();
    mockApiExportFlow.mockReset();
    mockApiGetExecution.mockReset();
    mockApiGetFlow.mockReset();
    mockApiGetFlowRevision.mockReset();
    mockApiGetFlowVersion.mockReset();
    mockApiListExecutions.mockReset();
    mockApiListFlowVersions.mockReset();
    mockApiListFlows.mockReset();
    mockApiListProjects.mockReset();
    mockApiRenameFlow.mockReset();
    mockApiRestoreFlowVersion.mockReset();
    mockApiSaveExecution.mockReset();
    mockApiSaveFlow.mockReset();
    mockApiSavePageSnapshot.mockReset();
    mockConfigureLocalKnowledgeRepository.mockReset();
    mockProjectKnowledgeRepositoryCtor.mockReset();
    mockExecuteFlow.mockReset();
    mockIsChromiumInstalled.mockReset();
    mockIsChromiumInstalled.mockReturnValue(true);
    mockRepoGetDefaultEnvironment.mockReset();
    mockRepoSaveEnvironment.mockReset();
    mockRepoGetLatestExecutionForFlow.mockReset();
    mockRepoGetExecutionScreenshotPreview.mockReset();
  });

  it("默认向知识库仓库注入 Electron 专用 better-sqlite3 nativeBinding 路径", async () => {
    await loadServicesModule();

    expect(mockProjectKnowledgeRepositoryCtor).toHaveBeenCalledWith(
      expect.objectContaining({
        nativeBinding: expect.stringContaining(
          "apps/studio/dist-electron/native/better_sqlite3.node",
        ),
      }),
    );
  });

  it("导出读取会先确认全局项目存在，ghost_project 不触碰项目数据库", async () => {
    mockApiListProjects.mockResolvedValue([
      { id: "project_real", name: "真实项目", createdAt: "2026-08-23T08:00:00.000Z" },
    ]);
    const { getFlowForExport } = await loadServicesModule();

    await expect(getFlowForExport?.("ghost_project", "flow_safe")).rejects.toThrow(
      "目标项目不存在",
    );

    expect(mockApiListProjects).toHaveBeenCalledOnce();
    expect(mockApiGetFlow).not.toHaveBeenCalled();
  });

  it("文件操作项目门禁只读全局索引，并区分存在与 ghost 项目", async () => {
    mockApiListProjects.mockResolvedValue([
      { id: "project_real", name: "真实项目", createdAt: "2026-08-23T08:00:00.000Z" },
    ]);
    const { assertProjectExistsForFileOperation } = await loadServicesModule();

    await expect(assertProjectExistsForFileOperation?.("project_real")).resolves.toBeUndefined();
    await expect(assertProjectExistsForFileOperation?.("ghost_project")).rejects.toThrow(
      "目标项目不存在",
    );

    expect(mockApiListProjects).toHaveBeenCalledTimes(2);
    expect(mockApiGetFlow).not.toHaveBeenCalled();
  });

  it("重命名与恢复逐字透传 caller expectedRevision", async () => {
    mockApiRenameFlow.mockResolvedValue({
      flowId: "flow_cas",
      name: "新名称",
      createdAt: "2026-08-30T00:00:00.000Z",
      revision: 8,
      schemaVersion: 1,
    });
    mockApiRestoreFlowVersion.mockResolvedValue(buildFlow());
    const services = (await loadServicesModule()) as ServicesModule;

    await services.renameFlow?.("project_cas", "flow_cas", "新名称", 7);
    await services.restoreFlowVersion?.("project_cas", "version_cas", 8);

    expect(mockApiRenameFlow).toHaveBeenCalledWith(
      "project_cas",
      "flow_cas",
      "新名称",
      7,
    );
    expect(mockApiRestoreFlowVersion).toHaveBeenCalledWith(
      "project_cas",
      "version_cas",
      8,
    );
  });

  it("缓存里缺少 flowSnapshot 时，会继续回源知识库", async () => {
    const stored = buildExecution({
      flowSnapshot: undefined,
      runContext: {
        environmentName: "预发环境",
      },
    });
    mockApiGetExecution.mockResolvedValue(stored);
    mockApiGetFlow.mockResolvedValue(buildFlow());

    const { getExecution } = await loadServicesModule();

    await getExecution(stored.executionId);
    await getExecution(stored.executionId);

    expect(mockApiGetExecution).toHaveBeenCalledTimes(2);
    expect(mockApiGetFlow).toHaveBeenCalledTimes(2);
  });

  it("缓存上下文已足够时，第二次读取直接命中缓存", async () => {
    const standaloneFlow = buildFlow({
      steps: [
        {
          id: "s1",
          type: "navigate",
          url: "https://example.com/orders",
        },
      ],
    });
    const stored = buildExecution({
      flowSnapshot: standaloneFlow,
      runContext: undefined,
    });
    mockApiGetExecution.mockResolvedValue(stored);

    const { getExecution } = await loadServicesModule();

    await getExecution(stored.executionId);
    await getExecution(stored.executionId);

    expect(mockApiGetExecution).toHaveBeenCalledTimes(1);
    expect(mockApiGetFlow).not.toHaveBeenCalled();
  });

  it("历史步骤不读取数据库污染的诊断路径，只尝试受控固定文件名", async () => {
    const externalDirectory = mkdtempSync(join(tmpdir(), "flowweave-services-external-"));
    const externalDiagnostic = join(externalDirectory, "private-diagnostic.json");
    writeFileSync(externalDiagnostic, JSON.stringify({ title: "不得读取的外部秘密" }));
    const stored = buildExecution({
      executionId: "exec_polluted_artifact_path",
      flowSnapshot: buildFlow(),
      steps: [
        {
          stepIndex: 0,
          stepId: "s1",
          status: "failed",
          diagnosticPath: externalDiagnostic,
        },
      ],
    });
    mockApiGetExecution.mockResolvedValue(stored);
    const { getExecution } = await loadServicesModule();

    try {
      const result = await getExecution(stored.executionId);
      expect(result?.steps[0]).toMatchObject({ hasDiagnostic: false });
      expect(result?.steps[0]).not.toHaveProperty("diagnosticPath");
      expect(JSON.stringify(result)).not.toContain(externalDiagnostic);
      expect(JSON.stringify(result)).not.toContain("不得读取的外部秘密");
    } finally {
      rmSync(externalDirectory, { recursive: true, force: true });
    }
  });

  it("截图预览 service 只把严格业务对象拆给仓库", async () => {
    mockRepoGetExecutionScreenshotPreview.mockReturnValue({ status: "absent" });
    const { getExecutionScreenshotPreview } = await loadServicesModule();

    expect(
      getExecutionScreenshotPreview?.({
        projectId: "project_preview",
        executionId: "exec_preview",
        stepIndex: 2,
      }),
    ).toEqual({ status: "absent" });
    expect(mockRepoGetExecutionScreenshotPreview).toHaveBeenCalledWith(
      "project_preview",
      "exec_preview",
      2,
    );
  });

  it("删除成功后驱逐 execution cache，后续详情必须回源", async () => {
    const stored = buildExecution({ flowSnapshot: buildFlow() });
    mockApiGetExecution.mockResolvedValueOnce(stored).mockResolvedValueOnce(null);
    mockApiDeleteExecution.mockResolvedValue({
      projectId: stored.projectId,
      executionId: stored.executionId,
      status: "deleted",
      artifacts: "deleted",
    });
    const { getExecution, deleteExecution } = await loadServicesModule();

    await expect(getExecution(stored.executionId)).resolves.toMatchObject({
      executionId: stored.executionId,
    });
    await expect(deleteExecution(stored.projectId, stored.executionId)).resolves.toMatchObject({
      status: "deleted",
    });
    await expect(getExecution(stored.executionId)).resolves.toBeNull();

    expect(mockApiDeleteExecution).toHaveBeenCalledWith(
      expect.any(Object),
      stored.projectId,
      stored.executionId,
    );
    expect(mockApiGetExecution).toHaveBeenCalledTimes(2);
  });

  it("runFlow 在 storageStatePath 文件不存在时提前阻断", async () => {
    mockApiGetFlow.mockResolvedValue(buildFlow());
    mockApiAllocateRunDirectory.mockResolvedValue("/tmp/flowweave/run-exec");

    const { runFlow } = await loadServicesModule();

    await expect(
      runFlow("project_service_history", "flow_service_history", {
        showBrowser: false,
        environmentName: "预发环境",
        baseUrl: "https://staging.example.com/app",
        storageStatePath: "/tmp/flowweave/missing-state.json",
        variables: {
          username: "alice",
        },
      }),
    ).rejects.toThrow("Storage State 文件不存在");

    expect(mockExecuteFlow).not.toHaveBeenCalled();
    expect(mockApiSaveExecution).not.toHaveBeenCalled();
  });

  it.each([
    ["v2", 2, 2],
    ["对象", { secret: "studio-schema-canary", nested: { token: "private-token" } }, "invalid"],
    ["数组", [2, "studio-schema-canary"], "invalid"],
    ["字符串", "studio-schema-canary", "invalid"],
    ["缺失", undefined, "missing"],
  ])(
    "runFlow 在任何运行副作用前安全拒绝%s schemaVersion",
    async (_label, schemaVersion, expectedVersion) => {
      const onProgress = vi.fn();
      mockApiGetFlow.mockResolvedValue({
        ...buildFlow(),
        schemaVersion,
      });

      const { runFlow } = await loadServicesModule();
      let receivedError: unknown;
      try {
        await runFlow("project_service_history", "flow_service_history", {
          showBrowser: false,
          executionId: "exec_schema_guard",
          environmentName: "不得保存的环境",
          onProgress,
        });
      } catch (error) {
        receivedError = error;
      }

      expect(receivedError).toEqual(
        expect.objectContaining({
          name: "FlowWeaveError",
          code: "FLOW_SCHEMA_MISMATCH",
          details: {
            expectedVersion: FLOW_SCHEMA_VERSION,
            receivedVersion: expectedVersion,
          },
        }),
      );
      expect(JSON.stringify(receivedError)).not.toContain("studio-schema-canary");
      expect(JSON.stringify(receivedError)).not.toContain("private-token");
      expect(mockApiAllocateRunDirectory).not.toHaveBeenCalled();
      expect(mockIsChromiumInstalled).not.toHaveBeenCalled();
      expect(mockExecuteFlow).not.toHaveBeenCalled();
      expect(onProgress).not.toHaveBeenCalled();
      expect(mockApiSaveExecution).not.toHaveBeenCalled();
      expect(mockApiSavePageSnapshot).not.toHaveBeenCalled();
      expect(mockRepoSaveEnvironment).not.toHaveBeenCalled();
    },
  );

  it("显式清空 baseUrl 与 storageStatePath 时，不再回退到旧默认环境", async () => {
    mockApiGetFlow.mockResolvedValue(
      buildFlow({
        steps: [
          {
            id: "s1",
            type: "navigate",
            url: "https://example.com/orders",
          },
        ],
      }),
    );
    mockApiAllocateRunDirectory.mockResolvedValue("/tmp/flowweave/run-exec");
    mockRepoGetDefaultEnvironment.mockReturnValue({
      id: "env_default",
      projectId: "project_service_history",
      name: "默认环境",
      baseUrl: "https://staging.example.com/app",
      storageStatePath: "/tmp/flowweave/legacy-state.json",
      isDefault: true,
    });
    mockExecuteFlow.mockResolvedValue({
      executionId: "exec_cleared_env",
      status: "success",
      steps: [
        {
          stepIndex: 0,
          stepId: "s1",
          type: "navigate",
          status: "success",
          startedAt: "2026-06-06T00:00:00.000Z",
          endedAt: "2026-06-06T00:00:01.000Z",
          durationMs: 1000,
        },
      ],
    });

    const { runFlow } = await loadServicesModule();

    await runFlow("project_service_history", "flow_service_history", {
      showBrowser: false,
      environmentName: "手动覆盖环境",
      baseUrl: "",
      storageStatePath: "",
      variables: {
        username: "alice",
      },
    });

    expect(mockExecuteFlow).toHaveBeenCalledWith(
      expect.objectContaining({ id: "flow_service_history" }),
      expect.objectContaining({
        baseUrl: undefined,
        storageStatePath: undefined,
        environmentName: "手动覆盖环境",
        variables: {
          username: "alice",
        },
      }),
    );
    expect(mockRepoSaveEnvironment).toHaveBeenCalledWith(
      "project_service_history",
      "手动覆盖环境",
      "",
      true,
      undefined,
    );
  });

  it("runFlow 会把完整运行上下文传给 executeFlow 并落库到 runContext", async () => {
    const storageStateDir = mkdtempSync(join(tmpdir(), "flowweave-studio-run-context-"));
    const storageStatePath = join(storageStateDir, "state.json");
    writeFileSync(storageStatePath, JSON.stringify({ cookies: [], origins: [] }), "utf-8");
    mockApiGetFlow.mockResolvedValue(
      buildFlow({
        steps: [
          {
            id: "s1",
            type: "navigate",
            url: "https://example.com/orders",
          },
        ],
      }),
    );
    mockApiAllocateRunDirectory.mockResolvedValue("/tmp/flowweave/run-exec");
    mockExecuteFlow.mockResolvedValue({
      executionId: "exec_run_context",
      status: "success",
      steps: [
        {
          stepIndex: 0,
          stepId: "s1",
          type: "navigate",
          status: "success",
          startedAt: "2026-06-06T00:00:00.000Z",
          endedAt: "2026-06-06T00:00:01.000Z",
          durationMs: 1000,
        },
      ],
    });

    const { runFlow } = await loadServicesModule();

    await runFlow("project_service_history", "flow_service_history", {
      showBrowser: false,
      environmentName: "预发已登录",
      baseUrl: "https://staging.example.com/app",
      storageStatePath,
      variables: {
        username: "alice",
        secret_password: "do-not-store-this",
        retryCount: 2,
        rememberMe: true,
      },
    });

    expect(mockExecuteFlow).toHaveBeenCalledWith(
      expect.objectContaining({ id: "flow_service_history" }),
      expect.objectContaining({
        baseUrl: "https://staging.example.com/app",
        storageStatePath,
        environmentName: "预发已登录",
        variables: {
          username: "alice",
          secret_password: "do-not-store-this",
          retryCount: 2,
          rememberMe: true,
        },
      }),
    );
    expect(mockApiSaveExecution).toHaveBeenCalledWith(
      "project_service_history",
      expect.objectContaining({
        runContext: {
          environmentName: "预发已登录",
          baseUrl: "https://staging.example.com/app",
          storageStatePath,
          variables: {
            username: "alice",
            secret_password: "[已隐藏]",
            retryCount: 2,
            rememberMe: true,
          },
        },
      }),
    );
  });

  it("runFlow 透传取消与进度控制并把 cancelled 幂等落库", async () => {
    mockApiGetFlow.mockResolvedValue(
      buildFlow({
        steps: [{ id: "s1", type: "wait", ms: 1000 }],
      }),
    );
    mockApiAllocateRunDirectory.mockResolvedValue("/tmp/flowweave/run-cancel");
    mockExecuteFlow.mockResolvedValue({
      executionId: "exec_cancelled",
      status: "cancelled",
      steps: [
        {
          stepIndex: 0,
          stepId: "s1",
          type: "wait",
          status: "cancelled",
          startedAt: "2026-08-23T00:00:00.000Z",
          endedAt: "2026-08-23T00:00:00.100Z",
          durationMs: 100,
        },
      ],
    });
    const controller = new AbortController();
    const onProgress = vi.fn();

    const { runFlow } = await loadServicesModule();
    const result = await runFlow("project_service_history", "flow_service_history", {
      showBrowser: false,
      executionId: "exec_cancelled",
      signal: controller.signal,
      onProgress,
    });

    expect(mockExecuteFlow).toHaveBeenCalledWith(
      expect.objectContaining({ id: "flow_service_history" }),
      expect.objectContaining({
        executionId: "exec_cancelled",
        signal: controller.signal,
        onProgress,
      }),
    );
    expect(mockApiSaveExecution).toHaveBeenCalledOnce();
    expect(mockApiSaveExecution).toHaveBeenCalledWith(
      "project_service_history",
      expect.objectContaining({
        executionId: "exec_cancelled",
        status: "cancelled",
        steps: [expect.objectContaining({ status: "skipped" })],
      }),
    );
    expect(result.status).toBe("cancelled");
    expect(result.steps[0]?.status).toBe("skipped");
  });

  it("首步前取消时使用外层 startedAt 落库并在重新回读后保持真实时间", async () => {
    mockApiGetFlow.mockResolvedValue(buildFlow());
    mockApiAllocateRunDirectory.mockResolvedValue("/tmp/flowweave/run-cancel-before-step");
    mockExecuteFlow.mockResolvedValue({
      executionId: "exec_cancelled_before_step",
      status: "cancelled",
      steps: [],
    });

    const { runFlow } = await loadServicesModule();
    const result = await runFlow("project_service_history", "flow_service_history", {
      showBrowser: false,
      executionId: "exec_cancelled_before_step",
    });
    const saved = mockApiSaveExecution.mock.calls[0]?.[1] as
      | Omit<ExecutionWithProject, "projectId">
      | undefined;

    expect(saved?.status).toBe("cancelled");
    expect(saved?.steps).toEqual([]);
    expect(saved?.startedAt).toBe(result.startedAt);
    expect(new Date(saved?.startedAt ?? 0).getUTCFullYear()).toBeGreaterThan(1970);

    vi.resetModules();
    mockApiGetExecution.mockResolvedValue({
      ...saved,
      projectId: "project_service_history",
    });
    const reloadedServices = await loadServicesModule();
    const reloaded = await reloadedServices.getExecution("exec_cancelled_before_step");

    expect(reloaded?.status).toBe("cancelled");
    expect(reloaded?.startedAt).toBe(saved?.startedAt);
    expect(new Date(reloaded?.startedAt ?? 0).getUTCFullYear()).toBeGreaterThan(1970);
  });

  it("返回指定 Flow 最近一次执行输入并把变量转成表单字符串", async () => {
    mockRepoGetLatestExecutionForFlow.mockReturnValue(
      buildExecution({
        executionId: "exec_latest_input",
        finishedAt: "2026-06-06T00:02:00.000Z",
        runContext: {
          environmentName: "预发已登录",
          baseUrl: "https://staging.example.com/app",
          storageStatePath: "/tmp/flowweave/state.json",
          variables: {
            username: "alice",
            secret_password: "[已隐藏]",
            retryCount: 2,
            rememberMe: true,
          },
        },
      }),
    );

    const services = (await loadServicesModule()) as ServicesModule;

    expect(services.getFlowRunInput).toBeTypeOf("function");

    await expect(
      services.getFlowRunInput?.("project_service_history", "flow_service_history"),
    ).resolves.toEqual({
      executionId: "exec_latest_input",
      finishedAt: "2026-06-06T00:02:00.000Z",
      environmentName: "预发已登录",
      baseUrl: "https://staging.example.com/app",
      storageStatePath: "/tmp/flowweave/state.json",
      variables: {
        username: "alice",
        retryCount: "2",
        rememberMe: "true",
      },
    });
  });
});
