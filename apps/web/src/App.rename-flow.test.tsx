// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { FlowDocument } from "@flowweave/flow-dsl";

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

type FlowRef = {
  id: string;
  name: string;
  createdAt: string;
  revision: number;
  schemaVersion: number;
};

const projects = [
  { id: "project-a", name: "项目 A", createdAt: "2026-08-23T08:00:00.000Z" },
  { id: "project-b", name: "项目 B", createdAt: "2026-08-23T09:00:00.000Z" },
];

const projectFlows: Record<string, FlowRef[]> = {
  "project-a": [
    {
      id: "flow-a",
      name: "自动化 A",
      createdAt: "2026-08-23T08:00:00.000Z",
      revision: 7,
      schemaVersion: 1,
    },
    {
      id: "flow-a2",
      name: "自动化 A2",
      createdAt: "2026-08-23T08:10:00.000Z",
      revision: 3,
      schemaVersion: 1,
    },
  ],
  "project-b": [
    {
      id: "flow-b",
      name: "自动化 B",
      createdAt: "2026-08-23T09:00:00.000Z",
      revision: 1,
      schemaVersion: 1,
    },
  ],
};

function flow(projectId: string, flowId: string): FlowDocument {
  const ref = projectFlows[projectId]?.find((item) => item.id === flowId);
  if (!ref) throw new Error(`缺少测试 Flow：${projectId}/${flowId}`);
  return {
    schemaVersion: 1,
    id: flowId,
    projectId,
    name: ref.name,
    variables: [],
    steps: [{ id: "open", type: "navigate", url: "https://example.test" }],
    meta: {
      createdAt: ref.createdAt,
      updatedAt: ref.createdAt,
      source: "recorded",
    },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
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

function changeInput(input: HTMLInputElement, value: string): void {
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setValue?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("Web 自动化任务重命名", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(async () => {
    apiMocks.listProjects.mockReset().mockResolvedValue(projects);
    apiMocks.listFlows
      .mockReset()
      .mockImplementation(async (projectId: string) => [...(projectFlows[projectId] ?? [])]);
    apiMocks.getFlow
      .mockReset()
      .mockImplementation(async (projectId: string, flowId: string) => flow(projectId, flowId));
    apiMocks.listFlowVersions.mockReset().mockResolvedValue([]);
    apiMocks.getFlowVersion.mockReset();
    apiMocks.restoreFlowVersion.mockReset();
    apiMocks.listExecutions.mockReset().mockResolvedValue([]);
    apiMocks.getExecution.mockReset();
    apiMocks.renameFlow
      .mockReset()
      .mockImplementation(
        async (
          _projectId: string,
          flowId: string,
          name: string,
          expectedRevision: number,
        ) => ({
        flowId,
        name,
        createdAt: "2026-08-23T08:00:00.000Z",
        revision: expectedRevision + 1,
        schemaVersion: 1,
        }),
      );

    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root.render(<App />);
    });
    await flushEffects();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("选择与重命名使用并列原生按钮，编辑态可取消", async () => {
    const rename = button(container, "重命名 自动化 A");
    expect(rename.tagName).toBe("BUTTON");
    expect(
      rename.closest("button")?.parentElement?.querySelectorAll(":scope > button"),
    ).toHaveLength(2);
    expect(container.querySelector("button button")).toBeNull();

    act(() => rename.click());
    const input = container.querySelector<HTMLInputElement>("input[name='flow-name']");
    expect(input?.value).toBe("自动化 A");

    act(() => button(container, "取消重命名").click());
    expect(container.querySelector("input[name='flow-name']")).toBeNull();
    expect(container.textContent).toContain("自动化 A");
  });

  it("拒绝空名称且不发送请求", async () => {
    act(() => button(container, "重命名 自动化 A").click());
    const input = container.querySelector<HTMLInputElement>("input[name='flow-name']")!;
    act(() => changeInput(input, "   "));
    act(() => button(container, "保存名称").click());
    await flushEffects();

    expect(apiMocks.renameFlow).not.toHaveBeenCalled();
    expect(container.querySelector("[role='alert']")?.textContent).toContain("任务名称不能为空");
    expect(container.querySelector("input[name='flow-name']")).not.toBeNull();
  });

  it("失败时保留编辑内容并回滚列表与当前标题", async () => {
    apiMocks.renameFlow.mockRejectedValueOnce(new Error("保存名称失败"));
    act(() => button(container, "版本记录").click());
    await flushEffects();
    act(() => button(container, "重命名 自动化 A").click());
    const input = container.querySelector<HTMLInputElement>("input[name='flow-name']")!;
    act(() => changeInput(input, "失败后的新名称"));
    act(() => button(container, "保存名称").click());
    await flushEffects();

    expect(container.querySelector("[role='alert']")?.textContent).toContain("保存名称失败");
    expect(container.querySelector<HTMLInputElement>("input[name='flow-name']")?.value).toBe(
      "失败后的新名称",
    );
    expect(container.querySelector(".panel-header h2")?.textContent).toBe("自动化 A");
  });

  it("成功后同步任务列表、面包屑与当前标题", async () => {
    act(() => button(container, "版本记录").click());
    await flushEffects();
    act(() => button(container, "重命名 自动化 A").click());
    const input = container.querySelector<HTMLInputElement>("input[name='flow-name']")!;
    act(() => changeInput(input, "每日对账"));
    act(() => button(container, "保存名称").click());
    await flushEffects();

    expect(apiMocks.renameFlow).toHaveBeenCalledWith("project-a", "flow-a", "每日对账", 7);
    expect(button(container, "重命名 每日对账")).toBeTruthy();
    expect(container.querySelector(".workspace-breadcrumb")?.textContent).toContain("每日对账");
    expect(container.querySelector(".panel-header h2")?.textContent).toBe("每日对账");
    expect(container.querySelector("input[name='flow-name']")).toBeNull();

    act(() => button(container, "重命名 每日对账").click());
    act(() =>
      changeInput(container.querySelector<HTMLInputElement>("input[name='flow-name']")!, "月底对账"),
    );
    act(() => button(container, "保存名称").click());
    await flushEffects();
    expect(apiMocks.renameFlow).toHaveBeenLastCalledWith(
      "project-a",
      "flow-a",
      "月底对账",
      8,
    );
  });

  it("切换项目后忽略旧项目的慢重命名响应", async () => {
    const pending = deferred<{
      flowId: string;
      name: string;
      createdAt: string;
      revision: number;
      schemaVersion: number;
    }>();
    apiMocks.renameFlow.mockReturnValueOnce(pending.promise);
    act(() => button(container, "重命名 自动化 A").click());
    act(() => changeInput(container.querySelector("input[name='flow-name']")!, "旧项目新名称"));
    act(() => button(container, "保存名称").click());

    act(() => button(container, "项目 B").click());
    await flushEffects();
    expect(container.querySelector(".workspace-breadcrumb")?.textContent).toContain("自动化 B");

    pending.resolve({
      flowId: "flow-a",
      name: "旧项目新名称",
      createdAt: "2026-08-23T08:00:00.000Z",
      revision: 8,
      schemaVersion: 1,
    });
    await flushEffects();

    expect(container.querySelector(".workspace-breadcrumb")?.textContent).toContain("项目 B");
    expect(container.querySelector(".workspace-breadcrumb")?.textContent).toContain("自动化 B");
    expect(container.textContent).not.toContain("旧项目新名称");
  });

  it("切换任务后仍更新同项目侧栏，但不会改写当前任务标题", async () => {
    const pending = deferred<{
      flowId: string;
      name: string;
      createdAt: string;
      revision: number;
      schemaVersion: number;
    }>();
    apiMocks.renameFlow.mockReturnValueOnce(pending.promise);
    act(() => button(container, "重命名 自动化 A").click());
    act(() => changeInput(container.querySelector("input[name='flow-name']")!, "自动化 A 新名称"));
    act(() => button(container, "保存名称").click());

    act(() => button(container, "自动化 A2").click());
    await flushEffects();
    pending.resolve({
      flowId: "flow-a",
      name: "自动化 A 新名称",
      createdAt: "2026-08-23T08:00:00.000Z",
      revision: 8,
      schemaVersion: 1,
    });
    await flushEffects();

    expect(button(container, "重命名 自动化 A 新名称")).toBeTruthy();
    expect(container.querySelector(".workspace-breadcrumb")?.textContent).toContain("自动化 A2");
    expect(container.querySelector(".workspace-breadcrumb")?.textContent).not.toContain(
      "自动化 A 新名称",
    );
  });
});
