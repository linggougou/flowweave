import { describe, expect, it } from "vitest";
import { FLOW_SCHEMA_VERSION_V2 } from "@flowweave/shared";
import {
  compileFlowDocumentV2,
  parseFlowDocumentV2,
  type FlowDocumentV2,
  type InputFieldV2,
} from "./index.js";

function buildFlow(steps: FlowDocumentV2["steps"]): FlowDocumentV2 {
  return {
    schemaVersion: FLOW_SCHEMA_VERSION_V2,
    id: "flow_v2_contract",
    projectId: "project_v2",
    name: "v2 合同",
    steps,
    meta: {
      createdAt: "2026-08-30T00:00:00.000Z",
      updatedAt: "2026-08-30T00:00:00.000Z",
      source: "manual",
    },
  };
}

const target = {
  strategies: [{ kind: "css" as const, selector: "#field" }],
};

function inputStep(
  id: string,
  fieldId: string,
  options: Partial<FlowDocumentV2["steps"][number] & { type: "input" }> = {},
): Extract<FlowDocumentV2["steps"][number], { type: "input" }> {
  return {
    id,
    type: "input",
    name: "运行输入",
    fields: [
      {
        fieldId,
        label: "名称",
        type: "string",
        required: true,
        sensitive: false,
        remember: "never",
      },
    ],
    ...options,
  } as Extract<FlowDocumentV2["steps"][number], { type: "input" }>;
}

