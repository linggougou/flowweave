import {
  parseFlowDocument,
  type FlowDocument,
  type FlowPortabilityWarning,
} from "@flowweave/flow-dsl";
import { describe, expect, it, vi } from "vitest";

import { processExportFlowDownload } from "./export-download.js";

const document: FlowDocument = {
  schemaVersion: 1,
  id: "flow-export",
  projectId: "project-source",
  name: "导出流程",
  variables: [],
  steps: [{ id: "navigate", type: "navigate", url: "https://example.com" }],
  meta: {
    createdAt: "2026-08-23T08:00:00.000Z",
    updatedAt: "2026-08-23T08:00:00.000Z",
    source: "recorded",
  },
};

const warning: FlowPortabilityWarning = {
  code: "url-query-variableized",
  path: "steps[0].url",
  message: "已变量化 URL 查询参数",
  variableName: "url_token",
};

function createSuccessResponse(overrides: Record<string, unknown> = {}): unknown {
  return {
    ok: true,
    json: JSON.stringify(document),
    filename: "flow-session-.json",
    warnings: [],
    summary: {
      warningCount: 0,
      businessTextReviewRequired: true,
    },
    ...overrides,
  };
}

describe("扩展导出响应运行时校验", () => {
  it("仅在完整合法的 bare schemaVersion 1 FlowDocument 响应上触发下载", () => {
    const download = vi.fn();

    const result = processExportFlowDownload(createSuccessResponse(), download);

    expect(result).toEqual({
      ok: true,
      status: "未发现当前规则可识别的敏感项，请继续检查业务文本；已触发 JSON 下载",
    });
    expect(download).toHaveBeenCalledWith(
      "flow-session-.json",
      JSON.stringify(document, null, 2),
    );
  });

  it("从公共解析结果重序列化下载，移除嵌套未知字段并保留合法字段", () => {
    const rawDocument = {
      ...document,
      steps: [
        {
          id: "navigate",
          type: "navigate",
          url: "https://example.com/known",
          secret: "TOP-SECRET-STEP",
        },
        {
          id: "click",
          type: "click",
          target: {
            strategies: [{ kind: "css", selector: "button.submit" }],
            hints: {
              tagName: "button",
              labelText: "提交",
              secret: "TOP-SECRET-HINT",
            },
            secret: "TOP-SECRET-TARGET",
          },
        },
      ],
      meta: {
        ...document.meta,
        warnings: "TOP-SECRET-META",
      },
    };
    const originalJson = JSON.stringify(rawDocument);
    const response = createSuccessResponse({ json: originalJson }) as Record<string, unknown>;
    const download = vi.fn();

    const result = processExportFlowDownload(response, download);

    expect(result.ok).toBe(true);
    expect(download).toHaveBeenCalledWith(
      "flow-session-.json",
      JSON.stringify(parseFlowDocument(rawDocument), null, 2),
    );
    const downloadedJson = download.mock.calls[0]?.[1] as string;
    const downloaded = JSON.parse(downloadedJson) as Record<string, unknown>;
    expect(Object.keys(downloaded)).toEqual([
      "schemaVersion",
      "id",
      "projectId",
      "name",
      "variables",
      "steps",
      "meta",
    ]);
    expect(downloadedJson).not.toContain("TOP-SECRET");
    expect(downloadedJson).toContain("https://example.com/known");
    expect(downloadedJson).toContain('"tagName": "button"');
    expect(downloadedJson).toContain('"labelText": "提交"');
    expect(response.json).toBe(originalJson);
    expect(rawDocument.steps[0]).toHaveProperty("secret", "TOP-SECRET-STEP");
    expect(rawDocument.meta).toHaveProperty("warnings", "TOP-SECRET-META");
  });

  it.each([
    ["缺 JSON", { json: undefined }],
    ["缺文件名", { filename: undefined }],
    ["空文件名", { filename: "  " }],
    ["缺 summary", { summary: undefined }],
    ["负 warningCount", { summary: { warningCount: -1, businessTextReviewRequired: true } }],
    ["字符串 warningCount", { summary: { warningCount: "1", businessTextReviewRequired: true } }],
    ["NaN warningCount", { summary: { warningCount: Number.NaN, businessTextReviewRequired: true } }],
    [
      "warning 数量不匹配",
      {
        warnings: [warning],
        summary: { warningCount: 0, businessTextReviewRequired: true },
      },
    ],
    ["未要求业务文本复核", { summary: { warningCount: 0, businessTextReviewRequired: false } }],
    ["缺 warnings", { warnings: undefined }],
    [
      "伪造 warning",
      { warnings: [{}], summary: { warningCount: 1, businessTextReviewRequired: true } },
    ],
    [
      "伪造 warning code",
      {
        warnings: [{ ...warning, code: "attacker-invented-code" }],
        summary: { warningCount: 1, businessTextReviewRequired: true },
      },
    ],
  ])("%s 时不下载且不返回成功", (_label, overrides) => {
    const download = vi.fn();

    const result = processExportFlowDownload(createSuccessResponse(overrides), download);

    expect(result).toEqual({ ok: false, error: "导出响应无效" });
    expect(download).not.toHaveBeenCalled();
  });

  it.each([undefined, null, "response", { ok: "true" }, { ok: false }])(
    "响应对象或 ok 不合法（%o）时不下载",
    (response) => {
      const download = vi.fn();

      const result = processExportFlowDownload(response, download);

      expect(result.ok).toBe(false);
      expect(download).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["非法 JSON", "not-json"],
    ["包装 payload", JSON.stringify({ document, warnings: [] })],
    ["非法 FlowDocument", JSON.stringify({ schemaVersion: 1 })],
  ])("拒绝%s且不下载", (_label, json) => {
    const download = vi.fn();

    const result = processExportFlowDownload(createSuccessResponse({ json }), download);

    expect(result).toEqual({ ok: false, error: "导出响应无效" });
    expect(download).not.toHaveBeenCalled();
  });

  it("下载函数失败时返回失败结果且不生成成功提示", () => {
    const download = vi.fn(() => {
      throw new Error("<img src=x onerror=alert(1)>");
    });

    const result = processExportFlowDownload(createSuccessResponse(), download);

    expect(result).toEqual({ ok: false, error: "下载未完成" });
    expect(download).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toContain("已触发 JSON 下载");
    expect(JSON.stringify(result)).not.toContain("onerror");
  });

  it.each(["ok", "summary", "warnings"])("%s getter 抛错时不下载并返回固定错误", (key) => {
    const response = createSuccessResponse() as Record<string, unknown>;
    Object.defineProperty(response, key, {
      get() {
        throw new Error(`恶意 ${key} getter`);
      },
    });
    const download = vi.fn();

    const result = processExportFlowDownload(response, download);

    expect(result).toEqual({ ok: false, error: "导出响应无效" });
    expect(download).not.toHaveBeenCalled();
  });

  it("响应 Proxy 的 ownKeys trap 抛错时不下载并返回固定错误", () => {
    const response = new Proxy(createSuccessResponse() as object, {
      ownKeys() {
        throw new Error("恶意 ownKeys trap");
      },
    });
    const download = vi.fn();

    const result = processExportFlowDownload(response, download);

    expect(result).toEqual({ ok: false, error: "导出响应无效" });
    expect(download).not.toHaveBeenCalled();
  });

  it("revoked warnings Proxy 触发 Array.isArray 异常时不下载并返回固定错误", () => {
    const revoked = Proxy.revocable([], {});
    revoked.revoke();
    const response = createSuccessResponse({ warnings: revoked.proxy });
    const download = vi.fn();

    const result = processExportFlowDownload(response, download);

    expect(result).toEqual({ ok: false, error: "导出响应无效" });
    expect(download).not.toHaveBeenCalled();
  });

  it.each([
    ["json", JSON.stringify(document), "TOP-SECRET"],
    ["filename", "flow-session-.json", "../../attacker.json"],
    [
      "summary",
      { warningCount: 0, businessTextReviewRequired: true },
      { warningCount: 999, businessTextReviewRequired: true },
    ],
    ["warnings", [], [warning]],
  ])("%s getter 只读取一次并使用通过校验的快照", (key, firstValue, laterValue) => {
    const response = createSuccessResponse() as Record<string, unknown>;
    let readCount = 0;
    Object.defineProperty(response, key, {
      get() {
        readCount += 1;
        return readCount === 1 ? firstValue : laterValue;
      },
    });
    const download = vi.fn();

    const result = processExportFlowDownload(response, download);

    expect(result.ok).toBe(true);
    expect(readCount).toBe(1);
    expect(download).toHaveBeenCalledWith(
      "flow-session-.json",
      JSON.stringify(document, null, 2),
    );
    expect(JSON.stringify(download.mock.calls)).not.toContain("TOP-SECRET");
    expect(JSON.stringify(download.mock.calls)).not.toContain("../../attacker.json");
  });

  it("warning 字段 getter 只读取一次并快照受控 code", () => {
    const fields = {
      code: ["url-query-variableized", "attacker-invented-code"],
      path: ["steps[0].url", "attacker-path"],
      message: ["已变量化 URL 查询参数", "attacker-message"],
    } as const;
    const reads = { code: 0, path: 0, message: 0 };
    const warningWithGetters = {} as Record<string, unknown>;
    for (const key of Object.keys(fields) as Array<keyof typeof fields>) {
      Object.defineProperty(warningWithGetters, key, {
        enumerable: true,
        get() {
          const value = fields[key][Math.min(reads[key], 1)];
          reads[key] += 1;
          return value;
        },
      });
    }
    const response = createSuccessResponse({
      warnings: [warningWithGetters],
      summary: { warningCount: 1, businessTextReviewRequired: true },
    });
    const download = vi.fn();

    const result = processExportFlowDownload(response, download);

    expect(result.ok).toBe(true);
    expect(reads).toEqual({ code: 1, path: 1, message: 1 });
    expect(download).toHaveBeenCalledTimes(1);
  });
});
