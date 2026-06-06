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
  it("未提供环境上下文时不把相对地址 navigate 判为 MISSING_ENVIRONMENT", () => {
    const flow = baseFlow([
      {
        id: "s1",
        type: "navigate",
        url: "/orders",
      },
    ]);

    const codes = analyzeFlowFragility(flow).map((issue) => issue.code as string);
    expect(codes).not.toContain("MISSING_ENVIRONMENT");
  });

  it("显式提供空 baseUrl 时对相对地址 navigate 给出 MISSING_ENVIRONMENT", () => {
    const flow = baseFlow([
      {
        id: "s1",
        type: "navigate",
        url: "/orders",
      },
    ]);

    const codes = analyzeFlowFragility(flow, {
      baseUrl: " ",
    }).map((issue) => issue.code as string);

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

  it("变量名支持连字符、点号与中文", () => {
    const flow = baseFlow([
      {
        id: "s1",
        type: "fill",
        target: {
          strategies: [{ kind: "role", role: "textbox", name: "用户名" }],
        },
        value: "{{tenant-id}} / {{profile.name}} / {{中文变量}}",
      },
    ]);

    const issue = analyzeFlowFragility(flow, {
      variables: {},
    }).find((item) => item.code === "MISSING_VARIABLE");

    expect(issue?.message).toContain("tenant-id");
    expect(issue?.message).toContain("profile.name");
    expect(issue?.message).toContain("中文变量");
  });

  it("变量已有默认值时不报 MISSING_VARIABLE", () => {
    const flow = {
      ...baseFlow([
        {
          id: "s1",
          type: "fill" as const,
          target: {
            strategies: [{ kind: "role" as const, role: "textbox", name: "用户名" }],
          },
          value: "{{username}}",
        },
      ]),
      variables: [
        {
          name: "username",
          type: "string" as const,
          required: false,
          defaultValue: "默认用户名",
        },
      ],
    };

    const codes = analyzeFlowFragility(flow, {
      variables: {},
    }).map((issue) => issue.code as string);

    expect(codes).not.toContain("MISSING_VARIABLE");
  });

  it("忽略 label 与 target.hints 中的变量占位符", () => {
    const flow = baseFlow([
      {
        id: "s1",
        label: "说明 {{preview-only}}",
        type: "click",
        target: {
          strategies: [{ kind: "role", role: "button", name: "保存" }],
          hints: {
            labelText: "{{hint-only}}",
            textSample: "{{sample-only}}",
          },
        },
      },
    ]);

    const codes = analyzeFlowFragility(flow, {
      variables: {},
    }).map((issue) => issue.code as string);

    expect(codes).not.toContain("MISSING_VARIABLE");
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

  it("对仅使用 css 的 select 步骤给出 CSS_ONLY", () => {
    const flow = baseFlow([
      {
        id: "s1",
        type: "select",
        target: {
          strategies: [{ kind: "css", selector: "#city" }],
        },
        values: ["shanghai"],
      },
    ]);

    const codes = analyzeFlowFragility(flow).map((issue) => issue.code as string);
    expect(codes).toContain("CSS_ONLY");
  });

  it("对依赖 nth-of-type 的 setChecked 步骤给出 CSS_NTH_OF_TYPE", () => {
    const flow = baseFlow([
      {
        id: "s1",
        type: "setChecked",
        target: {
          strategies: [{ kind: "css", selector: "form > div:nth-of-type(2) input" }],
        },
        checked: true,
      },
    ]);

    const codes = analyzeFlowFragility(flow).map((issue) => issue.code as string);
    expect(codes).toContain("CSS_ONLY");
    expect(codes).toContain("CSS_NTH_OF_TYPE");
  });

  it("对仅文本策略的 upload 步骤给出 TEXT_ONLY", () => {
    const flow = baseFlow([
      {
        id: "s1",
        type: "upload",
        target: {
          strategies: [{ kind: "text", text: "上传头像", exact: true }],
        },
        files: ["/tmp/avatar.png"],
      },
    ]);

    const codes = analyzeFlowFragility(flow).map((issue) => issue.code as string);
    expect(codes).toContain("TEXT_ONLY");
  });

  it("对带 target 但缺少策略的 press 步骤给出 NO_STRATEGIES", () => {
    const flow = baseFlow([
      {
        id: "s1",
        type: "press",
        target: {
          strategies: [],
        },
        key: "Enter",
      },
    ]);

    const codes = analyzeFlowFragility(flow).map((issue) => issue.code as string);
    expect(codes).toContain("NO_STRATEGIES");
  });

  it("对不带 target 的 press 步骤不产出 target 类风险", () => {
    const flow = baseFlow([
      {
        id: "s1",
        type: "press",
        key: "Enter",
      },
    ]);

    const codes = analyzeFlowFragility(flow).map((issue) => issue.code as string);
    expect(codes).not.toContain("NO_STRATEGIES");
    expect(codes).not.toContain("CSS_ONLY");
    expect(codes).not.toContain("CSS_NTH_OF_TYPE");
    expect(codes).not.toContain("TEXT_ONLY");
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
