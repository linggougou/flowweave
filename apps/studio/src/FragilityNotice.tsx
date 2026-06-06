import type { ReactNode } from "react";
import type { FragilityIssue } from "@flowweave/page-intelligence";

type FragilitySummary = {
  message: string;
  stepNumbers: number[];
};

function summarizeWarnings(warnings: FragilityIssue[]): FragilitySummary[] {
  const groups = new Map<string, number[]>();

  for (const item of warnings) {
    const steps = groups.get(item.message) ?? [];
    steps.push(item.stepIndex + 1);
    groups.set(item.message, steps);
  }

  return Array.from(groups.entries()).map(([message, stepNumbers]) => ({
    message,
    stepNumbers: stepNumbers.sort((a, b) => a - b),
  }));
}

function formatStepRange(numbers: number[]): string {
  if (numbers.length <= 8) {
    return numbers.join("、");
  }
  return `${numbers.slice(0, 6).join("、")} 等 ${numbers.length} 步`;
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

  return (
    <aside className="fragility-notice" role="status">
      <div className="fragility-notice-head">
        <span className="fragility-notice-badge">提示</span>
        <span className="fragility-notice-count">{total} 处可改进</span>
      </div>
      <ul className="fragility-notice-list">
        {summaries.map((item) => (
          <li key={item.message}>
            <span className="fragility-notice-message">{item.message}</span>
            <span className="fragility-notice-steps">涉及步骤 {formatStepRange(item.stepNumbers)}</span>
          </li>
        ))}
      </ul>
      {total > 3 ? (
        <details className="fragility-notice-details">
          <summary>展开逐步明细</summary>
          <ul className="fragility-notice-detail-list">
            {warnings.map((w) => (
              <li key={`${w.stepId}-${w.code}`}>
                步骤 {w.stepIndex + 1} · {w.message}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </aside>
  );
}
