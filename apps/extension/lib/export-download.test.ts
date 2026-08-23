import type { FlowDocument, FlowPortabilityWarning } from "@flowweave/flow-dsl";
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
    expect(download).toHaveBeenCalledWith("flow-session-.json", JSON.stringify(document));
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
      throw new Error("浏览器拒绝下载");
    });

    const result = processExportFlowDownload(createSuccessResponse(), download);

    expect(result).toEqual({ ok: false, error: "导出失败：浏览器拒绝下载" });
    expect(download).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toContain("已触发 JSON 下载");
  });
});
