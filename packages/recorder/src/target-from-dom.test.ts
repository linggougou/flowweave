import { describe, expect, it } from "vitest";
import { buildInteractionPayload } from "./target-from-dom.js";

function createElement(html: string): Element {
  const template = document.createElement("template");
  template.innerHTML = html.trim();
  const node = template.content.firstElementChild;
  if (!node) {
    throw new Error("failed to create element");
  }
  return node;
}

describe("buildInteractionPayload", () => {
  it("为按钮生成 role + css + text 多策略", () => {
    const button = createElement('<button type="button"><span>登 录</span></button>');
    const payload = buildInteractionPayload(button, "click");

    expect(payload.strategies.map((s) => s.kind)).toEqual(["role", "css", "text"]);
    expect(payload.role).toBe("button");
    expect(payload.name).toBe("登 录");
    expect(payload.selector).toContain("button");
  });

  it("为带 placeholder 的输入框生成 role 与属性化 css", () => {
    const input = createElement(
      '<input type="password" placeholder="请输入密码" name="password" />',
    );
    const payload = buildInteractionPayload(input, "fill", { value: "secret" });

    expect(payload.role).toBe("textbox");
    expect(payload.name).toBe("请输入密码");
    expect(payload.selector).toContain('[placeholder="请输入密码"]');
    expect(payload.value).toBe("secret");
  });

  it("优先使用 data-testid", () => {
    const node = createElement('<button data-testid="login-submit">登录</button>');
    const payload = buildInteractionPayload(node, "click");

    expect(payload.strategies[0]).toEqual({ kind: "testId", testId: "login-submit" });
    expect(payload.selector).toBe('[data-testid="login-submit"]');
  });
});
