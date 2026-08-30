import { describe, expect, it } from "vitest";
import { FLOW_SCHEMA_VERSION } from "@flowweave/shared";
import { createPortableFlowDocument, parseFlowDocument, type FlowDocument } from "./index.js";

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

  it("在 navigate 与 wait 删除 raw/编码 userinfo 前硬化 username/password 全部变量", () => {
    const canary = 'FLOWWEAVE_R3_USERINFO_CANARY_"\\\n雪';
    const input = createFlow({
      variables: [
        { name: "username", type: "string", required: false, defaultValue: canary },
        { name: "password", type: "string", required: false, defaultValue: canary },
        { name: "tenant", type: "string", required: false, defaultValue: canary },
        { name: "public_note", type: "string", required: false, defaultValue: "公开默认值" },
      ],
      steps: [
        {
          id: "navigate-raw-single-username",
          type: "navigate",
          url: "https://{{username}}:literal@example.test/raw-user",
        },
        {
          id: "navigate-raw-single-password",
          type: "navigate",
          url: "https://literal:{{password}}@example.test/raw-password",
        },
        {
          id: "wait-raw-multiple",
          type: "wait",
          condition: "urlIncludes",
          urlIncludes:
            "https://{{username}}:prefix-{{password}}-{{tenant}}@example.test/raw-multiple",
        },
        {
          id: "navigate-single-encoded",
          type: "navigate",
          url: "https://%7B%7Busername%7D%7D:%7B%7Bpassword%7D%7D@example.test/encoded-one",
        },
        {
          id: "wait-double-encoded",
          type: "wait",
          condition: "urlIncludes",
          urlIncludes:
            "https://%257B%257Busername%257D%257D:%257B%257Bpassword%257D%257D@example.test/encoded-two",
        },
        {
          id: "literal-userinfo",
          type: "navigate",
          url: "https://literal-user:literal-password@example.test/literal",
        },
        {
          id: "public-query",
          type: "navigate",
          url: "https://example.test/path?state={{public_note}}",
        },
      ],
    });

    const result = createPortableFlowDocument(input);
    const serialized = JSON.stringify(result);
    const escapedCanary = JSON.stringify(canary).slice(1, -1);

    expect(serialized).not.toContain(canary);
    expect(serialized).not.toContain(escapedCanary);
    expect(result.document.variables).toEqual([
      { name: "username", type: "string", required: true },
      { name: "password", type: "string", required: true },
      { name: "tenant", type: "string", required: true },
      {
        name: "public_note",
        type: "string",
        required: false,
        defaultValue: "公开默认值",
      },
    ]);
    expect(result.document.steps.slice(0, 6)).toEqual([
      {
        id: "navigate-raw-single-username",
        type: "navigate",
        url: "https://example.test/raw-user",
      },
      {
        id: "navigate-raw-single-password",
        type: "navigate",
        url: "https://example.test/raw-password",
      },
      {
        id: "wait-raw-multiple",
        type: "wait",
        condition: "urlIncludes",
        urlIncludes: "https://example.test/raw-multiple",
      },
      { id: "navigate-single-encoded", type: "navigate", url: "https://example.test/encoded-one" },
      {
        id: "wait-double-encoded",
        type: "wait",
        condition: "urlIncludes",
        urlIncludes: "https://example.test/encoded-two",
      },
      { id: "literal-userinfo", type: "navigate", url: "https://example.test/literal" },
    ]);
    expect(
      result.warnings.filter((warning) => warning.code === "url-userinfo-removed"),
    ).toHaveLength(6);
    expect(JSON.stringify(result.warnings)).not.toContain(canary);
    expect(JSON.stringify(result.warnings)).not.toContain(escapedCanary);
  });

  it("非法 percent 不得阻断 navigate/wait userinfo 变量硬化", () => {
    const canary = 'FLOWWEAVE_R4_PERCENT_CANARY_"\\\n雪';
    const input = createFlow({
      variables: ["username", "password", "tenant"].map((name) => ({
        name,
        type: "string" as const,
        required: false,
        defaultValue: canary,
      })),
      steps: [
        {
          id: "navigate-malformed-before",
          type: "navigate",
          url: "https://bad%ZZ%7B%7Busername%7D%7D:literal@example.test/before",
        },
        {
          id: "wait-malformed-after",
          type: "wait",
          condition: "urlIncludes",
          urlIncludes: "https://literal:%7B%7Bpassword%7D%7D%ZZ@example.test/after",
        },
        {
          id: "navigate-malformed-middle",
          type: "navigate",
          url: "https://%7B%7Busername%7D%7D%ZZ%7B%7Btenant%7D%7D:literal@example.test/middle",
        },
        {
          id: "wait-double-malformed-opposite",
          type: "wait",
          condition: "urlIncludes",
          urlIncludes: "https://bad%ZZ:%257B%257Bpassword%257D%257D@example.test/opposite",
        },
      ],
    });

    const result = createPortableFlowDocument(input);
    const serialized = JSON.stringify(result);
    const escapedCanary = JSON.stringify(canary).slice(1, -1);

    expect(result.document.variables).toEqual([
      { name: "username", type: "string", required: true },
      { name: "password", type: "string", required: true },
      { name: "tenant", type: "string", required: true },
    ]);
    expect(result.document.steps).toEqual([
      { id: "navigate-malformed-before", type: "navigate", url: "https://example.test/before" },
      {
        id: "wait-malformed-after",
        type: "wait",
        condition: "urlIncludes",
        urlIncludes: "https://example.test/after",
      },
      { id: "navigate-malformed-middle", type: "navigate", url: "https://example.test/middle" },
      {
        id: "wait-double-malformed-opposite",
        type: "wait",
        condition: "urlIncludes",
        urlIncludes: "https://example.test/opposite",
      },
    ]);
    expect(
      result.warnings.filter((warning) => warning.code === "url-userinfo-removed"),
    ).toHaveLength(4);
    expect(serialized).not.toContain(canary);
    expect(serialized).not.toContain(escapedCanary);
  });

  it("第三层编码 userinfo 模板以固定无值错误拒绝而非保留 default", () => {
    const canary = 'FLOWWEAVE_R4_THIRD_LAYER_CANARY_"\\\n雪';
    const input = createFlow({
      variables: [{ name: "credential", type: "string", required: false, defaultValue: canary }],
      steps: [
        {
          id: "third-layer-userinfo",
          type: "navigate",
          url: "https://%25257B%25257Bcredential%25257D%25257D:literal@example.test/path",
        },
      ],
    });

    let failure: unknown;
    try {
      createPortableFlowDocument(input);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toBe("URL userinfo percent 编码层级超出安全上限");
    expect(JSON.stringify(failure)).not.toContain(canary);
    expect(JSON.stringify(failure)).not.toContain(JSON.stringify(canary).slice(1, -1));
    expect(JSON.stringify(failure)).not.toContain("credential");
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

  it("对 navigate 与 wait 统一处理 raw key、点分隔和双层编码敏感键", () => {
    const input = createFlow({
      steps: [
        {
          id: "raw-key",
          type: "navigate",
          url: "https://example.test/path?key=raw-secret",
        },
        {
          id: "dot-credential",
          type: "navigate",
          url: "https://example.test/path?client.secret=dot-secret",
        },
        {
          id: "encoded-credential",
          type: "wait",
          condition: "urlIncludes",
          urlIncludes: "?%2561%2570%2569%255F%256B%2565%2579=encoded-secret",
        },
      ],
    });

    const result = createPortableFlowDocument(input);
    const serialized = JSON.stringify(result.document);

    expect(serialized).not.toContain("raw-secret");
    expect(serialized).not.toContain("dot-secret");
    expect(serialized).not.toContain("encoded-secret");
    expect(
      result.warnings.filter((warning) => warning.code === "url-query-variableized"),
    ).toHaveLength(3);
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
