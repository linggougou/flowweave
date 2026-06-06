import { beforeEach, describe, expect, it, vi } from "vitest";

import type { FlowDocument } from "@flowweave/flow-dsl";
import type { ExecutionWithProject } from "@flowweave/project-knowledge";
import { FLOW_SCHEMA_VERSION } from "@flowweave/shared";

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

vi.mock("./env-setup.js", () => ({
  isChromiumInstalled: () => true,
}));

vi.mock("@flowweave/runtime", () => ({
  executeFlow: vi.fn(),
}));

vi.mock("@flowweave/project-knowledge", () => ({
  ProjectKnowledgeRepository: class {
    getDefaultEnvironment() {
      return undefined;
    }

    saveEnvironment() {
      return undefined;
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
});
