// @vitest-environment happy-dom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RunSafetyConfirmation } from "./RunSafetyConfirmation.js";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const containers: HTMLElement[] = [];

function renderConfirmation(riskAcknowledged: boolean, onConfirm = vi.fn()) {
  const container = document.createElement("div");
  document.body.append(container);
  containers.push(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <RunSafetyConfirmation
        summary={{
          flowId: "flow_confirm",
          taskName: "提交每日报表",
          domains: ["finance.example.test"],
          environmentName: "正式环境",
          stepCount: 4,
          highRiskActions: [{ kind: "submit", label: "提交", stepIndexes: [3] }],
          requiresConfirmation: true,
        }}
        riskAcknowledged={riskAcknowledged}
        disabled={false}
        onRiskAcknowledgedChange={vi.fn()}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );
  });
  return { container, onConfirm, root };
}

afterEach(() => {
  for (const container of containers.splice(0)) {
    container.remove();
  }
});

describe("运行前安全确认", () => {
  it("展示任务、域名、环境、步骤与高风险动作，并在未确认风险时阻止运行", () => {
    const { container, onConfirm } = renderConfirmation(false);

    expect(container.textContent).toContain("提交每日报表");
    expect(container.textContent).toContain("finance.example.test");
    expect(container.textContent).toContain("正式环境");
    expect(container.textContent).toContain("4 个步骤");
    expect(container.textContent).toContain("提交");

    const confirm = container.querySelector<HTMLButtonElement>("[data-action='confirm-run']");
    expect(confirm?.disabled).toBe(true);
    act(() => confirm?.click());
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("风险已确认后允许触发二次运行确认", () => {
    const onConfirm = vi.fn();
    const { container } = renderConfirmation(true, onConfirm);
    const confirm = container.querySelector<HTMLButtonElement>("[data-action='confirm-run']");

    expect(confirm?.disabled).toBe(false);
    act(() => confirm?.click());
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
