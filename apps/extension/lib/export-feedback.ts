export function formatExportSuccessStatus(summary: unknown): string {
  let warningCount: number;
  try {
    if (
      typeof summary !== "object" ||
      summary === null ||
      !("warningCount" in summary) ||
      typeof summary.warningCount !== "number" ||
      !Number.isInteger(summary.warningCount) ||
      summary.warningCount < 0 ||
      !("businessTextReviewRequired" in summary) ||
      summary.businessTextReviewRequired !== true
    ) {
      return "导出结果摘要无效，未确认 JSON 下载";
    }
    warningCount = summary.warningCount;
  } catch {
    return "导出结果摘要无效，未确认 JSON 下载";
  }

  if (warningCount === 0) {
    return "未发现当前规则可识别的敏感项，请继续检查业务文本；已触发 JSON 下载";
  }

  return `已处理 ${warningCount} 项，请继续检查业务文本；已触发 JSON 下载`;
}
