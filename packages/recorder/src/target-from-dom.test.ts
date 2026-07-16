import { describe, expect, it } from "vitest";
import {
  buildInteractionPayload,
  buildRecordedFillValue,
  resolveClickTarget,
  shouldRecordFill,
} from "./target-from-dom.js";

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
  it("密码输入只生成稳定变量占位符，不返回 DOM 明文", () => {
    const input = createElement(
      '<input id="account-password" type="password" name="currentPassword" autocomplete="current-password" />',
    );

    const recorded = buildRecordedFillValue(input, "do-not-store-this");

    expect(recorded).toBe("{{secret_current_password}}");
    expect(recorded).not.toContain("do-not-store-this");
  });

  it("普通输入继续保留录制值", () => {
    const input = createElement('<input id="display-name" type="text" />');

    expect(buildRecordedFillValue(input, "织流用户")).toBe("织流用户");
  });

  it("忽略 autocomplete=off，使用字段名称生成敏感变量", () => {
    const input = createElement(
      '<input type="password" name="adminPassword" autocomplete="off" />',
    );

    expect(buildRecordedFillValue(input, "plain-secret")).toBe("{{secret_admin_password}}");
  });

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

  it("将 contenteditable 识别为 fill 目标并保留文本 hints", () => {
    const editor = mountElement(
      '<div id="editor-body" contenteditable="true" role="textbox" aria-label="交接备注" style="width: 320px; height: 48px;">需要补充库存说明</div>',
    );
    Object.defineProperty(editor, "getBoundingClientRect", {
      value: () => ({
        width: 320,
        height: 48,
        top: 0,
        right: 320,
        bottom: 48,
        left: 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
    });

    expect(shouldRecordFill(editor)).toBe(true);

    const payload = buildInteractionPayload(editor, "fill", {
      value: "需要补充库存说明",
    });

    expect(payload.strategies.map((strategy) => strategy.kind)).toEqual(["role", "css"]);
    expect(payload).toMatchObject({
      role: "textbox",
      name: "交接备注",
      selector: "#editor-body",
      tagName: "div",
      textSample: "需要补充库存说明",
      value: "需要补充库存说明",
    });
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

  it("为重复列表行按钮提取最近行作用域 hints", () => {
    document.body.innerHTML = `
      <table>
        <tbody>
          <tr>
            <td>订单 A</td>
            <td>处理中</td>
            <td><button type="button">编辑</button></td>
          </tr>
          <tr>
            <td>订单 B</td>
            <td>已暂停</td>
            <td><button type="button">编辑</button></td>
          </tr>
        </tbody>
      </table>
    `;

    const buttons = document.querySelectorAll("button");
    const target = buttons.item(1);
    if (!(target instanceof HTMLButtonElement)) {
      throw new Error("failed to resolve second row button");
    }

    const payload = buildInteractionPayload(target, "click");

    expect(payload.scopeKind).toBe("row");
    expect(payload.scopeText).toContain("订单 B");
    expect(payload.scopeText).toContain("已暂停");
    expect(payload.scopeText).not.toContain("编辑");
  });
});
