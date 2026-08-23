import type { ExportFlowSummary } from "./messages.js";

export function formatExportSuccessStatus(summary: ExportFlowSummary): string {
  if (summary.warningCount === 0) {
    return "未发现当前规则可识别的敏感项，请继续检查业务文本；已触发 JSON 下载";
  }

  return `已处理 ${summary.warningCount} 项，请继续检查业务文本；已触发 JSON 下载`;
}
