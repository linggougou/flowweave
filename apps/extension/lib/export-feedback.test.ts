import { describe, expect, it } from "vitest";

import { formatExportSuccessStatus } from "./export-feedback.js";

describe("扩展安全导出反馈", () => {
  it("按实际 warning 数量提示已处理项并要求继续检查业务文本", () => {
    expect(
      formatExportSuccessStatus({
        warningCount: 6,
        businessTextReviewRequired: true,
      }),
    ).toBe("已处理 6 项，请继续检查业务文本；已触发 JSON 下载");
  });

  it("零 warning 时不谎报处理项，也不宣称完全匿名化", () => {
    const message = formatExportSuccessStatus({
      warningCount: 0,
      businessTextReviewRequired: true,
    });

    expect(message).toBe("未发现当前规则可识别的敏感项，请继续检查业务文本；已触发 JSON 下载");
    expect(message).not.toMatch(/完全脱敏|完全匿名|绝对安全/);
  });

  it.each([undefined, { warningCount: -1 }, { warningCount: "1" }, { warningCount: Number.NaN }])(
    "摘要为 %o 时拒绝生成伪成功提示",
    (summary) => {
      const message = formatExportSuccessStatus(summary as never);

      expect(message).toBe("导出结果摘要无效，未确认 JSON 下载");
      expect(message).not.toMatch(/已处理|已触发|NaN|-1/);
    },
  );

  it("恶意 getter 抛错时仍返回安全提示", () => {
    const summary = Object.defineProperty({}, "warningCount", {
      get() {
        throw new Error("恶意 getter");
      },
    });

    expect(formatExportSuccessStatus(summary)).toBe("导出结果摘要无效，未确认 JSON 下载");
  });
});
