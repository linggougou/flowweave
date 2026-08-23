// @vitest-environment happy-dom

import { act } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

const project: StudioProject = {
  id: "project_preview",
  name: "截图预览",
  createdAt: "2026-08-23T08:00:00.000Z",
  environments: [],
};

const flow: FlowDocument = {
  schemaVersion: 1,
  id: "flow_preview",
  projectId: project.id,
  name: "订单提交",
  variables: [],
  steps: [{ id: "s1", type: "click", target: { strategies: [{ kind: "css", selector: "#submit" }] } }],
  meta: {
    createdAt: "2026-08-23T08:00:00.000Z",
    updatedAt: "2026-08-23T08:00:00.000Z",
    source: "recorded",
  },
};

function summary(executionId: string): ExecutionSummary {
  return {
    executionId,
    flowId: flow.id,
    status: "failed",
    startedAt: "2026-08-23T08:05:00.000Z",
  };
}

function detail(executionId: string): StudioExecution {
  return {
    ...summary(executionId),
    projectId: project.id,
    status: "failed",
    startedAt: "2026-08-23T08:05:00.000Z",
    steps: [
      {
        stepIndex: 0,
        stepId: "s1",
        label: "点击提交",
        status: "failed",
        message: "按钮被遮挡",
        startedAt: "2026-08-23T08:05:01.000Z",
        finishedAt: "2026-08-23T08:05:02.000Z",
        hasScreenshot: true,
      },
    ],
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((next, fail) => {
    resolve = next;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function button(container: ParentNode, text: string): HTMLButtonElement {
  const match = Array.from(container.querySelectorAll("button")).find(
    (item) => item.textContent?.trim() === text,
  );
  if (!(match instanceof HTMLButtonElement)) {
    throw new Error(`未找到按钮：${text}`);
  }
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
    nativeExecutionScreenshotPreview: true,
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
    listExecutions: vi.fn().mockResolvedValue([summary("exec_preview_1")]),
    deleteExecution: vi.fn(),
    listFlowVersions: vi.fn().mockResolvedValue([]),
    getFlowVersion: vi.fn().mockResolvedValue(null),
    restoreFlowVersion: vi.fn(),
    getExecutionScreenshotPreview: vi.fn(),
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

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:http://127.0.0.1/preview-1");
  URL.revokeObjectURL = vi.fn();
});

afterEach(async () => {
  while (roots.length) {
    await act(async () => roots.pop()?.unmount());
  }
  document.body.replaceChildren();
  delete (globalThis as typeof globalThis & { [STATE_KEY]?: unknown })[STATE_KEY];
  URL.createObjectURL = originalCreateObjectURL;
  URL.revokeObjectURL = originalRevokeObjectURL;
  vi.clearAllMocks();
});

describe("App 执行截图预览", () => {
  it("点击步骤截图后通过固定业务 ID 加载内嵌预览，并在关闭时回收 Blob URL", async () => {
    const preview = deferred<Awaited<ReturnType<StudioApi["getExecutionScreenshotPreview"]>>>();
    const studioApi = api({
      getExecutionScreenshotPreview: vi.fn(() => preview.promise),
    });
    const host = await render(studioApi);

    act(() => button(host, "最近运行记录1 条▸").click());
    act(() =>
      (
        host.querySelector(
          ".sidebar-section-executions .execution-history-item",
        ) as HTMLButtonElement | null
      )?.click(),
    );
    await flush();

    const trigger = button(host, "步骤截图");
    act(() => {
      trigger.focus();
      trigger.click();
    });
    expect(host.textContent).toContain("正在加载截图");

    await act(async () =>
      preview.resolve({
        status: "available",
        mediaType: "image/png",
        bytes: new Uint8Array([137, 80, 78, 71]),
        width: 2,
        height: 2,
      }),
    );

    expect(studioApi.getExecutionScreenshotPreview).toHaveBeenCalledWith(
      {
        projectId: project.id,
        executionId: "exec_preview_1",
        stepIndex: 0,
      },
    );
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(host.querySelector("img")?.getAttribute("src")).toBe("blob:http://127.0.0.1/preview-1");
    expect(host.innerHTML).not.toContain("/Users/");

    act(() => button(host, "关闭").click());
    await flush();

    expect(host.querySelector("[role='dialog']")).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:http://127.0.0.1/preview-1");
    expect(document.activeElement).toBe(trigger);
  });

  it("旧请求迟到时不会覆盖已经切换后的步骤状态", async () => {
    const first = deferred<Awaited<ReturnType<StudioApi["getExecutionScreenshotPreview"]>>>();
    const second = deferred<Awaited<ReturnType<StudioApi["getExecutionScreenshotPreview"]>>>();
    const getExecutionScreenshotPreview = vi
      .fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    const studioApi = api({ getExecutionScreenshotPreview });
    const host = await render(studioApi);

    act(() => button(host, "最近运行记录1 条▸").click());
    act(() =>
      (
        host.querySelector(
          ".sidebar-section-executions .execution-history-item",
        ) as HTMLButtonElement | null
      )?.click(),
    );
    await flush();

    const trigger = button(host, "步骤截图");
    act(() => trigger.click());
    act(() => button(host, "关闭").click());
    await flush();
    act(() => trigger.click());

    await act(async () => {
      second.resolve({ status: "absent" });
      await second.promise;
    });
    expect(host.textContent).toContain("没有可预览的截图");

    await act(async () => {
      first.resolve({
        status: "available",
        mediaType: "image/png",
        bytes: new Uint8Array([137, 80, 78, 71]),
        width: 4,
        height: 4,
      });
      await first.promise;
    });

    expect(host.querySelector("img")).toBeNull();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it("切换执行时立即关闭预览并回收旧 Blob URL", async () => {
    const studioApi = api({
      listExecutions: vi
        .fn()
        .mockResolvedValue([summary("exec_preview_1"), summary("exec_preview_2")]),
      getExecutionScreenshotPreview: vi.fn().mockResolvedValue({
        status: "available",
        mediaType: "image/png",
        bytes: new Uint8Array([137, 80, 78, 71]),
        width: 2,
        height: 2,
      }),
    });
    const host = await render(studioApi);

    act(() => button(host, "最近运行记录2 条▸").click());
    const executionButtons = () =>
      Array.from(
        host.querySelectorAll<HTMLButtonElement>(
          ".sidebar-section-executions .execution-history-item",
        ),
      );
    act(() => executionButtons()[0]?.click());
    await flush();
    act(() => button(host, "步骤截图").click());
    await flush();

    act(() => executionButtons()[1]?.click());
    await flush();

    expect(host.querySelector("[role='dialog']")).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:http://127.0.0.1/preview-1");
  });

  it("切换执行的新 render 已提交但 passive effect 尚未清理时，旧请求拒绝也不能污染新上下文", async () => {
    const pending = deferred<Awaited<ReturnType<StudioApi["getExecutionScreenshotPreview"]>>>();
    const studioApi = api({
      listExecutions: vi
        .fn()
        .mockResolvedValue([summary("exec_preview_1"), summary("exec_preview_2")]),
      getExecutionScreenshotPreview: vi.fn(() => pending.promise),
    });
    const host = await render(studioApi);

    act(() => button(host, "最近运行记录2 条▸").click());
    const executionButtons = Array.from(
      host.querySelectorAll<HTMLButtonElement>(
        ".sidebar-section-executions .execution-history-item",
      ),
    );
    act(() => executionButtons[0]?.click());
    await flush();
    act(() => button(host, "步骤截图").click());
    expect(host.textContent).toContain("正在加载截图");

    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
      .IS_REACT_ACT_ENVIRONMENT = false;
    try {
      flushSync(() => executionButtons[1]?.click());
      pending.reject(new Error("旧截图请求失败：/Users/alice/private.png"));
      await pending.promise.catch(() => undefined);
      flushSync(() => undefined);
    } finally {
      (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
        .IS_REACT_ACT_ENVIRONMENT = true;
    }

    expect(host.textContent).not.toContain("旧截图请求失败");
    expect(host.textContent).not.toContain("/Users/alice/private.png");
    expect(host.textContent).not.toContain("没有可预览的截图");
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    await flush();
    expect(host.querySelector("[role='dialog']")).toBeNull();
  });

  it("组件卸载时使请求失效并回收已创建的 Blob URL", async () => {
    const studioApi = api({
      getExecutionScreenshotPreview: vi.fn().mockResolvedValue({
        status: "available",
        mediaType: "image/png",
        bytes: new Uint8Array([137, 80, 78, 71]),
        width: 2,
        height: 2,
      }),
    });
    const host = await render(studioApi);

    act(() => button(host, "最近运行记录1 条▸").click());
    act(() =>
      (
        host.querySelector(
          ".sidebar-section-executions .execution-history-item",
        ) as HTMLButtonElement | null
      )?.click(),
    );
    await flush();
    act(() => button(host, "步骤截图").click());
    await flush();

    const root = roots.pop();
    await act(async () => root?.unmount());

    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:http://127.0.0.1/preview-1");
  });
});
