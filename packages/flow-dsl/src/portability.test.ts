import { describe, expect, it } from "vitest";
import { FLOW_SCHEMA_VERSION } from "@flowweave/shared";
import {
  createPortableFlowDocument,
  parseFlowDocument,
  type FlowDocument,
} from "./index.js";

function createFlow(overrides: Partial<FlowDocument> = {}): FlowDocument {
  return {
    schemaVersion: FLOW_SCHEMA_VERSION,
    id: "flow_portable",
    projectId: "project_source",
    name: "可移植流程",
    variables: [],
    steps: [
      {
        id: "open_home",
        type: "navigate",
        url: "https://example.com",
      },
    ],
    meta: {
      createdAt: "2026-08-23T00:00:00.000Z",
      updatedAt: "2026-08-23T00:00:00.000Z",
      source: "recorded",
    },
    ...overrides,
  };
}

describe("createPortableFlowDocument", () => {
  it("移除 secret_* 变量默认值并保持输入对象不变", () => {
    const input = createFlow({
      variables: [
        { name: "secret_api_key", type: "string", required: false, defaultValue: "sk-live" },
        { name: "page_size", type: "number", required: false, defaultValue: 20 },
      ],
    });

    const result = createPortableFlowDocument(input);

    expect(result.document.variables).toEqual([
      { name: "secret_api_key", type: "string", required: true },
      { name: "page_size", type: "number", required: false, defaultValue: 20 },
    ]);
    expect(result.warnings).toEqual([
      expect.objectContaining({
        code: "secret-default-removed",
        path: "variables[0].defaultValue",
        variableName: "secret_api_key",
      }),
    ]);
    expect(input.variables[0]?.defaultValue).toBe("sk-live");
  });

  it("把密码输入字面量替换为必填 secret 变量并清理泄露值的 hints", () => {
    const input = createFlow({
      variables: [
        {
          name: "secret_password_password_step",
          type: "number",
          required: false,
          defaultValue: 123456,
        },
      ],
      steps: [
        {
          id: "password-step",
          type: "fill",
          target: {
            strategies: [{ kind: "css", selector: "input[type='password']" }],
            hints: {
              tagName: "input",
              inputType: "password",
              nameAttr: "account_password",
              placeholder: "请输入 hunter2",
              labelText: "登录密码",
              textSample: "hunter2",
            },
          },
          value: "hunter2",
        },
      ],
    });

    const result = createPortableFlowDocument(input);
    const passwordStep = result.document.steps[0];

    expect(passwordStep).toMatchObject({
      type: "fill",
      value: "{{secret_password_password_step_2}}",
      target: {
        hints: {
          tagName: "input",
          inputType: "password",
          nameAttr: "account_password",
          labelText: "登录密码",
        },
      },
    });
    if (passwordStep?.type === "fill") {
      expect(passwordStep.target.hints).not.toHaveProperty("placeholder");
      expect(passwordStep.target.hints).not.toHaveProperty("textSample");
    }
    expect(result.document.variables).toContainEqual({
      name: "secret_password_password_step_2",
      type: "string",
      required: true,
    });
    expect(result.warnings.map((warning) => warning.code)).toEqual([
      "secret-default-removed",
      "password-value-variableized",
      "password-hint-removed",
    ]);
  });

  it("密码值已变量化时仍移除可能残留 DOM 明文的 textSample", () => {
    const input = createFlow({
      variables: [{ name: "secret_password", type: "string", required: true }],
      steps: [
        {
          id: "password",
          type: "fill",
          target: {
            strategies: [{ kind: "css", selector: "input[type=password]" }],
            hints: {
              inputType: "password",
              labelText: "登录密码",
              textSample: "leaked-from-dom",
            },
          },
          value: "{{secret_password}}",
        },
      ],
    });

    const result = createPortableFlowDocument(input);
    const passwordStep = result.document.steps[0];

    expect(passwordStep).toMatchObject({
      type: "fill",
      value: "{{secret_password}}",
      target: { hints: { inputType: "password", labelText: "登录密码" } },
    });
    if (passwordStep?.type === "fill") {
      expect(passwordStep.target.hints).not.toHaveProperty("textSample");
    }
    expect(result.warnings).toEqual([
      expect.objectContaining({
        code: "password-hint-removed",
        path: "steps[0].target.hints",
      }),
    ]);
  });

  it("反向硬化密码、敏感 URL 与上传位置引用的已有变量", () => {
    const input = createFlow({
      variables: [
        { name: "password", type: "string", required: false, defaultValue: "hunter2" },
        { name: "token", type: "string", required: false, defaultValue: "url-token" },
        {
          name: "file",
          type: "string",
          required: false,
          defaultValue: "/Users/ling/private.pdf",
        },
      ],
      steps: [
        {
          id: "password",
          type: "fill",
          target: {
            strategies: [{ kind: "css", selector: "input[type=password]" }],
            hints: { inputType: "password" },
          },
          value: "{{password}}",
        },
        {
          id: "upload",
          type: "upload",
          target: { strategies: [{ kind: "css", selector: "input[type=file]" }] },
          files: ["{{file}}"],
        },
        {
          id: "navigate",
          type: "navigate",
          url: "/callback?access_token={{token}}&state=ready",
        },
      ],
    });

    const result = createPortableFlowDocument(input);

    expect(result.document.variables).toEqual([
      { name: "password", type: "string", required: true },
      { name: "token", type: "string", required: true },
      { name: "file", type: "string", required: true },
    ]);
    expect(result.document.steps).toEqual(input.steps);
    expect(result.warnings.map(({ code, variableName }) => ({ code, variableName }))).toEqual([
      { code: "sensitive-variable-hardened", variableName: "password" },
      { code: "sensitive-variable-hardened", variableName: "token" },
      { code: "sensitive-variable-hardened", variableName: "file" },
    ]);
    expect(input.variables.map((variable) => variable.defaultValue)).toEqual([
      "hunter2",
      "url-token",
      "/Users/ling/private.pdf",
    ]);
    expect(createPortableFlowDocument(result.document)).toEqual({
      document: result.document,
      warnings: [],
    });
  });

  it("只把非模板化绝对上传路径替换为稳定且无冲突的必填文件变量", () => {
    const input = createFlow({
      variables: [
        { name: "upload_file_upload_docs_1", type: "number", required: true },
        { name: "existing_file", type: "string", required: true },
      ],
      steps: [
        {
          id: "upload-docs",
          type: "upload",
          target: { strategies: [{ kind: "css", selector: "input[type='file']" }] },
          files: [
            "/Users/ling/Documents/private.pdf",
            "C:\\Users\\ling\\Desktop\\secret.txt",
            "{{existing_file}}",
            "fixtures/public.pdf",
          ],
        },
      ],
    });

    const result = createPortableFlowDocument(input);
    const uploadStep = result.document.steps[0];

    expect(uploadStep).toMatchObject({
      type: "upload",
      files: [
        "{{upload_file_upload_docs_1_2}}",
        "{{upload_file_upload_docs_2}}",
        "{{existing_file}}",
        "fixtures/public.pdf",
      ],
    });
    expect(result.document.variables).toEqual(
      expect.arrayContaining([
        { name: "upload_file_upload_docs_1_2", type: "string", required: true },
        { name: "upload_file_upload_docs_2", type: "string", required: true },
      ]),
    );
    expect(result.warnings.map(({ code, path }) => ({ code, path }))).toEqual([
      { code: "upload-path-variableized", path: "steps[0].files[0]" },
      { code: "upload-path-variableized", path: "steps[0].files[1]" },
    ]);
  });

  it("移除 URL userinfo 并只变量化受控敏感 query key", () => {
    const input = createFlow({
      steps: [
        {
          id: "open-orders",
          type: "navigate",
          url: "https://alice:hunter2@example.com/orders?status=待处理&access_token=top-secret&monkey=banana#list",
        },
      ],
    });

    const result = createPortableFlowDocument(input);

    expect(result.document.steps[0]).toEqual({
      id: "open-orders",
      type: "navigate",
      url: "https://example.com/orders?status=待处理&access_token={{secret_url_access_token_open_orders}}&monkey=banana#list",
    });
    expect(result.document.variables).toContainEqual({
      name: "secret_url_access_token_open_orders",
      type: "string",
      required: true,
    });
    expect(result.warnings.map(({ code, path }) => ({ code, path }))).toEqual([
      { code: "url-userinfo-removed", path: "steps[0].url" },
      { code: "url-query-variableized", path: "steps[0].url.query.access_token" },
    ]);
  });

  it("变量化 OAuth hash 与 wait urlIncludes 中的敏感参数并保留普通片段", () => {
    const input = createFlow({
      steps: [
        {
          id: "oauth-callback",
          type: "navigate",
          url: "/callback#access_token=oauth-secret&state=ready",
        },
        {
          id: "wait-auth",
          type: "wait",
          condition: "urlIncludes",
          urlIncludes: "?auth=wait-secret&view=orders",
        },
        {
          id: "password-policy",
          type: "navigate",
          url: "/settings#password-policy",
        },
      ],
    });

    const result = createPortableFlowDocument(input);

    expect(result.document.steps).toEqual([
      {
        id: "oauth-callback",
        type: "navigate",
        url: "/callback#access_token={{secret_url_access_token_oauth_callback}}&state=ready",
      },
      {
        id: "wait-auth",
        type: "wait",
        condition: "urlIncludes",
        urlIncludes: "?auth={{secret_url_auth_wait_auth}}&view=orders",
      },
      {
        id: "password-policy",
        type: "navigate",
        url: "/settings#password-policy",
      },
    ]);
    expect(result.warnings.map(({ code, path }) => ({ code, path }))).toEqual([
      { code: "url-fragment-variableized", path: "steps[0].url.hash.access_token" },
      { code: "url-query-variableized", path: "steps[1].urlIncludes.query.auth" },
    ]);
  });

  it("处理 wait urlIncludes 的裸敏感参数串且不误伤普通路径子串", () => {
    const input = createFlow({
      steps: [
        {
          id: "wait-token",
          type: "wait",
          condition: "urlIncludes",
          urlIncludes: "access_token=top-secret&view=orders",
        },
        {
          id: "wait-status",
          type: "wait",
          condition: "urlIncludes",
          urlIncludes: "/orders/status=ready",
        },
      ],
    });

    const result = createPortableFlowDocument(input);

    expect(result.document.steps).toEqual([
      {
        id: "wait-token",
        type: "wait",
        condition: "urlIncludes",
        urlIncludes: "access_token={{secret_url_access_token_wait_token}}&view=orders",
      },
      {
        id: "wait-status",
        type: "wait",
        condition: "urlIncludes",
        urlIncludes: "/orders/status=ready",
      },
    ]);
    expect(result.warnings).toEqual([
      expect.objectContaining({
        code: "url-query-variableized",
        path: "steps[0].urlIncludes.query.access_token",
      }),
    ]);
  });

  it("保留普通业务文本、相对 URL、普通 query 与已有模板变量", () => {
    const input = createFlow({
      name: "创建客户订单",
      description: "备注：客户要求周五送达",
      variables: [
        { name: "customer_name", type: "string", required: false, defaultValue: "张三" },
        { name: "secret_password", type: "string", required: true },
      ],
      steps: [
        { id: "open", type: "navigate", url: "/orders?status=ready&keyboard=compact" },
        {
          id: "customer",
          type: "fill",
          target: {
            strategies: [{ kind: "role", role: "textbox", name: "客户备注" }],
            hints: { placeholder: "请输入业务说明", textSample: "周五送达" },
          },
          value: "客户要求周五送达",
        },
        {
          id: "password",
          type: "fill",
          target: {
            strategies: [{ kind: "css", selector: "#password" }],
            hints: { inputType: "password", labelText: "密码" },
          },
          value: "{{secret_password}}",
        },
      ],
    });

    const result = createPortableFlowDocument(input);

    expect(result.document).toEqual(input);
    expect(result.warnings).toEqual([]);
  });

  it("显式非 password inputType 优先于密码字样启发式", () => {
    const input = createFlow({
      steps: [
        {
          id: "password-policy-note",
          type: "fill",
          target: {
            strategies: [{ kind: "css", selector: "#password-policy-note" }],
            hints: {
              inputType: "text",
              labelText: "密码策略说明",
              textSample: "至少十二位",
            },
          },
          value: "至少十二位，需包含数字",
        },
      ],
    });

    const result = createPortableFlowDocument(input);

    expect(result.document).toEqual(input);
    expect(result.warnings).toEqual([]);
  });

  it("对已经处理过的文档幂等且不会继续追加变量或 warnings", () => {
    const input = createFlow({
      variables: [
        { name: "secret_token", type: "string", required: true, defaultValue: "token-value" },
      ],
      steps: [
        {
          id: "password",
          type: "fill",
          target: {
            strategies: [{ kind: "css", selector: "input[type=password]" }],
            hints: { inputType: "password", textSample: "password-value" },
          },
          value: "password-value",
        },
        {
          id: "upload",
          type: "upload",
          target: { strategies: [{ kind: "css", selector: "input[type=file]" }] },
          files: ["/tmp/private.txt"],
        },
        {
          id: "navigate",
          type: "navigate",
          url: "https://user:pass@example.com/?token=url-token&status=active",
        },
      ],
    });

    const first = createPortableFlowDocument(input);
    const second = createPortableFlowDocument(first.document);

    expect(first.warnings.length).toBeGreaterThan(0);
    expect(second.document).toEqual(first.document);
    expect(second.warnings).toEqual([]);
  });

  it("保持历史裸 FlowDocument JSON 可 parse 且输出仍是 schemaVersion 1 裸文档", () => {
    const historicalJson = JSON.stringify(createFlow());
    const historicalDocument = parseFlowDocument(JSON.parse(historicalJson));

    const result = createPortableFlowDocument(historicalDocument);

    expect(result.document).toEqual(historicalDocument);
    expect(result.document.schemaVersion).toBe(1);
    expect(Object.keys(result)).toEqual(["document", "warnings"]);
    expect(() => parseFlowDocument(JSON.parse(JSON.stringify(result.document)))).not.toThrow();
  });
});
