import { describe, expect, it } from "vitest";
import { FLOW_SCHEMA_VERSION, FLOW_SCHEMA_VERSION_V2, FlowWeaveError } from "@flowweave/shared";
import {
  flowDocumentSchema,
  parseFlowDocument,
  parseFlowDocumentV1,
  parseFlowDocumentV2,
} from "./index.js";

describe("flowDocumentSchema", () => {
  it("校验最小合法 Flow 文档", () => {
    const doc = flowDocumentSchema.parse({
      schemaVersion: FLOW_SCHEMA_VERSION,
      id: "flow_1",
      projectId: "proj_1",
      name: "示例流程",
      variables: [],
      steps: [
        {
          id: "s1",
          type: "navigate",
          url: "https://example.com",
        },
      ],
      meta: {
        createdAt: "2026-05-25T00:00:00.000Z",
        updatedAt: "2026-05-25T00:00:00.000Z",
        source: "manual",
      },
    });
    expect(doc.name).toBe("示例流程");
  });

  it("支持真实页面稳定性增强所需的新增步骤与 Target hints", () => {
    const doc = parseFlowDocument({
      schemaVersion: FLOW_SCHEMA_VERSION,
      id: "flow_real_page",
      projectId: "proj_1",
      name: "真实页面流程",
      variables: [],
      steps: [
        {
          id: "s1",
          type: "navigate",
          url: "/settings/profile",
          waitUntil: "domcontentloaded",
        },
        {
          id: "s2",
          type: "select",
          target: {
            strategies: [{ kind: "css", selector: "#city" }],
            hints: {
              tagName: "select",
              nameAttr: "city",
              labelText: "城市",
              scopeText: "基础信息表单",
              scopeKind: "section",
            },
          },
          values: ["shanghai"],
        },
        {
          id: "s3",
          type: "setChecked",
          target: {
            strategies: [{ kind: "css", selector: "#agree" }],
            hints: {
              tagName: "input",
              inputType: "checkbox",
              nameAttr: "agree",
            },
          },
          checked: true,
        },
        {
          id: "s4",
          type: "press",
          target: {
            strategies: [{ kind: "role", role: "textbox", name: "搜索" }],
            hints: {
              tagName: "input",
              placeholder: "搜索关键字",
            },
          },
          key: "Enter",
        },
        {
          id: "s5",
          type: "upload",
          target: {
            strategies: [{ kind: "css", selector: "input[type='file']" }],
            hints: {
              tagName: "input",
              inputType: "file",
            },
          },
          files: ["/tmp/avatar.png"],
        },
        {
          id: "s6",
          type: "wait",
          condition: "visible",
          target: {
            strategies: [{ kind: "text", text: "保存成功" }],
          },
        },
        {
          id: "s7",
          type: "wait",
          condition: "urlIncludes",
          urlIncludes: "/dashboard",
        },
      ],
      meta: {
        createdAt: "2026-06-06T00:00:00.000Z",
        updatedAt: "2026-06-06T00:00:00.000Z",
        source: "manual",
      },
    });

    expect(doc.steps[1]?.type).toBe("select");
    if (doc.steps[1]?.type === "select") {
      expect(doc.steps[1].target.hints?.scopeText).toBe("基础信息表单");
      expect(doc.steps[1].target.hints?.scopeKind).toBe("section");
    }
  });

  it("要求 wait 的目标等待条件必须提供 target", () => {
    expect(() =>
      parseFlowDocument({
        schemaVersion: FLOW_SCHEMA_VERSION,
        id: "flow_wait_invalid",
        projectId: "proj_1",
        name: "非法等待流程",
        variables: [],
        steps: [
          {
            id: "s1",
            type: "wait",
            condition: "visible",
          },
        ],
        meta: {
          createdAt: "2026-06-06T00:00:00.000Z",
          updatedAt: "2026-06-06T00:00:00.000Z",
          source: "manual",
        },
      }),
    ).toThrow(/target/i);
  });

  it("要求 wait 的 urlIncludes 条件必须提供匹配片段", () => {
    expect(() =>
      parseFlowDocument({
        schemaVersion: FLOW_SCHEMA_VERSION,
        id: "flow_wait_url_invalid",
        projectId: "proj_1",
        name: "非法 URL 等待流程",
        variables: [],
        steps: [
          {
            id: "s1",
            type: "wait",
            condition: "urlIncludes",
          },
        ],
        meta: {
          createdAt: "2026-06-06T00:00:00.000Z",
          updatedAt: "2026-06-06T00:00:00.000Z",
          source: "manual",
        },
      }),
    ).toThrow(/urlIncludes/i);
  });

  it("支持页面级与容器级 scroll 步骤", () => {
    const doc = parseFlowDocument({
      schemaVersion: FLOW_SCHEMA_VERSION,
      id: "flow_scroll",
      projectId: "proj_1",
      name: "滚动流程",
      variables: [],
      steps: [
        {
          id: "s1",
          type: "scroll",
          x: 0,
          y: 480,
        },
        {
          id: "s2",
          type: "scroll",
          x: 12,
          y: 960,
          target: {
            strategies: [{ kind: "css", selector: "#activity-list" }],
            hints: {
              tagName: "div",
            },
          },
        },
      ],
      meta: {
        createdAt: "2026-06-08T00:00:00.000Z",
        updatedAt: "2026-06-08T00:00:00.000Z",
        source: "manual",
      },
    });

    expect(doc.steps.map((step) => step.type)).toEqual(["scroll", "scroll"]);
  });

  it("拒绝负数 scroll 坐标", () => {
    expect(() =>
      parseFlowDocument({
        schemaVersion: FLOW_SCHEMA_VERSION,
        id: "flow_scroll_invalid",
        projectId: "proj_1",
        name: "非法滚动流程",
        variables: [],
        steps: [
          {
            id: "s1",
            type: "scroll",
            x: -1,
            y: 100,
          },
        ],
        meta: {
          createdAt: "2026-06-08T00:00:00.000Z",
          updatedAt: "2026-06-08T00:00:00.000Z",
          source: "manual",
        },
      }),
    ).toThrow(/nonnegative|greater than or equal to 0/i);
  });

  it("保留 v1 默认版本与显式 v1 parser", () => {
    expect(FLOW_SCHEMA_VERSION).toBe(1);
    const input = {
      schemaVersion: FLOW_SCHEMA_VERSION,
      id: "flow_v1",
      projectId: "project_v1",
      name: "v1",
      variables: [],
      steps: [{ id: "open", type: "navigate", url: "https://example.com" }],
      meta: {
        createdAt: "2026-08-30T00:00:00.000Z",
        updatedAt: "2026-08-30T00:00:00.000Z",
        source: "manual",
      },
    };

    expect(parseFlowDocumentV1(input).schemaVersion).toBe(1);
    expect(parseFlowDocument(input).schemaVersion).toBe(1);
  });

  it("未知版本在分派前明确拒绝且不降级", () => {
    try {
      parseFlowDocument({ schemaVersion: 99, variables: [], steps: [] });
      throw new Error("预期版本分派失败");
    } catch (error) {
      expect(error).toBeInstanceOf(FlowWeaveError);
      expect((error as FlowWeaveError).code).toBe("FLOW_SCHEMA_VERSION_UNSUPPORTED");
      expect((error as FlowWeaveError).details).toEqual({ received: 99, supported: [1, 2] });
      expect(JSON.stringify((error as FlowWeaveError).details)).not.toContain("variables");
    }
  });

  it("v2 parser 不接受顶层 variables 或任意未知字段", () => {
    const valid = buildMinimalV2();
    expect(() => parseFlowDocumentV2({ ...valid, variables: [] })).toThrow(/unrecognized/i);
    expect(() =>
      parseFlowDocumentV2({
        ...valid,
        steps: [{ ...valid.steps[0], unexpected: true }],
      }),
    ).toThrow(/unrecognized/i);
  });

  it("通用 parser 对 v2 分派且不改变 v1 兼容常量", () => {
    expect(FLOW_SCHEMA_VERSION_V2).toBe(2);
    expect(parseFlowDocument(buildMinimalV2()).schemaVersion).toBe(2);
    expect(FLOW_SCHEMA_VERSION).toBe(1);
  });
});

function buildMinimalV2() {
  return {
    schemaVersion: FLOW_SCHEMA_VERSION_V2,
    id: "flow_v2",
    projectId: "project_v2",
    name: "v2",
    steps: [{ id: "open", type: "navigate", url: "https://example.com" }],
    meta: {
      createdAt: "2026-08-30T00:00:00.000Z",
      updatedAt: "2026-08-30T00:00:00.000Z",
      source: "manual",
    },
  } as const;
}
