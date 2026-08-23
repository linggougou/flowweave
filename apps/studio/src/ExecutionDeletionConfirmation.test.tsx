// @vitest-environment happy-dom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExecutionDeletionConfirmation } from "./ExecutionDeletionConfirmation.js";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

afterEach(() => document.body.replaceChildren());

describe("运行记录删除确认", () => {
  it("完整说明影响范围，取消初始聚焦，Escape 关闭并恢复触发按钮焦点", () => {
    const trigger = document.createElement("button");
    document.body.append(trigger);
    const host = document.createElement("div");
    document.body.append(host);
    const onCancel = vi.fn();
    const root = createRoot(host);
    act(() =>
      root.render(
        <ExecutionDeletionConfirmation
          execution={{
            executionId: "e1",
            flowId: "f1",
            status: "failed",
            startedAt: "2026-08-23T08:00:00.000Z",
          }}
          taskName="订单巡检"
          disabled={false}
          error={null}
          returnFocusTo={trigger}
          onConfirm={vi.fn()}
          onCancel={onCancel}
        />,
      ),
    );

    expect(host.querySelector("[role='dialog'][aria-modal='true']")).not.toBeNull();
    expect(host.textContent).toContain("订单巡检");
    expect(host.textContent).toContain("截图、诊断 JSON、页面快照和 HAR");
    expect(host.textContent).toContain("不会删除自动化任务（Flow）或其他运行记录");
    expect(host.textContent).toContain("运行记录删除后无法恢复");
    expect(host.textContent).toContain("受控产物会被永久清理");
    expect(host.textContent).toContain("永久删除这条记录");
    expect(document.activeElement?.textContent).toBe("取消");
    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(onCancel).toHaveBeenCalledOnce();
    act(() => root.unmount());
    expect(document.activeElement).toBe(trigger);
  });

  it("提交中禁止重复操作，错误保持在 role=alert", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    act(() =>
      root.render(
        <ExecutionDeletionConfirmation
          execution={{ executionId: "e1", flowId: "f1", status: "passed" }}
          taskName="订单巡检"
          disabled
          error="无法清理未知产物"
          returnFocusTo={null}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />,
      ),
    );
    expect(Array.from(host.querySelectorAll("button")).every((button) => button.disabled)).toBe(
      true,
    );
    expect(host.querySelector("[role='alert']")?.textContent).toContain("无法清理未知产物");
    act(() => root.unmount());
  });
});
