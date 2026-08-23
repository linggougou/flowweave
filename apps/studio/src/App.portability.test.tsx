// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { FlowDocument, FlowPortabilityWarning } from "@flowweave/flow-dsl";
import type { StudioApi, StudioFlowRef, StudioProject } from "./shared/studio-api-types.js";
import { App } from "./App.js";

const LAYOUT_CONTRACT_STATE_KEY = Symbol.for("flowweave.studio.layout-contract-state");
let currentApi: StudioApi;

vi.mock("./studio-client.js", () => ({
  getStudioApi: () => currentApi,
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];

function buildProject(id: string, name: string): StudioProject {
  return { id, name, createdAt: "2026-08-23T08:00:00.000Z", environments: [] };
}

function buildFlow(id: string, projectId: string, name: string): FlowDocument {
  return {
    schemaVersion: 1,
    id,
    projectId,
    name,
    variables: [],
    steps: [{ id: `${id}_navigate`, type: "navigate", url: "/orders" }],
    meta: {
      createdAt: "2026-08-23T08:00:00.000Z",
      updatedAt: "2026-08-23T08:00:00.000Z",
      source: "recorded",
    },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function findButton(container: HTMLElement, text: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll("button")).find(
    (item) => item.textContent?.trim() === text,
  );
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`未找到按钮：${text}`);
  }
  return button;
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function renderApp(
  project: StudioProject,
  flow: FlowDocument,
  api: StudioApi,
): Promise<HTMLElement> {
  const stateGlobal = globalThis as typeof globalThis & {
    [LAYOUT_CONTRACT_STATE_KEY]?: unknown;
  };
  stateGlobal[LAYOUT_CONTRACT_STATE_KEY] = {
    projects: [project],
    selectedProjectId: project.id,
    flows: [{ id: flow.id, name: flow.name, createdAt: flow.meta.createdAt }],
    selectedFlowId: flow.id,
    currentFlow: flow,
    selectedEnvironmentName: "",
    baseUrlDraft: "",
    storageStatePathDraft: "",
    variableInputs: {},
  };
  currentApi = api;
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => root.render(<App />));
  await flush();
  return container;
}

function createApi(
  projects: StudioProject[],
  flowsByProject: Record<string, FlowDocument[]>,
  overrides: Partial<StudioApi> = {},
): StudioApi {
  const flowRefs = (projectId: string): StudioFlowRef[] =>
    (flowsByProject[projectId] ?? []).map((flow) => ({
      id: flow.id,
      name: flow.name,
      createdAt: flow.meta.createdAt,
    }));
  return {
    listProjects: vi.fn().mockResolvedValue(projects),
    createProject: vi.fn(),
    listFlows: vi.fn(async (projectId) => flowRefs(projectId)),
    renameFlow: vi.fn(),
    getFlow: vi.fn(async (projectId, flowId) => {
      const flow = (flowsByProject[projectId] ?? []).find((item) => item.id === flowId);
      if (!flow) throw new Error("Flow 不存在");
      return flow;
    }),
    getFlowRunInput: vi.fn().mockResolvedValue(null),
    importFlowFile: vi.fn().mockResolvedValue({ status: "cancelled" }),
    exportFlowFile: vi.fn().mockResolvedValue({ status: "cancelled" }),
    runFlow: vi.fn(),
    cancelExecution: vi.fn(),
    getExecution: vi.fn().mockResolvedValue(null),
    listExecutions: vi.fn().mockResolvedValue([]),
    listFlowVersions: vi.fn().mockResolvedValue([]),
    getFlowVersion: vi.fn().mockResolvedValue(null),
    restoreFlowVersion: vi.fn(),
    openPath: vi.fn().mockResolvedValue({ ok: true }),
    ...overrides,
  };
}

afterEach(async () => {
  while (roots.length > 0) {
    const root = roots.pop();
    await act(async () => root?.unmount());
  }
  document.body.replaceChildren();
  const stateGlobal = globalThis as typeof globalThis & {
    [LAYOUT_CONTRACT_STATE_KEY]?: unknown;
  };
  delete stateGlobal[LAYOUT_CONTRACT_STATE_KEY];
  vi.clearAllMocks();
});

describe("App Flow 导入导出", () => {
  it("导入成功后刷新列表、选中新副本并按真实 warning 数提醒补齐输入", async () => {
    const project = buildProject("project_a", "项目 A");
    const source = buildFlow("flow_a", project.id, "订单回归");
    const imported = buildFlow("flow_imported", project.id, "订单回归（导入）");
    const warnings: FlowPortabilityWarning[] = [
      {
        code: "secret-default-removed",
        path: "variables[0].defaultValue",
        message: "已移除敏感默认值",
        variableName: "secret_password",
      },
    ];
    const flowsByProject = { [project.id]: [source] };
    const api = createApi([project], flowsByProject, {
      importFlowFile: vi.fn<StudioApi["importFlowFile"]>(async () => {
        flowsByProject[project.id]?.push(imported);
        return { status: "imported", flow: imported, warnings };
      }),
    });
    const container = await renderApp(project, source, api);

    await act(async () => {
      findButton(container, "导入 JSON").click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(api.importFlowFile).toHaveBeenCalledWith(project.id);
    expect(api.listFlows).toHaveBeenCalledWith(project.id);
    expect(container.textContent).toContain("订单回归（导入）");
    expect(container.querySelector(".flow-list-item.active")?.textContent).toContain(
      "订单回归（导入）",
    );
    expect(container.textContent).toContain("1 条安全处理提醒");
    expect(container.textContent).toContain("补齐运行所需输入");
    expect(container.textContent).toContain("检查业务文本");
  });

  it("导入等待期间切换项目时，旧响应不会污染新项目选择", async () => {
    const projectA = buildProject("project_a", "项目 A");
    const projectB = buildProject("project_b", "项目 B");
    const flowA = buildFlow("flow_a", projectA.id, "A 任务");
    const flowB = buildFlow("flow_b", projectB.id, "B 任务");
    const imported = buildFlow("flow_imported", projectA.id, "A 任务（导入）");
    const pendingImport = deferred<Awaited<ReturnType<StudioApi["importFlowFile"]>>>();
    const flowsByProject = {
      [projectA.id]: [flowA],
      [projectB.id]: [flowB],
    };
    const api = createApi([projectA, projectB], flowsByProject, {
      importFlowFile: vi.fn(() => pendingImport.promise),
    });
    const container = await renderApp(projectA, flowA, api);

    act(() => findButton(container, "导入 JSON").click());
    act(() => findButton(container, "项目 B").click());
    await flush();

    await act(async () => {
      pendingImport.resolve({ status: "imported", flow: imported, warnings: [] });
      await pendingImport.promise;
      await Promise.resolve();
    });

    expect(container.querySelector(".workspace-breadcrumb")?.textContent).toContain("项目 B");
    expect(container.querySelector(".flow-list-item.active")?.textContent).toContain("B 任务");
    expect(container.querySelector(".flow-list-item.active")?.textContent).not.toContain(
      "A 任务（导入）",
    );
    expect(findButton(container, "导入 JSON").disabled).toBe(false);
  });

  it("导出取消保持安静，只有实际写入后才提示真实 warning 数", async () => {
    const project = buildProject("project_a", "项目 A");
    const flow = buildFlow("flow_a", project.id, "订单回归");
    const exportFlowFile = vi
      .fn<StudioApi["exportFlowFile"]>()
      .mockResolvedValueOnce({ status: "cancelled" })
      .mockResolvedValueOnce({
        status: "exported",
        warnings: [
          {
            code: "password-value-variableized",
            path: "steps[1].value",
            message: "已替换密码字面量",
            variableName: "secret_password",
          },
        ],
      });
    const api = createApi([project], { [project.id]: [flow] }, { exportFlowFile });
    const container = await renderApp(project, flow, api);

    await act(async () => {
      findButton(container, "导出 JSON").click();
      await Promise.resolve();
    });
    expect(container.textContent).not.toContain("已导出");

    await act(async () => {
      findButton(container, "导出 JSON").click();
      await Promise.resolve();
    });
    expect(exportFlowFile).toHaveBeenCalledWith(project.id, flow.id);
    expect(container.textContent).toContain("已导出");
    expect(container.textContent).toContain("1 条安全处理提醒");
    expect(container.textContent).not.toContain("完全脱敏");
  });

  it("导出写入失败显示错误且不伪报成功", async () => {
    const project = buildProject("project_a", "项目 A");
    const flow = buildFlow("flow_a", project.id, "订单回归");
    const api = createApi([project], { [project.id]: [flow] }, {
      exportFlowFile: vi.fn().mockRejectedValue(new Error("无法写入所选文件")),
    });
    const container = await renderApp(project, flow, api);

    await act(async () => {
      findButton(container, "导出 JSON").click();
      await Promise.resolve();
    });

    expect(container.querySelector("[role='alert']")?.textContent).toContain("无法写入所选文件");
    expect(container.textContent).not.toContain("已导出");
  });
});
