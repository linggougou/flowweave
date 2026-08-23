// @vitest-environment happy-dom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ExecutionProgressPanel } from "./ExecutionProgressPanel.js";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const containers: HTMLElement[] = [];

afterEach(() => {
  for (const container of containers.splice(0)) {
    container.remove();
  }
});

describe("运行进度面板", () => {
  it("展示 N/M、当前动作、耗时并只在能力可用时提供取消", () => {
    const container = document.createElement("div");
    document.body.append(container);
    containers.push(container);
    const onCancel = vi.fn();
    const root = createRoot(container);
    act(() => {
      root.render(
        <ExecutionProgressPanel
          progress={{
            executionId: "exec_progress",
            status: "running",
            totalSteps: 5,
            completedSteps: 2,
            currentStepIndex: 2,
            currentAction: "正在填写报表日期",
          }}
          elapsedSeconds={7}
          canCancel
          cancelling={false}
          onCancel={onCancel}
        />,
      );
    });

    expect(container.textContent).toContain("当前第 3/5 步");
    expect(container.textContent).toContain("已完成 2 步");
    expect(container.textContent).toContain("正在填写报表日期");
    expect(container.textContent).toContain("已用时 7 秒");
    const progressbar = container.querySelector("[role='progressbar']");
    expect(progressbar?.getAttribute("aria-valuenow")).toBe("2");

    const cancel = container.querySelector<HTMLButtonElement>("[data-action='cancel-run']");
    act(() => cancel?.click());
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("API 不支持取消时不渲染伪入口", () => {
    const container = document.createElement("div");
    document.body.append(container);
    containers.push(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        <ExecutionProgressPanel
          progress={{
            executionId: "exec_progress",
            status: "running",
            totalSteps: 0,
            completedSteps: 0,
            currentAction: "正在准备运行",
          }}
          elapsedSeconds={0}
          canCancel={false}
          cancelling={false}
          onCancel={vi.fn()}
        />,
      );
    });

    expect(container.querySelector("[data-action='cancel-run']")).toBeNull();
    expect(container.textContent).toContain("正在准备运行");
  });
});
