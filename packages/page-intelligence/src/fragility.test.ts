import { describe, expect, it } from "vitest";
import type { FlowDocument } from "@flowweave/flow-dsl";
import { analyzeFlowFragility } from "./fragility.js";

function baseFlow(steps: FlowDocument["steps"]): FlowDocument {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    id: "f1",
    projectId: "p1",
    name: "test",
    variables: [],
    steps,
    meta: { createdAt: now, updatedAt: now, source: "manual" },
  };
}

describe("analyzeFlowFragility", () => {
  it("当相对地址 navigate 缺少 baseUrl 时给出 MISSING_ENVIRONMENT", () => {
    const flow = baseFlow([
      {
        id: "s1",
        type: "navigate",
        url: "/orders",
      },
    ]);

    const codes = analyzeFlowFragility(flow).map((issue) => issue.code as string);
    expect(codes).toContain("MISSING_ENVIRONMENT");
  });

  it("当步骤引用变量但运行输入缺失时给出 MISSING_VARIABLE", () => {
    const flow = baseFlow([
      {
        id: "s1",
        type: "navigate",
        url: "https://example.com/login",
      },
      {
        id: "s2",
        type: "fill",
        target: {
          strategies: [{ kind: "role", role: "textbox", name: "用户名" }],
        },
        value: "{{username}}",
      },
    ]);

    const codes = analyzeFlowFragility(flow, {
      variables: {
        providedOnly: "ok",
      },
    }).map((issue) => issue.code as string);

    expect(codes).toContain("MISSING_VARIABLE");
  });

  it("对纯 css 步骤给出 warning", () => {
    const flow = baseFlow([
      {
        id: "s1",
        type: "click",
        target: { strategies: [{ kind: "css", selector: "#btn" }] },
      },
    ]);
    const issues = analyzeFlowFragility(flow);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.code).toBe("CSS_ONLY");
  });

  it("对包含 nth-of-type 的 css 步骤额外给出 CSS_NTH_OF_TYPE", () => {
    const flow = baseFlow([
      {
        id: "s1",
        type: "click",
        target: {
          strategies: [{ kind: "css", selector: "body > div > div:nth-of-type(2) > button" }],
        },
      },
    ]);

    const codes = analyzeFlowFragility(flow).map((issue) => issue.code as string);
    expect(codes).toContain("CSS_ONLY");
    expect(codes).toContain("CSS_NTH_OF_TYPE");
  });

  it("对仅文本策略的步骤给出 TEXT_ONLY", () => {
    const flow = baseFlow([
      {
        id: "s1",
        type: "click",
        target: {
          strategies: [{ kind: "text", text: "立即提交", exact: true }],
        },
      },
    ]);

    const codes = analyzeFlowFragility(flow).map((issue) => issue.code as string);
    expect(codes).toContain("TEXT_ONLY");
  });

  it("对仅依赖通用 condition 的 wait 步骤给出 WAIT_MAY_BE_UNSTABLE", () => {
    const flow = baseFlow([
      {
        id: "s1",
        type: "wait",
        condition: "networkidle",
      },
    ]);

    const codes = analyzeFlowFragility(flow).map((issue) => issue.code as string);
    expect(codes).toContain("WAIT_MAY_BE_UNSTABLE");
  });

  it("仅毫秒等待时不报 WAIT_MAY_BE_UNSTABLE", () => {
    const flow = baseFlow([
      {
        id: "s1",
        type: "wait",
        ms: 1200,
      },
    ]);

    const codes = analyzeFlowFragility(flow).map((issue) => issue.code as string);
    expect(codes).not.toContain("WAIT_MAY_BE_UNSTABLE");
  });

  it("含 role 策略时不报 CSS_ONLY", () => {
    const flow = baseFlow([
      {
        id: "s1",
        type: "click",
        target: {
          strategies: [
            { kind: "role", role: "button", name: "提交" },
            { kind: "css", selector: "#btn" },
          ],
        },
      },
    ]);
    expect(analyzeFlowFragility(flow)).toHaveLength(0);
  });
});
