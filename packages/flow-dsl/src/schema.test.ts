import { describe, expect, it } from "vitest";
import { FLOW_SCHEMA_VERSION } from "@flowweave/shared";
import { flowDocumentSchema, parseFlowDocument } from "./index.js";

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
    expect(() =>
      parseFlowDocument({
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
      }),
    ).not.toThrow();
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
});
