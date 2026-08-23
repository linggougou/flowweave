import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { ViewSwitcher } from "./ViewSwitcher.js";

function findButtonIn(
  node: ReactNode,
  label: string,
): ReactElement<{ onClick: () => void }> | undefined {
  if (isValidElement(node)) {
    const element = node as ReactElement<{ children?: ReactNode; onClick?: () => void }>;
    const html = renderToStaticMarkup(element);
    if (element.type === "button" && html.includes(label)) {
      return element as ReactElement<{ onClick: () => void }>;
    }
    const children = element.props.children;
    for (const child of Array.isArray(children) ? children : [children]) {
      const found = child ? findButtonIn(child, label) : undefined;
      if (found) return found;
    }
  }
  return undefined;
}

function findButton(node: ReactNode, label: string): ReactElement<{ onClick: () => void }> {
  const found = findButtonIn(node, label);
  if (found) return found;
  throw new Error(`没有找到按钮：${label}`);
}

describe("Studio 视图切换控件", () => {
  it("使用原生按钮语义并可通过按钮激活目标视图", () => {
    const onChange = vi.fn();
    const view = ViewSwitcher({ value: "flow", onChange });
    const html = renderToStaticMarkup(view);

    expect(html).not.toMatch(/role="tab(list)?"/);
    expect(html).toContain('aria-pressed="true"');

    findButton(view, "运行记录").props.onClick();
    expect(onChange).toHaveBeenCalledWith("executions");
  });
});
