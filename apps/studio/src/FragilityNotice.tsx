import type { ReactNode } from "react";
import type { FragilityIssue } from "@flowweave/page-intelligence";

type FragilitySummary = {
  code: FragilityIssue["code"];
  severity: FragilityIssue["severity"];
  message: string;
  stepNumbers: number[];
};

function summarizeWarnings(warnings: FragilityIssue[]): FragilitySummary[] {
  const groups = new Map<string, FragilitySummary>();

  for (const item of warnings) {
    const key = `${item.severity}:${item.code}:${item.message}`;
    const summary = groups.get(key) ?? {
      code: item.code,
      severity: item.severity,
      message: item.message,
      stepNumbers: [],
    };
    summary.stepNumbers.push(item.stepIndex + 1);
    groups.set(key, summary);
  }

  return Array.from(groups.values()).map((summary) => ({
    ...summary,
    stepNumbers: summary.stepNumbers.sort((a, b) => a - b),
  }));
}

function formatStepRange(numbers: number[]): string {
  if (numbers.length <= 8) {
    return numbers.join("、");
  }
  return `${numbers.slice(0, 6).join("、")} 等 ${numbers.length} 步`;
}

function severityLabel(severity: FragilityIssue["severity"]): string {
  return severity === "error" ? "错误" : "警告";
}

export type FragilityNoticeProps = {
  warnings: FragilityIssue[];
};

/** 合并同类脆弱性提示，避免重复条目刷屏 */
export function FragilityNotice({ warnings }: FragilityNoticeProps): ReactNode {
  if (warnings.length === 0) {
    return null;
  }

  const summaries = summarizeWarnings(warnings);
  const total = warnings.length;
  const errorSummaries = summaries.filter((item) => item.severity === "error");
  const warningSummaries = summaries.filter((item) => item.severity === "warning");
  const errorCount = warnings.filter((item) => item.severity === "error").length;
  const warningCount = total - errorCount;

  return (
    <aside className="fragility-notice" role="status">
      <div className="fragility-notice-head">
        <span className="fragility-notice-badge">{errorCount > 0 ? "需处理" : "提示"}</span>
        <span className="fragility-notice-count">
          {total} 项诊断 · 错误 {errorCount} · 警告 {warningCount}
        </span>
      </div>
      {errorSummaries.length > 0 ? (
        <>
          <p className="execution-history-meta">错误</p>
          <ul className="fragility-notice-list">
            {errorSummaries.map((item) => (
              <li key={`${item.severity}-${item.code}-${item.message}`}>
                <span className="fragility-notice-message">
                  [{item.code}] {item.message}
                </span>
                <span className="fragility-notice-steps">
                  涉及步骤 {formatStepRange(item.stepNumbers)}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {warningSummaries.length > 0 ? (
        <>
          <p className="execution-history-meta">警告</p>
          <ul className="fragility-notice-list">
            {warningSummaries.map((item) => (
              <li key={`${item.severity}-${item.code}-${item.message}`}>
                <span className="fragility-notice-message">
                  [{item.code}] {item.message}
                </span>
                <span className="fragility-notice-steps">
                  涉及步骤 {formatStepRange(item.stepNumbers)}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {total > 3 ? (
        <details className="fragility-notice-details">
          <summary>展开逐步明细</summary>
          <ul className="fragility-notice-detail-list">
            {warnings.map((w) => (
              <li key={`${w.stepId}-${w.code}-${w.stepIndex}`}>
                [{severityLabel(w.severity)} / {w.code}] 步骤 {w.stepIndex + 1} · {w.message}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </aside>
  );
}
