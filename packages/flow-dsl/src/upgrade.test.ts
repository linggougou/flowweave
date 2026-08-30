import { describe, expect, it } from "vitest";
import { FLOW_SCHEMA_VERSION } from "@flowweave/shared";
import {
  canonicalizeJson,
  parseFlowDocumentV2,
  previewFlowV1Upgrade,
  sha256Hex,
  type FlowDocument,
} from "./index.js";

function buildV1(overrides: Partial<FlowDocument> = {}): FlowDocument {
  return {
    schemaVersion: FLOW_SCHEMA_VERSION,
    id: "flow_upgrade",
    projectId: "project_upgrade",
    name: "升级样例",
    variables: [
      { name: "hotel_name", type: "string", required: true },
      { name: "secret_password", type: "string", required: true, defaultValue: "不应保留" },
    ],
    steps: [
      { id: "open", type: "navigate", url: "https://example.com" },
      {
        id: "fill_name",
        type: "fill",
        target: { strategies: [{ kind: "css", selector: "#name" }] },
        value: "{{hotel_name}}",
      },
      {
        id: "fill_password",
        type: "fill",
        target: {
          strategies: [{ kind: "css", selector: "input[type=password]" }],
          hints: { inputType: "password" },
        },
        value: "{{secret_password}}",
      },
    ],
    meta: {
      createdAt: "2026-08-30T00:00:00.000Z",
      updatedAt: "2026-08-30T00:00:00.000Z",
      source: "recorded",
    },
    ...overrides,
  };
}

