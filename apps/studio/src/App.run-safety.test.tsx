// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { FlowDocument, NormalizedStep } from "@flowweave/flow-dsl";
import { FLOW_SCHEMA_VERSION } from "@flowweave/shared";

import type {
  RunFlowResult,
  StudioApi,
  StudioExecution,
  StudioExecutionProgressEvent,
  StudioFlowRef,
  StudioProject,
} from "./shared/studio-api-types.js";
import { App } from "./App.js";

const LAYOUT_CONTRACT_STATE_KEY = Symbol.for("flowweave.studio.layout-contract-state");

let currentApi: StudioApi;

vi.mock("./studio-client.js", () => ({
  getStudioApi: () => currentApi,
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const mountedRoots: Root[] = [];
const mountedContainers: HTMLElement[] = [];

type LayoutContractRenderState = {
  projects: StudioProject[];
  selectedProjectId: string;
  flows: StudioFlowRef[];
  selectedFlowId: string;
  currentFlow: FlowDocument;
  selectedEnvironmentName: string;
  baseUrlDraft: string;
  storageStatePathDraft: string;
  variableInputs: Record<string, string>;
};

function buildProject(): StudioProject {
  return {
    id: "project_run_safe",
    name: "风控回归项目",
    createdAt: "2026-08-23T08:00:00.000Z",
    baseUrl: "https://ops.example.test",
    environments: [
      {
        name: "正式环境",
        baseUrl: "https://ops.example.test",
        isDefault: true,
        storageStatePath: "/tmp/ops-auth.json",
      },
    ],
  };
}

function buildFlow(name: string, steps: NormalizedStep[]): FlowDocument {
  return {
    schemaVersion: FLOW_SCHEMA_VERSION,
    id: "flow_run_safe",
    projectId: "project_run_safe",
    name,
    variables: [],
    steps,
    meta: {
      createdAt: "2026-08-23T08:00:00.000Z",
      updatedAt: "2026-08-23T08:00:00.000Z",
      source: "recorded",
    },
  };
}

function buildExecution(flow: FlowDocument, status: StudioExecution["status"]): StudioExecution {
  return {
    executionId: "exec_run_safe",
    projectId: flow.projectId,
    flowId: flow.id,
    status,
    steps: [],
    startedAt: "2026-08-23T08:01:00.000Z",
    finishedAt: "2026-08-23T08:02:00.000Z",
    environmentName: "正式环境",
    flowSnapshot: flow,
  };
}

function setLayoutContractState(flow: FlowDocument): void {
  const project = buildProject();
  const flows: StudioFlowRef[] = [
    {
      id: flow.id,
      name: flow.name,
      createdAt: "2026-08-23T08:00:00.000Z",
      revision: 1,
      schemaVersion: flow.schemaVersion,
    },
  ];

  const testGlobal = globalThis as typeof globalThis & {
    [LAYOUT_CONTRACT_STATE_KEY]?: LayoutContractRenderState;
  };
  testGlobal[LAYOUT_CONTRACT_STATE_KEY] = {
    projects: [project],
    selectedProjectId: project.id,
    flows,
    selectedFlowId: flow.id,
    currentFlow: flow,
    selectedEnvironmentName: "正式环境",
    baseUrlDraft: project.baseUrl ?? "",
    storageStatePathDraft: "/tmp/ops-auth.json",
    variableInputs: {},
  };
}

function clearLayoutContractState(): void {
  const testGlobal = globalThis as typeof globalThis & {
    [LAYOUT_CONTRACT_STATE_KEY]?: LayoutContractRenderState;
  };
  delete testGlobal[LAYOUT_CONTRACT_STATE_KEY];
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

function findButtonByText(container: HTMLElement, text: string): HTMLButtonElement | null {
  return Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent?.trim() === text,
  ) as HTMLButtonElement | null;
}

async function flushEffects(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function createApiHarness(flow: FlowDocument, overrides: Partial<StudioApi> = {}) {
  let progressListener: ((event: StudioExecutionProgressEvent) => void) | undefined;
  const unsubscribe = vi.fn();
  const api: StudioApi = {
    nativeFilePortability: true,
    nativeExecutionScreenshotPreview: false,
    listProjects: vi.fn().mockResolvedValue([buildProject()]),
    createProject: vi.fn(),
    listFlows: vi.fn().mockResolvedValue([
      {
        id: flow.id,
        name: flow.name,
        createdAt: "2026-08-23T08:00:00.000Z",
      },
    ]),
    renameFlow: vi.fn(),
    getFlow: vi.fn().mockResolvedValue(flow),
    getFlowRunInput: vi.fn().mockResolvedValue(null),
    importFlowFile: vi.fn().mockResolvedValue({ status: "cancelled" }),
    exportFlowFile: vi.fn().mockResolvedValue({ status: "cancelled" }),
    runFlow: vi.fn<StudioApi["runFlow"]>().mockResolvedValue({
      executionId: "exec_run_safe",
      status: "passed",
    } satisfies RunFlowResult),
    cancelExecution: vi.fn().mockResolvedValue({
      accepted: true,
      alreadyCancelled: false,
    }),
    onExecutionProgress: vi.fn((listener) => {
      progressListener = listener;
      return unsubscribe;
    }),
    getExecution: vi.fn().mockResolvedValue(buildExecution(flow, "passed")),
    listExecutions: vi.fn().mockResolvedValue([]),
    listFlowVersions: vi.fn().mockResolvedValue([]),
    getFlowVersion: vi.fn().mockResolvedValue(null),
    restoreFlowVersion: vi.fn(),
    getExecutionScreenshotPreview: vi.fn().mockResolvedValue({ status: "absent" }),
    ...overrides,
  };
  return {
    api,
    emitProgress(event: StudioExecutionProgressEvent) {
      if (!progressListener) {
        throw new Error("progress listener 尚未注册");
      }
      act(() => {
        progressListener?.(event);
      });
    },
    unsubscribe,
  };
}

async function renderHarness(flow: FlowDocument, api: StudioApi) {
  setLayoutContractState(flow);
  currentApi = api;
  const container = document.createElement("div");
  document.body.append(container);
  mountedContainers.push(container);
  const root = createRoot(container);
  mountedRoots.push(root);
  act(() => {
    root.render(<App />);
  });
  await flushEffects();
  return { container, root };
}

afterEach(async () => {
  while (mountedRoots.length > 0) {
    const root = mountedRoots.pop();
    if (!root) {
      continue;
    }
    await act(async () => {
      root.unmount();
    });
  }
  for (const container of mountedContainers.splice(0)) {
    container.remove();
  }
  clearLayoutContractState();
  vi.clearAllMocks();
});

describe("App 运行前确认与进度集成", () => {
  it("所有运行都会先展示确认，再显式确认后才调用 runFlow", async () => {
    const flow = buildFlow("查看订单状态", [
      { id: "navigate", type: "navigate", url: "/orders" },
    ]);
    const { api } = createApiHarness(flow);
    const { container } = await renderHarness(flow, api);

    expect(api.runFlow).not.toHaveBeenCalled();

    act(() => {
      findButtonByText(container, "运行任务")?.click();
    });

    expect(container.textContent).toContain("运行前确认");
    expect(api.runFlow).not.toHaveBeenCalled();

    await act(async () => {
      container.querySelector<HTMLButtonElement>("[data-action='confirm-run']")?.click();
      await Promise.resolve();
    });

    expect(api.runFlow).toHaveBeenCalledOnce();
  });

  it("高风险任务在勾选确认前禁止继续运行", async () => {
    const flow = buildFlow("删除旧报表", [
      {
        id: "delete",
        type: "click",
        label: "删除旧报表",
        target: {
          strategies: [{ kind: "role", role: "button", name: "删除" }],
        },
      },
    ]);
    const { api } = createApiHarness(flow);
    const { container } = await renderHarness(flow, api);

    act(() => {
      findButtonByText(container, "运行任务")?.click();
    });

    const confirm = container.querySelector<HTMLButtonElement>("[data-action='confirm-run']");
    const riskCheckbox = container.querySelector<HTMLInputElement>(
      ".run-risk-warning input[type='checkbox']",
    );

    expect(confirm?.disabled).toBe(true);
    expect(container.textContent).toContain("该任务包含高风险操作");

    act(() => {
      riskCheckbox?.click();
    });

    expect(confirm?.disabled).toBe(false);

    await act(async () => {
      confirm?.click();
      await Promise.resolve();
    });

    expect(api.runFlow).toHaveBeenCalledOnce();
  });

  it("只有拿到 executionId 后才允许取消，并在卸载时清理 progress 订阅", async () => {
    const flow = buildFlow("批量同步报表", [
      { id: "navigate", type: "navigate", url: "/reports" },
      {
        id: "fill",
        type: "fill",
        value: "2026-08-23",
        target: { strategies: [{ kind: "css", selector: "#report-date" }] },
      },
    ]);
    const runDeferred = deferred<RunFlowResult>();
    const harness = createApiHarness(flow, {
      runFlow: vi.fn<StudioApi["runFlow"]>().mockImplementation(() => runDeferred.promise),
      getExecution: vi.fn().mockResolvedValue(buildExecution(flow, "cancelled")),
    });
    const { container, root } = await renderHarness(flow, harness.api);

    expect(harness.api.onExecutionProgress).toHaveBeenCalledOnce();

    act(() => {
      findButtonByText(container, "运行任务")?.click();
    });
    await act(async () => {
      container.querySelector<HTMLButtonElement>("[data-action='confirm-run']")?.click();
      await Promise.resolve();
    });

    expect(container.querySelector("[data-action='cancel-run']")).toBeNull();

    harness.emitProgress({
      type: "started",
      executionId: "exec_run_safe",
      totalSteps: 2,
      completedSteps: 0,
      currentAction: "正在准备运行",
    });

    const cancelButton = container.querySelector<HTMLButtonElement>("[data-action='cancel-run']");
    expect(cancelButton).not.toBeNull();

    await act(async () => {
      cancelButton?.click();
      await Promise.resolve();
    });

    expect(harness.api.cancelExecution).toHaveBeenCalledWith("exec_run_safe");

    harness.emitProgress({
      type: "cancelled",
      executionId: "exec_run_safe",
      totalSteps: 2,
      completedSteps: 0,
      currentAction: "已取消运行",
    });

    await act(async () => {
      runDeferred.resolve({
        executionId: "exec_run_safe",
        status: "cancelled",
      });
      await runDeferred.promise;
      await Promise.resolve();
    });

    expect(container.textContent).toContain("已取消运行");

    await act(async () => {
      root.unmount();
    });

    expect(harness.unsubscribe).toHaveBeenCalledOnce();
  });
});
