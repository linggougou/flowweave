import type { ReactNode } from "react";

export type StepLogRow = {
  stepIndex: number;
  stepId: string;
  label: string;
  status: string;
  message?: string;
  durationMs?: number;
  startedAt: string;
  finishedAt?: string;
  screenshotPath?: string;
  diagnosticPath?: string;
};

export type StepLogTableProps = {
  steps: StepLogRow[];
  emptyMessage?: string;
  onOpenScreenshot?: (filePath: string) => void;
  onOpenDiagnostic?: (filePath: string) => void;
};

const STATUS_LABEL: Record<string, string> = {
  pending: "待执行",
  running: "执行中",
  passed: "通过",
  failed: "失败",
  skipped: "跳过",
};

export function StepLogTable({
  steps,
  emptyMessage = "暂无步骤日志",
  onOpenScreenshot,
  onOpenDiagnostic,
}: StepLogTableProps): ReactNode {
  if (steps.length === 0) {
    return <p className="fw-step-log-empty">{emptyMessage}</p>;
  }

  return (
    <table className="fw-step-log-table">
      <thead>
        <tr>
          <th>#</th>
          <th>步骤</th>
          <th>状态</th>
          <th>耗时</th>
          <th>说明</th>
          <th>截图</th>
          <th>诊断</th>
          <th>开始</th>
          <th>结束</th>
        </tr>
      </thead>
      <tbody>
        {steps.map((step) => (
          <tr key={`${step.stepId}-${step.stepIndex}`}>
            <td>{step.stepIndex + 1}</td>
            <td>{step.label}</td>
            <td>{STATUS_LABEL[step.status] ?? step.status}</td>
            <td>{formatDuration(step.durationMs)}</td>
            <td>{step.message ?? "—"}</td>
            <td className="fw-step-screenshot">
              {step.screenshotPath ? (
                onOpenScreenshot ? (
                  <button
                    type="button"
                    className="fw-step-screenshot-btn"
                    title={step.screenshotPath}
                    onClick={() => onOpenScreenshot(step.screenshotPath!)}
                  >
                    {shortenPath(step.screenshotPath)}
                  </button>
                ) : (
                  <span title={step.screenshotPath}>{shortenPath(step.screenshotPath)}</span>
                )
              ) : (
                "—"
              )}
            </td>
            <td className="fw-step-screenshot">
              {step.diagnosticPath ? (
                onOpenDiagnostic ? (
                  <button
                    type="button"
                    className="fw-step-screenshot-btn"
                    title={step.diagnosticPath}
                    onClick={() => onOpenDiagnostic(step.diagnosticPath!)}
                  >
                    {shortenPath(step.diagnosticPath)}
                  </button>
                ) : (
                  <span title={step.diagnosticPath}>{shortenPath(step.diagnosticPath)}</span>
                )
              ) : (
                "—"
              )}
            </td>
            <td>{formatTime(step.startedAt)}</td>
            <td>{step.finishedAt ? formatTime(step.finishedAt) : "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function formatDuration(ms?: number): string {
  if (ms === undefined || Number.isNaN(ms)) {
    return "—";
  }
  if (ms < 1000) {
    return `${ms}ms`;
  }
  return `${(ms / 1000).toFixed(2)}s`;
}

function shortenPath(path: string): string {
  if (path.length <= 48) {
    return path;
  }
  return `…${path.slice(-44)}`;
}

function formatTime(iso: string): string {
  if (iso === "—") {
    return iso;
  }
  try {
    return new Date(iso).toLocaleTimeString("zh-CN");
  } catch {
    return iso;
  }
}