describe("v1 → v2 纯升级预览", () => {
  it("canonical JSON 按键稳定排序且 SHA-256 使用标准结果", () => {
    expect(canonicalizeJson({ z: 1, a: { y: 2, b: 3 }, list: [{ d: 4, c: 5 }] })).toBe(
      '{"a":{"b":3,"y":2},"list":[{"c":5,"d":4}],"z":1}',
    );
    expect(sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256Hex("织流🧵")).toBe(
      "ddd56d8155878d869fdc2ad37f9b078e5bf1137ffcbf29950fbb3f9759d33cbd",
    );
    expect(sha256Hex("\ud800")).toBe(
      "83d544ccc223c057d2bf80d3f2a32982c32c3c0db8e2674820da5064783fb097",
    );
  });
  it("相同输入生成稳定身份、candidate、canonical JSON 与 fingerprint", () => {
    const input = buildV1();
    const first = previewFlowV1Upgrade(input);
    const second = previewFlowV1Upgrade(structuredClone(input));

    expect(first.blockingIssues).toEqual([]);
    expect(second).toEqual(first);
    expect(first.candidate?.id).toBe(input.id);
    expect(first.candidate?.projectId).toBe(input.projectId);
    expect(first.candidate?.steps.slice(1).map((step) => step.id)).toEqual(
      input.steps.map((step) => step.id),
    );
    expect(first.reportFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(first.canonicalJson).toBe(canonicalizeJson(first.candidate));
    expect(() => parseFlowDocumentV2(first.candidate)).not.toThrow();
  });

  it("重写完整引用、默认 remember=never 且移除敏感 default", () => {
    const report = previewFlowV1Upgrade(buildV1());
    const fields =
      report.candidate?.steps[0]?.type === "input" ? report.candidate.steps[0].fields : [];
    const nameMapping = report.fieldMappings.find((item) => item.variableName === "hotel_name");
    const secretMapping = report.fieldMappings.find(
      (item) => item.variableName === "secret_password",
    );

    expect(fields).toHaveLength(2);
    expect(fields.every((field) => field.remember === "never")).toBe(true);
    expect(fields.find((field) => field.fieldId === secretMapping?.fieldId)).not.toHaveProperty(
      "defaultValue",
    );
    expect(report.candidate?.steps[2]).toMatchObject({ value: `{{${nameMapping?.fieldId}}}` });
    expect(report.candidate?.steps[3]).toMatchObject({ value: `{{${secretMapping?.fieldId}}}` });
    expect(JSON.stringify(report)).not.toContain("不应保留");
  });

  it("逐字段 remember 选择参与 fingerprint，敏感字段不能开启", () => {
    const base = previewFlowV1Upgrade(buildV1());
    const normal = base.fieldMappings.find((item) => item.variableName === "hotel_name")!;
    const secret = base.fieldMappings.find((item) => item.variableName === "secret_password")!;
    const selected = previewFlowV1Upgrade(buildV1(), {
      rememberSelections: { [normal.fieldId]: "lastValue" },
    });
    expect(selected.reportFingerprint).not.toBe(base.reportFingerprint);
    const selectedInput = selected.candidate?.steps[0];
    expect(selectedInput?.type).toBe("input");
    if (selectedInput?.type === "input") {
      expect(selectedInput.fields).toContainEqual(
        expect.objectContaining({ fieldId: normal.fieldId, remember: "lastValue" }),
      );
    }

    const rejected = previewFlowV1Upgrade(buildV1(), {
      rememberSelections: { [secret.fieldId]: "lastValue" },
    });
    expect(rejected.candidate).toBeNull();
    expect(rejected.blockingIssues.map((issue) => issue.code)).toContain(
      "SENSITIVE_REMEMBER_FORBIDDEN",
    );
  });

  it.each([
    [
      "重复变量",
      {
        variables: [
          { name: "same", type: "string", required: true },
          { name: "same", type: "string", required: true },
        ],
      },
      "DUPLICATE_VARIABLE_NAME",
    ],
    [
      "未知引用",
      {
        variables: [],
        steps: [
          {
            id: "fill",
            type: "fill",
            target: { strategies: [{ kind: "css", selector: "#x" }] },
            value: "{{missing}}",
          },
        ],
      },
      "UNKNOWN_VARIABLE_REFERENCE",
    ],
    [
      "混合模板",
      {
        variables: [{ name: "name", type: "string", required: true }],
        steps: [
          {
            id: "fill",
            type: "fill",
            target: { strategies: [{ kind: "css", selector: "#x" }] },
            value: "hello {{name}}",
          },
        ],
      },
      "MIXED_TEMPLATE",
    ],
    [
      "禁止槽位",
      {
        variables: [{ name: "name", type: "string", required: true }],
        steps: [{ id: "press", type: "press", key: "{{name}}" }],
      },
      "FORBIDDEN_BINDING_TARGET",
    ],
    [
      "重复步骤",
      {
        steps: [
          { id: "same", type: "navigate", url: "https://a.example" },
          { id: "same", type: "navigate", url: "https://b.example" },
        ],
      },
      "DUPLICATE_STEP_ID",
    ],
  ])("%s 会阻塞迁移且不生成 candidate", (_label, overrides, code) => {
    const report = previewFlowV1Upgrade(buildV1(overrides as Partial<FlowDocument>));
    expect(report.candidate).toBeNull();
    expect(report.blockingIssues.map((issue) => issue.code)).toContain(code);
  });

  it("上传与敏感 URL 变量不被尽力迁移到越界槽位", () => {
    const upload = previewFlowV1Upgrade(
      buildV1({
        variables: [{ name: "secret_file", type: "string", required: true }],
        steps: [
          {
            id: "upload",
            type: "upload",
            target: { strategies: [{ kind: "css", selector: "input[type=file]" }] },
            files: ["{{secret_file}}"],
          },
        ],
      }),
    );
    expect(upload.candidate).toBeNull();
    expect(upload.blockingIssues.map((issue) => issue.code)).toContain("FORBIDDEN_BINDING_TARGET");

    const url = previewFlowV1Upgrade(
      buildV1({
        variables: [{ name: "secret_token", type: "string", required: true }],
        steps: [
          { id: "open", type: "navigate", url: "https://example.com?token={{secret_token}}" },
        ],
      }),
    );
    expect(url.candidate).toBeNull();
    expect(url.blockingIssues.map((issue) => issue.code)).toContain("MIXED_TEMPLATE");
  });

  it.each([
    ["navigate raw key", "navigate", "https://example.test?key={{credential}}"],
    ["navigate dot key", "navigate", "https://example.test?client.secret={{credential}}"],
    ["wait double encoded key", "wait", "?%2561%2570%2569%255F%256B%2565%2579={{credential}}"],
  ])("%s 复用统一敏感键策略并阻塞混合 URL 迁移", (_label, type, value) => {
    const step =
      type === "navigate"
        ? { id: "url-sensitive", type: "navigate" as const, url: value }
        : {
            id: "url-sensitive",
            type: "wait" as const,
            condition: "urlIncludes" as const,
            urlIncludes: value,
          };
    const report = previewFlowV1Upgrade(
      buildV1({
        variables: [{ name: "credential", type: "string", required: true }],
        steps: [step],
      }),
    );

    expect(report.fieldMappings).toContainEqual(
      expect.objectContaining({ variableName: "credential", sensitive: true }),
    );
    expect(report.candidate).toBeNull();
    expect(report.blockingIssues.map((issue) => issue.code)).toContain("MIXED_TEMPLATE");
  });

  it.each([
    [
      "navigate raw username",
      "navigate",
      "https://{{credential}}:literal@example.test/path",
      false,
    ],
    [
      "navigate raw password",
      "navigate",
      "https://literal:{{credential}}@example.test/path",
      false,
    ],
    [
      "wait raw multiple",
      "wait",
      "https://{{credential}}:prefix-{{secondary}}@example.test/path",
      false,
    ],
    [
      "navigate single encoded",
      "navigate",
      "https://%7B%7Bcredential%7D%7D:literal@example.test/path",
      true,
    ],
    [
      "wait double encoded",
      "wait",
      "https://literal:%257B%257Bcredential%257D%257D@example.test/path",
      true,
    ],
  ])("%s 将 userinfo 变量标为敏感且不回显 default", (_label, type, value, encoded) => {
    const canary = 'FLOWWEAVE_R3_UPGRADE_CANARY_"\\\n雪';
    const step =
      type === "navigate"
        ? { id: "userinfo-sensitive", type: "navigate" as const, url: value }
        : {
            id: "userinfo-sensitive",
            type: "wait" as const,
            condition: "urlIncludes" as const,
            urlIncludes: value,
          };
    const report = previewFlowV1Upgrade(
      buildV1({
        variables: [
          { name: "credential", type: "string", required: false, defaultValue: canary },
          ...(value.includes("secondary")
            ? [
                {
                  name: "secondary",
                  type: "string" as const,
                  required: false,
                  defaultValue: canary,
                },
              ]
            : []),
        ],
        steps: [step],
      }),
    );
    const serialized = JSON.stringify(report);
    const escapedCanary = JSON.stringify(canary).slice(1, -1);

    expect(report.fieldMappings).toContainEqual(
      expect.objectContaining({ variableName: "credential", sensitive: true }),
    );
    if (value.includes("secondary")) {
      expect(report.fieldMappings).toContainEqual(
        expect.objectContaining({ variableName: "secondary", sensitive: true }),
      );
    }
    expect(report.candidate === null).toBe(!encoded);
    expect(serialized).not.toContain(canary);
    expect(serialized).not.toContain(escapedCanary);
  });

  it.each([
    [
      "navigate 一层编码变量前非法 percent",
      "navigate",
      "https://bad%ZZ%7B%7Bcredential%7D%7D:literal@example.test/path",
      ["credential"],
      true,
    ],
    [
      "wait 一层编码变量后非法 percent",
      "wait",
      "https://literal:%7B%7Bcredential%7D%7D%ZZ@example.test/path",
      ["credential"],
      true,
    ],
    [
      "navigate 同侧多变量中间非法 percent",
      "navigate",
      "https://%7B%7Bcredential%7D%7D%ZZ%7B%7Bsecondary%7D%7D:literal@example.test/path",
      ["credential", "secondary"],
      true,
    ],
    [
      "wait 两层编码变量另一侧非法 percent",
      "wait",
      "https://bad%ZZ:%257B%257Bcredential%257D%257D@example.test/path",
      ["credential"],
      true,
    ],
    [
      "navigate raw mixed 与非法 percent",
      "navigate",
      "https://bad%ZZ{{credential}}:literal@example.test/path",
      ["credential"],
      false,
    ],
  ])("%s 仍按 fail-closed 敏感策略处理", (_label, type, value, names, hasCandidate) => {
    const canary = 'FLOWWEAVE_R4_UPGRADE_CANARY_"\\\n雪';
    const step =
      type === "navigate"
        ? { id: "malformed-userinfo", type: "navigate" as const, url: value }
        : {
            id: "malformed-userinfo",
            type: "wait" as const,
            condition: "urlIncludes" as const,
            urlIncludes: value,
          };
    const report = previewFlowV1Upgrade(
      buildV1({
        variables: names.map((name) => ({
          name,
          type: "string" as const,
          required: false,
          defaultValue: canary,
        })),
        steps: [step],
      }),
    );
    const serialized = JSON.stringify(report);
    const escapedCanary = JSON.stringify(canary).slice(1, -1);

    for (const name of names) {
      expect(report.fieldMappings).toContainEqual(
        expect.objectContaining({ variableName: name, sensitive: true }),
      );
    }
    expect(report.candidate !== null).toBe(hasCandidate);
    expect(serialized).not.toContain(canary);
    expect(serialized).not.toContain(escapedCanary);
  });

  it("第三层编码 userinfo 的 preview 不生成 candidate 且固定无值失败", () => {
    const canary = 'FLOWWEAVE_R4_THIRD_PREVIEW_CANARY_"\\\n雪';
    let failure: unknown;
    try {
      previewFlowV1Upgrade(
        buildV1({
          variables: [
            { name: "credential", type: "string", required: false, defaultValue: canary },
          ],
          steps: [
            {
              id: "third-layer-userinfo",
              type: "navigate",
              url: "https://%25257B%25257Bcredential%25257D%25257D:literal@example.test/path",
            },
          ],
        }),
      );
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toBe("URL userinfo percent 编码层级超出安全上限");
    expect(JSON.stringify(failure)).not.toContain(canary);
    expect(JSON.stringify(failure)).not.toContain(JSON.stringify(canary).slice(1, -1));
    expect(JSON.stringify(failure)).not.toContain("credential");
  });

  it("无 userinfo 的普通 query 变量保持非敏感", () => {
    const report = previewFlowV1Upgrade(
      buildV1({
        variables: [
          { name: "public_state", type: "string", required: false, defaultValue: "ready" },
        ],
        steps: [
          {
            id: "public-query",
            type: "navigate",
            url: "https://example.test/path?state={{public_state}}",
          },
        ],
      }),
    );

    expect(report.fieldMappings).toContainEqual(
      expect.objectContaining({ variableName: "public_state", sensitive: false }),
    );
  });

  it("类型不兼容的合法 v1 引用以结构化问题阻塞", () => {
    const report = previewFlowV1Upgrade(
      buildV1({
        variables: [{ name: "count", type: "number", required: true }],
        steps: [
          {
            id: "select",
            type: "select",
            target: { strategies: [{ kind: "css", selector: "#count" }] },
            values: ["{{count}}"],
          },
        ],
      }),
    );
    expect(report.candidate).toBeNull();
    expect(report.blockingIssues).toContainEqual(
      expect.objectContaining({ code: "BINDING_TYPE_MISMATCH", path: "steps[0].values[0]" }),
    );
  });

  it("显式非 password inputType 优先于 selector 的密码字样", () => {
    const report = previewFlowV1Upgrade(
      buildV1({
        variables: [
          {
            name: "PUBLIC_NOTE",
            type: "string",
            required: true,
            defaultValue: "公开说明",
          },
        ],
        steps: [
          {
            id: "fill_note",
            type: "fill",
            target: {
              strategies: [{ kind: "css", selector: "#password-policy-note" }],
              hints: { inputType: "text" },
            },
            value: "{{PUBLIC_NOTE}}",
          },
        ],
      }),
    );

    expect(report.blockingIssues).toEqual([]);
    expect(report.fieldMappings).toEqual([
      expect.objectContaining({ variableName: "PUBLIC_NOTE", sensitive: false }),
    ]);
    expect(report.candidate?.steps[0]).toMatchObject({
      type: "input",
      fields: [expect.objectContaining({ sensitive: false, defaultValue: "公开说明" })],
    });
  });

  it("fieldId 使用无歧义 tuple seed，index 与名称边界不能碰撞", () => {
    const variables: FlowDocument["variables"] = Array.from({ length: 13 }, (_, index) => ({
      name: index === 1 ? "23" : index === 12 ? "3" : `value_${index}`,
      type: "string",
      required: true,
    }));
    const report = previewFlowV1Upgrade(
      buildV1({
        variables,
        steps: [{ id: "open", type: "navigate", url: "https://example.com" }],
      }),
    );

    expect(report.blockingIssues).toEqual([]);
    expect(report.candidate).not.toBeNull();
    expect(new Set(report.fieldMappings.map((mapping) => mapping.fieldId))).toHaveLength(13);
  });

  it("label 截断与规范化碰撞采用确定性后缀并给出告警", () => {
    const long = "Ａ".repeat(90);
    const report = previewFlowV1Upgrade(
      buildV1({
        variables: [
          { name: long, type: "string", required: true },
          { name: "a".repeat(90), type: "string", required: true },
        ],
        steps: [{ id: "open", type: "navigate", url: "https://example.com" }],
      }),
    );
    const input = report.candidate?.steps[0];
    expect(input?.type).toBe("input");
    if (input?.type === "input") {
      expect(input.fields.map((field) => field.label)).toHaveLength(2);
      expect(input.fields[0]?.label).not.toBe(input.fields[1]?.label);
      expect(input.fields.every((field) => field.label.length <= 80)).toBe(true);
    }
    expect(report.warnings.some((issue) => issue.code === "LABEL_NORMALIZED")).toBe(true);
  });
});