describe("FlowDocument v2 结构与引用合同", () => {
  it("解析多个输入节点、同字段多次消费与同名跨节点字段", () => {
    const flow = buildFlow([
      inputStep("input_profile_01", "field_name_01"),
      { id: "fill_1", type: "fill", target, value: "{{field_name_01}}" },
      inputStep("input_profile_02", "field_city_01", {
        name: "第二组输入",
        fields: [
          {
            fieldId: "field_city_01",
            label: "名称",
            type: "string",
            required: true,
            sensitive: false,
            remember: "never",
          },
        ],
      }),
      { id: "fill_2", type: "fill", target, value: "{{field_name_01}}" },
    ]);

    expect(parseFlowDocumentV2(flow)).toEqual(flow);
    expect(compileFlowDocumentV2(flow).bindings).toHaveLength(2);
  });

  it.each([
    ["stepId", [inputStep("input_profile_01", "field_name_01"), { id: "input_profile_01", type: "navigate", url: "https://example.com" }]],
    ["fieldId", [
      inputStep("input_profile_01", "field_name_01"),
      inputStep("input_profile_02", "field_name_01"),
    ]],
  ])("拒绝重复 %s", (_label, steps) => {
    expect(() => parseFlowDocumentV2(buildFlow(steps as FlowDocumentV2["steps"]))).toThrow(/重复/);
  });

  it("按 NFKC + trim + lowercase 拒绝同节点 label 冲突", () => {
    const step = inputStep("input_profile_01", "field_name_01");
    step.fields.push({
      fieldId: "field_name_02",
      label: " ＮＡＭＥ ",
      type: "string",
      required: true,
      sensitive: false,
      remember: "never",
    });
    step.fields[0]!.label = "name";
    expect(() => parseFlowDocumentV2(buildFlow([step]))).toThrow(/label.*重复/i);
  });

  it.each([
    ["未知", "{{field_missing}}", /不存在/],
    ["未来", "{{field_name_01}}", /之后|未来/],
    ["旧名称", "{{名称}}", /不存在/],
  ])("拒绝%s引用", (_label, value, expected) => {
    const input = inputStep("input_profile_01", "field_name_01");
    const steps = value.includes("name")
      ? [{ id: "fill_1", type: "fill" as const, target, value }, input]
      : [input, { id: "fill_1", type: "fill" as const, target, value }];
    expect(() => parseFlowDocumentV2(buildFlow(steps))).toThrow(expected);
  });

  it("只编译白名单中的整值引用", () => {
    const booleanInput = inputStep("input_flags_01", "field_enabled_01", {
      fields: [
        {
          fieldId: "field_enabled_01",
          label: "启用",
          type: "boolean",
          required: true,
          sensitive: false,
          remember: "never",
        },
      ],
    });
    const flow = buildFlow([
      inputStep("input_profile_01", "field_name_01"),
      booleanInput,
      { id: "nav", type: "navigate", url: "{{field_name_01}}" },
      { id: "fill", type: "fill", target, value: "{{field_name_01}}" },
      { id: "select", type: "select", target, values: ["{{field_name_01}}"] },
      { id: "check", type: "setChecked", target, checked: "{{field_enabled_01}}" },
      {
        id: "click_role",
        type: "click",
        target: { strategies: [{ kind: "role", role: "link", name: "{{field_name_01}}" }] },
      },
      {
        id: "click_text",
        type: "click",
        target: { strategies: [{ kind: "text", text: "{{field_name_01}}" }] },
      },
      { id: "wait", type: "wait", condition: "urlIncludes", urlIncludes: "{{field_name_01}}" },
    ]);

    const compiled = compileFlowDocumentV2(flow);
    expect(compiled.bindings.map((binding) => binding.path)).toEqual([
      "steps[2].url",
      "steps[3].value",
      "steps[4].values[0]",
      "steps[5].checked",
      "steps[6].target.strategies[0].name",
      "steps[7].target.strategies[0].text",
      "steps[8].urlIncludes",
    ]);
  });

  it.each([
    ["混合模板", { id: "fill", type: "fill", target, value: "前缀{{field_name_01}}" }, /完整|混合/],
    ["CSS", { id: "click", type: "click", target: { strategies: [{ kind: "css", selector: "{{field_name_01}}" }] } }, /禁止/],
    ["按键", { id: "press", type: "press", key: "{{field_name_01}}" }, /禁止/],
    ["上传", { id: "upload", type: "upload", target, files: ["{{field_name_01}}"] }, /禁止/],
    ["等待毫秒", { id: "wait", type: "wait", ms: 10, label: "{{field_name_01}}" }, /禁止/],
  ])("拒绝%s绑定", (_label, step, expected) => {
    expect(() =>
      parseFlowDocumentV2(
        buildFlow([
          inputStep("input_profile_01", "field_name_01"),
          step as FlowDocumentV2["steps"][number],
        ]),
      ),
    ).toThrow(expected);
  });

  it("拒绝类型错配、可选无默认值消费和 select 多值引用", () => {
    const optionalNumber = inputStep("input_count_01", "field_count_01", {
      fields: [
        {
          fieldId: "field_count_01",
          label: "数量",
          type: "number",
          required: false,
          sensitive: false,
          remember: "never",
        },
      ],
    });
    expect(() =>
      parseFlowDocumentV2(
        buildFlow([
          optionalNumber,
          { id: "select", type: "select", target, values: ["{{field_count_01}}", "literal"] },
        ]),
      ),
    ).toThrow(/类型|一项|defaultValue/);
  });

  it.each([
    ["default", { defaultValue: "secret" }, /defaultValue/],
    ["remember", { remember: "lastValue" }, /remember/],
    ["type", { type: "number" }, /string/],
  ])("拒绝敏感字段非法 %s 策略", (_label, override, expected) => {
    const sensitive = inputStep("input_secret_01", "field_secret_01", {
      fields: [
        {
          fieldId: "field_secret_01",
          label: "密码",
          type: "string",
          required: true,
          sensitive: true,
          remember: "never",
          ...(override as Partial<InputFieldV2>),
        } as InputFieldV2,
      ],
    });
    expect(() => parseFlowDocumentV2(buildFlow([sensitive]))).toThrow(expected);
  });

  it("敏感字段只允许 fill.value", () => {
    const sensitive = inputStep("input_secret_01", "field_secret_01", {
      fields: [
        {
          fieldId: "field_secret_01",
          label: "密码",
          type: "string",
          required: true,
          sensitive: true,
          remember: "never",
        },
      ],
    });
    expect(() =>
      parseFlowDocumentV2(
        buildFlow([
          sensitive,
          { id: "nav", type: "navigate", url: "{{field_secret_01}}" },
        ]),
      ),
    ).toThrow(/敏感.*fill\.value/);
    expect(() =>
      parseFlowDocumentV2(
        buildFlow([
          sensitive,
          { id: "fill", type: "fill", target, value: "{{field_secret_01}}" },
        ]),
      ),
    ).not.toThrow();
  });

  it("公开 parser 返回稳定 DSL 错误码且详情不包含字段值", () => {
    const canary = "CANARY_SECRET_VALUE";
    const sensitive = inputStep("input_secret_01", "field_secret_01", {
      fields: [
        {
          fieldId: "field_secret_01",
          label: "密码",
          type: "string",
          required: true,
          sensitive: true,
          remember: "never",
          defaultValue: canary,
        },
      ],
    });
    try {
      parseFlowDocumentV2(buildFlow([sensitive]));
      throw new Error("预期敏感策略失败");
    } catch (error) {
      expect(error).toMatchObject({ code: "FLOW_SENSITIVE_POLICY_INVALID" });
      expect(JSON.stringify(error)).not.toContain(canary);
    }
  });

  it("校验 selectionContext 的顺序、类型与非敏感 string 来源", () => {
    const valid = buildFlow([
      inputStep("input_profile_01", "field_name_01"),
      { id: "search", type: "fill", target, value: "{{field_name_01}}" },
      {
        id: "choose",
        type: "click",
        target: { strategies: [{ kind: "text", text: "{{field_name_01}}" }] },
        selectionContext: { searchStepId: "search" },
      },
    ]);
    expect(() => parseFlowDocumentV2(valid)).not.toThrow();

    const invalid = structuredClone(valid);
    (invalid.steps[2] as Extract<FlowDocumentV2["steps"][number], { type: "click" }>).selectionContext = {
      searchStepId: "choose",
    };
    expect(() => parseFlowDocumentV2(invalid)).toThrow(/selectionContext|搜索/);
  });
});
