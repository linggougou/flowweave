// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FlowDocument } from "@flowweave/flow-dsl";
import type {
  ExecutionSummary,
  StudioApi,
  StudioExecution,
  StudioProject,
} from "./shared/studio-api-types.js";
import { App } from "./App.js";

const STATE_KEY = Symbol.for("flowweave.studio.layout-contract-state");
let currentApi: StudioApi;
vi.mock("./studio-client.js", () => ({ getStudioApi: () => currentApi }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const roots: Root[] = [];
const project: StudioProject = {
  id: "project_assets",
  name: "资产维护",
  createdAt: "2026-08-23T08:00:00.000Z",
  environments: [],
};
const flow: FlowDocument = {
  schemaVersion: 1,
  id: "flow_assets",
  projectId: project.id,
  name: "订单巡检",
  variables: [
    { name: "secret_password", type: "string", required: false, defaultValue: "do-not-show" },
  ],
  steps: [{ id: "s1", type: "navigate", url: "/orders" }],
  meta: { createdAt: project.createdAt, updatedAt: project.createdAt, source: "recorded" },
};

function summary(executionId: string): ExecutionSummary {
  return {
    executionId,
    flowId: flow.id,
    status: "passed",
    startedAt: `2026-08-23T08:0${executionId.at(-1)}:00.000Z`,
  };
}

function detail(executionId: string): StudioExecution {
  return {
    ...summary(executionId),
    projectId: project.id,
    status: "passed",
    steps: [],
    startedAt: summary(executionId).startedAt!,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function button(container: HTMLElement, text: string): HTMLButtonElement {
  const match = Array.from(container.querySelectorAll("button")).find(
    (item) => item.textContent?.trim() === text,
  );
  if (!(match instanceof HTMLButtonElement)) throw new Error(`未找到按钮：${text}`);
  return match;
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function api(overrides: Partial<StudioApi> = {}): StudioApi {
  return {
    nativeFilePortability: true,
    nativeExecutionDeletion: true,
    listProjects: vi.fn().mockResolvedValue([project]),
    createProject: vi.fn(),
    listFlows: vi
      .fn()
      .mockResolvedValue([{ id: flow.id, name: flow.name, createdAt: flow.meta.createdAt }]),
    renameFlow: vi.fn(),
    getFlow: vi.fn().mockResolvedValue(flow),
    importFlowFile: vi.fn().mockResolvedValue({ status: "cancelled" }),
    exportFlowFile: vi.fn().mockResolvedValue({ status: "cancelled" }),
    getFlowRunInput: vi.fn().mockResolvedValue(null),
    runFlow: vi.fn(),
    getExecution: vi.fn(async (executionId) => detail(executionId)),
    listExecutions: vi.fn().mockResolvedValue([]),
    deleteExecution: vi.fn(),
    listFlowVersions: vi.fn().mockResolvedValue([]),
    getFlowVersion: vi.fn().mockResolvedValue(null),
    restoreFlowVersion: vi.fn(),
    openPath: vi.fn().mockResolvedValue({ ok: true }),
    ...overrides,
  };
}

async function render(nextApi: StudioApi) {
  (globalThis as typeof globalThis & { [STATE_KEY]?: unknown })[STATE_KEY] = {
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
  currentApi = nextApi;
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  act(() => root.render(<App />));
  await flush();
  return host;
}

afterEach(async () => {
  while (roots.length) await act(async () => roots.pop()?.unmount());
  document.body.replaceChildren();
  delete (globalThis as typeof globalThis & { [STATE_KEY]?: unknown })[STATE_KEY];
  vi.clearAllMocks();
});

describe("Studio 本地资产维护", () => {
  it("删除当前第 5 条后重新拉取并选择补入的第 6 条", async () => {
    const initial = ["e1", "e2", "e3", "e4", "e5"].map(summary);
    const refreshed = ["e1", "e2", "e3", "e4", "e6"].map(summary);
    const listExecutions = vi.fn().mockResolvedValueOnce(initial).mockResolvedValueOnce(refreshed);
    const deleteExecution = vi.fn().mockResolvedValue({
      projectId: project.id,
      executionId: "e5",
      status: "deleted",
      artifacts: "quarantined",
    });
    const studioApi = api({ listExecutions, deleteExecution });
    const host = await render(studioApi);
    act(() => button(host, "最近运行记录5 条▸").click());
    const row = Array.from(host.querySelectorAll(".execution-history-row"))[4]!;
    act(() => (row.querySelector(".execution-history-item") as HTMLButtonElement).click());
    await flush();
    act(() => (row.querySelector(".execution-history-delete") as HTMLButtonElement).click());
    expect(document.activeElement?.textContent).toBe("取消");
    await act(async () => button(host, "永久删除这条记录").click());
    await flush();

    expect(deleteExecution).toHaveBeenCalledWith(project.id, "e5");
    expect(listExecutions).toHaveBeenCalledTimes(2);
    expect(studioApi.getExecution).toHaveBeenLastCalledWith("e6");
    expect(host.textContent).toContain("已安全隔离在本地回收区");
  });

  it("v1 慢响应不能覆盖 v2，并拒绝 document.id 不匹配", async () => {
    const v1 = deferred<FlowDocument | null>();
    const v2 = deferred<FlowDocument | null>();
    const bad = deferred<FlowDocument | null>();
    let v1Calls = 0;
    const getFlowVersion = vi.fn((_: string, versionId: string) => {
      if (versionId === "v2") return v2.promise;
      v1Calls += 1;
      return v1Calls === 1 ? v1.promise : bad.promise;
    });
    const studioApi = api({
      listFlowVersions: vi.fn().mockResolvedValue([
        {
          id: "v1",
          flowId: flow.id,
          version: 1,
          name: flow.name,
          stepCount: 1,
          createdAt: project.createdAt,
        },
        {
          id: "v2",
          flowId: flow.id,
          version: 2,
          name: flow.name,
          stepCount: 1,
          createdAt: project.createdAt,
        },
      ]),
      getFlowVersion,
    });
    const host = await render(studioApi);
    act(() => button(host, "版本记录").click());
    await flush();
    const versionButtons = host.querySelectorAll<HTMLButtonElement>(".flow-version-summary");
    act(() => versionButtons[0]?.click());
    act(() => versionButtons[1]?.click());
    await act(async () => v2.resolve({ ...flow, name: "安全 v2" }));
    expect(host.textContent).toContain("历史 v2 → 当前任务");
    expect(host.textContent).toContain("敏感值已隐藏");
    expect(host.textContent).not.toContain("do-not-show");
    await act(async () => v1.resolve({ ...flow, name: "过期 v1" }));
    expect(host.textContent).not.toContain("过期 v1");

    act(() => versionButtons[0]?.click());
    await act(async () => bad.resolve({ ...flow, id: "flow_other" }));
    expect(host.textContent).toContain("历史版本与当前任务不匹配");
  });

  it("Browser fallback 不展示删除 capability", async () => {
    const host = await render(
      api({
        nativeExecutionDeletion: false,
        deleteExecution: undefined,
        listExecutions: vi.fn().mockResolvedValue([summary("e1")]),
      }),
    );
    act(() => button(host, "最近运行记录1 条▸").click());
    expect(host.querySelector(".execution-history-delete")).toBeNull();
  });

  it("删除失败时保留确认框与列表选择并通过 alert 报错", async () => {
    const deleteExecution = vi.fn().mockRejectedValue(new Error("未知产物阻止删除"));
    const studioApi = api({
      listExecutions: vi.fn().mockResolvedValue([summary("e1")]),
      deleteExecution,
    });
    const host = await render(studioApi);
    act(() => button(host, "最近运行记录1 条▸").click());
    const row = host.querySelector(".execution-history-row")!;
    act(() => (row.querySelector(".execution-history-item") as HTMLButtonElement).click());
    await flush();
    act(() => (row.querySelector(".execution-history-delete") as HTMLButtonElement).click());
    await act(async () => button(host, "永久删除这条记录").click());
    await flush();

    expect(host.querySelector("[role='dialog']")).not.toBeNull();
    expect(host.querySelector("[role='dialog'] [role='alert']")?.textContent).toContain(
      "未知产物阻止删除",
    );
    expect(row.querySelector(".execution-history-item")?.classList.contains("active")).toBe(true);
    expect(studioApi.listExecutions).toHaveBeenCalledTimes(1);
  });

  it("删除伪响应不刷新列表并以安全错误留在确认框", async () => {
    const studioApi = api({
      listExecutions: vi.fn().mockResolvedValue([summary("e1")]),
      deleteExecution: vi.fn().mockResolvedValue({
        projectId: "project_other",
        executionId: "e1",
        status: "deleted",
        artifacts: "deleted",
      }),
    });
    const host = await render(studioApi);
    act(() => button(host, "最近运行记录1 条▸").click());
    const row = host.querySelector(".execution-history-row")!;
    act(() => (row.querySelector(".execution-history-delete") as HTMLButtonElement).click());
    await act(async () => button(host, "永久删除这条记录").click());
    await flush();

    expect(host.querySelector("[role='dialog'] [role='alert']")?.textContent).toContain(
      "删除结果与请求不匹配",
    );
    expect(studioApi.listExecutions).toHaveBeenCalledTimes(1);
  });
});
