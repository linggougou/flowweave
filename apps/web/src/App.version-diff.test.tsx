// @vitest-environment happy-dom

import { readFileSync } from "node:fs";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { FlowDocument } from "@flowweave/flow-dsl";
import type { ExecutionResult, FlowVersionRecord } from "@flowweave/project-knowledge";

import { App } from "./App.js";

const apiMocks = vi.hoisted(() => ({
  listProjects: vi.fn(),
  listFlows: vi.fn(),
  getFlow: vi.fn(),
  listFlowVersions: vi.fn(),
  getFlowVersion: vi.fn(),
  restoreFlowVersion: vi.fn(),
  listExecutions: vi.fn(),
  getExecution: vi.fn(),
  renameFlow: vi.fn(),
}));

vi.mock("./api.js", () => apiMocks);

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const projects = [
  { id: "project-a", name: "项目 A", createdAt: "2026-08-23T08:00:00.000Z" },
  { id: "project-b", name: "项目 B", createdAt: "2026-08-23T09:00:00.000Z" },
];

const flows = {
  "project-a": [
    { id: "flow-a", name: "自动化 A", createdAt: "2026-08-23T08:00:00.000Z" },
    { id: "flow-a2", name: "自动化 A2", createdAt: "2026-08-23T08:10:00.000Z" },
  ],
  "project-b": [{ id: "flow-b", name: "自动化 B", createdAt: "2026-08-23T09:00:00.000Z" }],
};

function flowDocument(
  projectId: string,
  flowId: string,
  name: string,
  overrides: Partial<FlowDocument> = {},
): FlowDocument {
  return {
    schemaVersion: 1,
    id: flowId,
    projectId,
    name,
    variables: [],
    steps: [{ id: "open", type: "navigate", url: "https://example.test" }],
    meta: {
      createdAt: "2026-08-23T08:00:00.000Z",
      updatedAt: "2026-08-23T08:00:00.000Z",
      source: "recorded",
    },
    ...overrides,
  };
}

function sensitiveFlow(
  flowId: string,
  name: string,
  password: string,
  overrides: Partial<FlowDocument> = {},
): FlowDocument {
  return flowDocument("project-a", flowId, name, {
    variables: [
      { name: "secret_password", type: "string", required: false, defaultValue: password },
    ],
    steps: [
      {
        id: "password-step",
        type: "fill",
        target: {
          strategies: [{ kind: "css", selector: "input[type='password']" }],
          hints: { inputType: "password", placeholder: password, textSample: password },
        },
        value: password,
      },
    ],
    ...overrides,
  });
}

function version(id: string, number: number, flowId = "flow-a"): FlowVersionRecord {
  return {
    id,
    flowId,
    projectId: "project-a",
    version: number,
    name: `历史 ${number}`,
    stepCount: 1,
    createdAt: `2026-08-23T0${number}:00:00.000Z`,
  };
}

