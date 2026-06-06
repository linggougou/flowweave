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
