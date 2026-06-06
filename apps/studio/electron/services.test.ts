import { beforeEach, describe, expect, it, vi } from "vitest";

import type { FlowDocument } from "@flowweave/flow-dsl";
import type { ExecutionWithProject } from "@flowweave/project-knowledge";
import { FLOW_SCHEMA_VERSION } from "@flowweave/shared";

const mockExecuteFlow = vi.fn();
const mockApiAllocateRunDirectory = vi.fn();
const mockApiCreateProject = vi.fn();
const mockApiGetExecution = vi.fn();
const mockApiGetFlow = vi.fn();
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
const mockRepoGetDefaultEnvironment = vi.fn();
const mockRepoSaveEnvironment = vi.fn();
const mockRepoGetLatestExecutionForFlow = vi.fn();

vi.mock("./env-setup.js", () => ({
  isChromiumInstalled: () => true,
}));

vi.mock("@flowweave/runtime", () => ({
  executeFlow: mockExecuteFlow,
}));

vi.mock("@flowweave/project-knowledge", () => ({
  ProjectKnowledgeRepository: class {
    getDefaultEnvironment() {
      return mockRepoGetDefaultEnvironment();
    }

    saveEnvironment() {
      return mockRepoSaveEnvironment();
    }

    getLatestExecutionForFlow() {
      return mockRepoGetLatestExecutionForFlow();
    }
  },
}));

vi.mock("./knowledge-client.js", () => ({
  apiAllocateRunDirectory: mockApiAllocateRunDirectory,
  apiCreateProject: mockApiCreateProject,
  apiGetExecution: mockApiGetExecution,
  apiGetFlow: mockApiGetFlow,
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
    mockApiGetExecution.mockReset();
    mockApiGetFlow.mockReset();
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
    mockExecuteFlow.mockReset();
    mockRepoGetDefaultEnvironment.mockReset();
    mockRepoSaveEnvironment.mockReset();
    mockRepoGetLatestExecutionForFlow.mockReset();
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

  it("显式清空 baseUrl 与 storageStatePath 时，不再回退到旧默认环境", async () => {
    mockApiGetFlow.mockResolvedValue(buildFlow({
      steps: [
        {
          id: "s1",
          type: "navigate",
          url: "https://example.com/orders",
        },
      ],
    }));
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
    mockApiGetFlow.mockResolvedValue(buildFlow({
      steps: [
        {
          id: "s1",
          type: "navigate",
          url: "https://example.com/orders",
        },
      ],
    }));
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
      storageStatePath: "/tmp/flowweave/state.json",
      variables: {
        username: "alice",
        retryCount: 2,
        rememberMe: true,
      },
    });

    expect(mockExecuteFlow).toHaveBeenCalledWith(
      expect.objectContaining({ id: "flow_service_history" }),
      expect.objectContaining({
        baseUrl: "https://staging.example.com/app",
        storageStatePath: "/tmp/flowweave/state.json",
        environmentName: "预发已登录",
        variables: {
          username: "alice",
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
          storageStatePath: "/tmp/flowweave/state.json",
          variables: {
            username: "alice",
            retryCount: 2,
            rememberMe: true,
          },
        },
      }),
    );
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
            retryCount: 2,
            rememberMe: true,
          },
        },
      }),
    );

    const services = (await loadServicesModule()) as typeof import("./services.js") & {
      getFlowRunInput?: (
        projectId: string,
        flowId: string,
      ) => Promise<unknown>;
    };

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
