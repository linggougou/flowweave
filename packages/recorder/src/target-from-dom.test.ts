import { describe, expect, it } from "vitest";
import { buildInteractionPayload, resolveClickTarget } from "./target-from-dom.js";

function createElement(html: string): Element {
  const template = document.createElement("template");
  template.innerHTML = html.trim();
  const node = template.content.firstElementChild;
  if (!node) {
    throw new Error("failed to create element");
  }
  return node;
}

function mountElement(html: string): Element {
  document.body.innerHTML = html.trim();
  const node = document.body.firstElementChild;
  if (!node) {
    throw new Error("failed to mount element");
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

  it("点击 label 时优先解析到关联 checkbox，避免额外噪声 click", () => {
    const label = mountElement(
      '<label for="agree">同意协议</label><input id="agree" type="checkbox" name="agree" />',
    );
    const control = document.getElementById("agree");
    if (!(control instanceof HTMLInputElement)) {
      throw new Error("failed to resolve checkbox");
    }

    expect(resolveClickTarget(label)).toBe(control);
  });

  it("为 checkbox 提取 label、nameAttr 与 checked 语义", () => {
    mountElement(
      '<label for="agree">同意协议</label><input id="agree" type="checkbox" name="agree" />',
    );
    const input = document.getElementById("agree");
    if (!(input instanceof HTMLInputElement)) {
      throw new Error("failed to resolve checkbox");
    }

    const payload = buildInteractionPayload(input, "setChecked", {
      inputType: "checkbox",
      checked: true,
    });

    expect(payload).toMatchObject({
      role: "checkbox",
      name: "同意协议",
      tagName: "input",
      inputType: "checkbox",
      nameAttr: "agree",
      labelText: "同意协议",
      checked: true,
    });
  });

  it("为 select 与 file input 提取值语义和目标 hints", () => {
    document.body.innerHTML = `
      <label for="city">城市</label>
      <select id="city" name="city">
        <option value="">请选择</option>
        <option value="shanghai" selected>上海</option>
      </select>
      <label for="resume">上传简历</label>
      <input id="resume" type="file" name="resume" />
    `;

    const select = document.getElementById("city");
    const upload = document.getElementById("resume");
    if (!(select instanceof HTMLSelectElement) || !(upload instanceof HTMLInputElement)) {
      throw new Error("failed to resolve form controls");
    }

    const selectPayload = buildInteractionPayload(select, "select", {
      values: ["shanghai"],
    });
    const uploadPayload = buildInteractionPayload(upload, "upload", {
      inputType: "file",
      files: ["/tmp/resume.pdf"],
    });

    expect(selectPayload).toMatchObject({
      role: "combobox",
      name: "城市",
      tagName: "select",
      nameAttr: "city",
      labelText: "城市",
      textSample: "上海",
      values: ["shanghai"],
    });
    expect(uploadPayload).toMatchObject({
      tagName: "input",
      inputType: "file",
      nameAttr: "resume",
      labelText: "上传简历",
      files: ["/tmp/resume.pdf"],
    });
  });
});
