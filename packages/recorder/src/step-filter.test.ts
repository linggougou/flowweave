import { describe, expect, it } from "vitest";
import { filterNoisyInteractionSteps, mergeConsecutiveFillSteps } from "./step-filter.js";

describe("filterNoisyInteractionSteps", () => {
  it("移除紧邻 fill 前指向同一输入框的 click", () => {
    const steps = filterNoisyInteractionSteps([
      {
        id: "1",
        type: "click",
        target: { strategies: [{ kind: "css", selector: "#user" }] },
      },
      {
        id: "2",
        type: "fill",
        target: { strategies: [{ kind: "css", selector: "#user" }] },
        value: "ling",
      },
      {
        id: "3",
        type: "click",
        target: { strategies: [{ kind: "css", selector: "button" }] },
      },
    ]);

    expect(steps.map((s) => s.type)).toEqual(["fill", "click"]);
  });

  it("移除点到 body > div > div 布局容器的噪声 click", () => {
    const steps = filterNoisyInteractionSteps([
      {
        id: "1",
        type: "click",
        target: { strategies: [{ kind: "css", selector: "body > div > div:nth-of-type(2)" }] },
      },
      {
        id: "2",
        type: "click",
        target: {
          strategies: [
            { kind: "role", role: "button", name: "登录" },
            { kind: "text", text: "登录", exact: true },
          ],
        },
      },
    ]);
    expect(steps).toHaveLength(1);
    expect(steps[0]?.type).toBe("click");
  });

  it("移除 checkbox 标签点击与 setChecked 的重复噪声", () => {
    const steps = filterNoisyInteractionSteps([
      {
        id: "1",
        type: "click",
        target: {
          strategies: [{ kind: "css", selector: 'label[for="agree"]' }],
          hints: { tagName: "label", labelText: "同意协议", textSample: "同意协议" },
        },
      },
      {
        id: "2",
        type: "setChecked",
        target: {
          strategies: [{ kind: "css", selector: "#agree" }],
          hints: {
            tagName: "input",
            inputType: "checkbox",
            nameAttr: "agree",
            labelText: "同意协议",
          },
        },
        checked: true,
      },
    ]);

    expect(steps.map((step) => step.type)).toEqual(["setChecked"]);
  });

  it("移除紧邻 select 前指向同一控件的 click", () => {
    const steps = filterNoisyInteractionSteps([
      {
        id: "1",
        type: "click",
        target: {
          strategies: [{ kind: "css", selector: "#city" }],
          hints: { tagName: "select", nameAttr: "city", labelText: "城市" },
        },
      },
      {
        id: "2",
        type: "select",
        target: {
          strategies: [{ kind: "css", selector: "#city" }],
          hints: { tagName: "select", nameAttr: "city", labelText: "城市" },
        },
        values: ["shanghai"],
      },
    ]);

    expect(steps.map((step) => step.type)).toEqual(["select"]);
  });
});

describe("mergeConsecutiveFillSteps", () => {
  it("合并同一输入框的连续 fill，保留最后一次", () => {
    const steps = mergeConsecutiveFillSteps([
      {
        id: "1",
        type: "fill",
        target: { strategies: [{ kind: "css", selector: "#user" }] },
        value: "a",
      },
      {
        id: "2",
        type: "fill",
        target: { strategies: [{ kind: "css", selector: "#user" }] },
        value: "ab",
      },
      {
        id: "3",
        type: "click",
        target: { strategies: [{ kind: "css", selector: "button" }] },
      },
    ]);
    expect(steps).toHaveLength(2);
    expect(steps[0]?.type).toBe("fill");
    expect(steps[0]?.type === "fill" && steps[0].value).toBe("ab");
  });
});