function execution(executionId: string, flowId: string): ExecutionResult {
  return {
    executionId,
    flowId,
    status: "success",
    startedAt: "2026-08-23T08:00:00.000Z",
    finishedAt: "2026-08-23T08:00:01.000Z",
    steps: [],
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((accept, decline) => {
    resolve = accept;
    reject = decline;
  });
  return { promise, resolve, reject };
}

async function flushEffects(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

function button(container: HTMLElement, label: string): HTMLButtonElement {
  const found = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
    (item) => item.textContent?.trim() === label || item.getAttribute("aria-label") === label,
  );
  if (!found) throw new Error(`没有找到按钮：${label}`);
  return found;
}

function buttonContaining(container: HTMLElement, label: string): HTMLButtonElement {
  const found = [...container.querySelectorAll<HTMLButtonElement>("button")].find((item) =>
    item.textContent?.includes(label),
  );
  if (!found) throw new Error(`没有找到包含文本的按钮：${label}`);
  return found;
}

describe("Web 版本只读 Diff 与请求守卫", () => {
  let root: Root | null;
  let container: HTMLDivElement;

  beforeEach(() => {
    apiMocks.listProjects.mockReset().mockResolvedValue(projects);
    apiMocks.listFlows
      .mockReset()
      .mockImplementation(async (projectId: keyof typeof flows) => [...(flows[projectId] ?? [])]);
    apiMocks.getFlow
      .mockReset()
      .mockImplementation(async (projectId: string, flowId: string) =>
        flowDocument(projectId, flowId, `当前 ${flowId}`),
      );
    apiMocks.listFlowVersions.mockReset().mockResolvedValue([]);
    apiMocks.getFlowVersion.mockReset();
    apiMocks.restoreFlowVersion.mockReset();
    apiMocks.listExecutions.mockReset().mockResolvedValue([]);
    apiMocks.getExecution.mockReset();
    apiMocks.renameFlow.mockReset();

    container = document.createElement("div");
    document.body.append(container);
    root = null;
  });

  async function mount(): Promise<void> {
    const mountedRoot = createRoot(container);
    root = mountedRoot;
    await act(async () => mountedRoot.render(<App />));
    await flushEffects();
  }

  afterEach(() => {
    if (root) act(() => root?.unmount());
    container.remove();
  });

  it("固定展示历史 vN 到当前任务的安全副本、数量摘要与专业详情", async () => {
    apiMocks.getFlow.mockResolvedValueOnce(
      sensitiveFlow("flow-a", "当前任务", "current-top-secret", {
        description: "当前说明",
      }),
    );
    apiMocks.listFlowVersions.mockResolvedValueOnce([version("version-1", 1)]);
    apiMocks.getFlowVersion.mockReturnValueOnce(
      Promise.resolve(sensitiveFlow("flow-a", "历史任务", "historic-top-secret")),
    );

    await mount();
    act(() => button(container, "版本记录").click());
    await flushEffects();

    const versionButton = buttonContaining(container, "v1 · 历史 1");
    act(() => versionButton.click());
    await flushEffects();

    expect(versionButton.getAttribute("aria-pressed")).toBe("true");
    expect(container.textContent).toContain("历史 v1 → 当前任务");
    expect(container.textContent).toContain("敏感值已隐藏");
    expect(container.textContent).toMatch(/新增 \d+ · 删除 \d+ · 修改 \d+/);
    expect(container.querySelector(".version-diff-summary")).not.toBeNull();
    expect(container.querySelector(".json-diff")).not.toBeNull();
    expect(container.textContent).not.toContain("historic-top-secret");
    expect(container.textContent).not.toContain("current-top-secret");
    expect(container.querySelector("textarea, [contenteditable='true']")).toBeNull();
  });

  it("选择新版本时立即清空旧 Diff，并忽略旧版本的慢响应", async () => {
    const first = deferred<FlowDocument>();
    const second = deferred<FlowDocument>();
    apiMocks.listFlowVersions.mockResolvedValueOnce([
      version("version-1", 1),
      version("version-2", 2),
    ]);
    apiMocks.getFlowVersion.mockImplementation((_projectId: string, versionId: string) =>
      versionId === "version-1" ? first.promise : second.promise,
    );

    await mount();
    act(() => button(container, "版本记录").click());
    await flushEffects();

    act(() => buttonContaining(container, "v1 · 历史 1").click());
    expect(container.querySelector("[role='status']")?.textContent).toContain("正在加载历史版本");
    act(() => buttonContaining(container, "v2 · 历史 2").click());
    expect(container.querySelector(".json-diff")).toBeNull();

    first.resolve(flowDocument("project-a", "flow-a", "过期历史版本"));
    await flushEffects();
    expect(container.textContent).not.toContain("历史 v1 → 当前任务");
    expect(container.querySelector("[role='status']")?.textContent).toContain("正在加载历史版本");

    second.resolve(flowDocument("project-a", "flow-a", "生效历史版本"));
    await flushEffects();
    expect(container.textContent).toContain("历史 v2 → 当前任务");
  });

  it("Diff 截断时明确三类数量只统计前 500 处", async () => {
    const currentSteps = Array.from({ length: 501 }, (_, index) => ({
      id: `step-${index}`,
      type: "navigate" as const,
      url: `https://current.example/${index}`,
    }));
    const historicalSteps = currentSteps.map((step, index) => ({
      ...step,
      url: `https://history.example/${index}`,
    }));
    apiMocks.getFlow.mockResolvedValueOnce(
      flowDocument("project-a", "flow-a", "当前任务", { steps: currentSteps }),
    );
    apiMocks.listFlowVersions.mockResolvedValueOnce([
      { ...version("version-1", 1), stepCount: historicalSteps.length },
    ]);
    apiMocks.getFlowVersion.mockResolvedValueOnce(
      flowDocument("project-a", "flow-a", "当前任务", { steps: historicalSteps }),
    );

    await mount();
    act(() => button(container, "版本记录").click());
    act(() => buttonContaining(container, "v1 · 历史 1").click());
    await flushEffects();

    expect(container.querySelector(".version-diff-summary")?.textContent).toContain(
      "共 501 处变化；前 500 处中：新增 0 · 删除 0 · 修改 500",
    );
  });

  it("拒绝展示 flowId 不匹配的历史文档且错误不泄露文档标识", async () => {
    apiMocks.listFlowVersions.mockResolvedValueOnce([version("version-1", 1)]);
    apiMocks.getFlowVersion.mockResolvedValueOnce(
      flowDocument("project-a", "foreign-sensitive-flow-id", "越权版本"),
    );

    await mount();
    act(() => button(container, "版本记录").click());
    await flushEffects();
    act(() => buttonContaining(container, "v1 · 历史 1").click());
    await flushEffects();

    const alert = container.querySelector("[role='alert']");
    expect(alert?.textContent).toContain("版本数据与当前任务不匹配");
    expect(alert?.textContent).not.toContain("foreign-sensitive-flow-id");
    expect(container.querySelector(".json-diff")).toBeNull();
  });

  it("切换任务后忽略旧 currentFlow 慢响应", async () => {
    const stale = deferred<FlowDocument>();
    apiMocks.getFlow.mockImplementation((_projectId: string, flowId: string) =>
      flowId === "flow-a2"
        ? stale.promise
        : Promise.resolve(flowDocument("project-a", flowId, "自动化 A 当前")),
    );

    await mount();
    act(() => button(container, "自动化 A2").click());
    act(() => button(container, "自动化 A").click());
    await flushEffects();
    act(() => button(container, "版本记录").click());
    await flushEffects();
    stale.resolve(flowDocument("project-a", "flow-a2", "不应出现的旧 currentFlow"));
    await flushEffects();

    expect(container.querySelector(".panel-header h2")?.textContent).toBe("自动化 A 当前");
    expect(container.textContent).not.toContain("不应出现的旧 currentFlow");
  });

  it("切换任务后忽略旧 versions 慢响应", async () => {
    const stale = deferred<FlowVersionRecord[]>();
    apiMocks.listFlowVersions.mockImplementation((_projectId: string, flowId: string) =>
      flowId === "flow-a2" ? stale.promise : Promise.resolve([version("current-version", 9)]),
    );

    await mount();
    act(() => button(container, "自动化 A2").click());
    act(() => button(container, "自动化 A").click());
    await flushEffects();
    act(() => button(container, "版本记录").click());
    await flushEffects();
    stale.resolve([version("stale-version", 2, "flow-a2")]);
    await flushEffects();

    expect(container.textContent).toContain("v9 · 历史 9");
    expect(container.textContent).not.toContain("v2 · 历史 2");
  });

  it("切换任务后忽略旧 listExecutions 慢响应", async () => {
    const stale = deferred<ExecutionResult[]>();
    let call = 0;
    apiMocks.getExecution.mockImplementation(async (executionId: string) =>
      execution(executionId, "flow-a"),
    );
    apiMocks.listExecutions.mockImplementation(() => {
      call += 1;
      if (call === 2) return stale.promise;
      if (call === 3) return Promise.resolve([execution("current-run", "flow-a")]);
      return Promise.resolve([]);
    });

    await mount();
    act(() => button(container, "自动化 A2").click());
    act(() => button(container, "自动化 A").click());
    await flushEffects();
    stale.resolve([execution("stale-run", "flow-a2")]);
    await flushEffects();

    expect(container.textContent).toContain("运行记录");
    expect(apiMocks.getExecution).toHaveBeenCalledWith("current-run");
    expect(apiMocks.getExecution).not.toHaveBeenCalledWith("stale-run");
  });

  it("切换项目后旧项目 currentFlow 慢响应不污染新项目", async () => {
    const stale = deferred<FlowDocument>();
    apiMocks.getFlow.mockImplementation((projectId: string, flowId: string) =>
      projectId === "project-a"
        ? stale.promise
        : Promise.resolve(flowDocument(projectId, flowId, "项目 B 当前任务")),
    );

    await mount();
    act(() => button(container, "项目 B").click());
    await flushEffects();
    act(() => button(container, "版本记录").click());
    stale.resolve(flowDocument("project-a", "flow-a", "旧项目敏感标题"));
    await flushEffects();

    expect(container.querySelector(".workspace-breadcrumb")?.textContent).toContain("项目 B");
    expect(container.querySelector(".panel-header h2")?.textContent).toBe("项目 B 当前任务");
    expect(container.textContent).not.toContain("旧项目敏感标题");
  });
});

describe("Web P2.7 只读与窄屏静态合同", () => {
  const appSource = readFileSync(`${process.cwd()}/src/App.tsx`, "utf8");
  const apiSource = readFileSync(`${process.cwd()}/src/api.ts`, "utf8");
  const cssSource = readFileSync(`${process.cwd()}/src/styles.css`, "utf8");

  it("不提供 execution DELETE、删除按钮或可编辑 Diff", () => {
    expect(apiSource).not.toMatch(/method:\s*["']DELETE["']/);
    expect(appSource).not.toMatch(/删除运行|删除记录|deleteExecution/);
    expect(appSource).not.toMatch(/textarea|contentEditable|contenteditable/);
  });

  it("375×812 下为 Diff 路径和值提供收缩与断行合同", () => {
    expect(cssSource).toContain(".version-diff");
    expect(cssSource).toMatch(/\.version-diff[\s\S]*min-width:\s*0/);
    expect(cssSource).toMatch(/\.json-diff[\s\S]*overflow-wrap:\s*anywhere/);
    expect(cssSource).toMatch(/@media \(max-width: 480px\)[\s\S]*\.flow-version-item/);
  });
});
