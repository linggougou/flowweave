import type { ReactNode } from "react";

export type StepLogArtifact = {
  kind: "diagnostic" | "page-snapshot" | "screenshot";
  label: string;
  path: string;
};

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
  pageSnapshotPath?: string;
  insightCategoryLabel?: string;
  insightTitle?: string;
  insightSummary?: string;
  pageSummary?: string;
  artifacts?: StepLogArtifact[];
};

export type StepLogTableProps = {
  steps: StepLogRow[];
  emptyMessage?: string;
  onOpenScreenshot?: (filePath: string) => void;
  onOpenDiagnostic?: (filePath: string) => void;
  onInspectDiagnostic?: (step: StepLogRow) => void;
};

const STATUS_LABEL: Record<string, string> = {
  pending: "待执行",
  running: "执行中",
  passed: "通过",
  failed: "失败",
  skipped: "跳过",
};

function renderArtifactButton(
  artifact: StepLogArtifact,
  onOpen?: (filePath: string) => void,
): ReactNode {
  if (onOpen) {
    return (
      <button
        key={artifact.path}
        type="button"
        className="fw-step-screenshot-btn"
        title={artifact.path}
        onClick={() => onOpen(artifact.path)}
      >
        {artifact.label}
      </button>
    );
  }

  return (
    <span key={artifact.path} title={artifact.path}>
      {artifact.label}
    </span>
  );
}

export function StepLogTable({
  steps,
  emptyMessage = "暂无步骤日志",
  onOpenScreenshot,
  onOpenDiagnostic,
  onInspectDiagnostic,
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
          <th>优先排查</th>
          <th>页面快照</th>
          <th>产物</th>
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
            <td>
              {step.insightTitle || step.insightSummary || step.message ? (
                <div style={{ display: "grid", gap: 4 }}>
                  {step.insightTitle ? (
                    <strong>
                      {step.insightCategoryLabel ? `${step.insightCategoryLabel} · ` : ""}
                      {step.insightTitle}
                    </strong>
                  ) : null}
                  {step.insightSummary ? (
                    <span className="flow-content-meta">{step.insightSummary}</span>
                  ) : step.message ? (
                    <span className="flow-content-meta">{step.message}</span>
                  ) : null}
                  {step.message && step.message !== step.insightSummary ? (
                    <span className="flow-content-meta">运行反馈：{step.message}</span>
                  ) : null}
                </div>
              ) : (
                "—"
              )}
            </td>
            <td>{step.pageSummary ?? "—"}</td>
            <td className="fw-step-screenshot">
              {step.artifacts && step.artifacts.length > 0 ? (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {onInspectDiagnostic && (step.diagnosticPath || step.pageSnapshotPath) ? (
                    <button
                      type="button"
                      className="fw-step-screenshot-btn"
                      onClick={() => onInspectDiagnostic(step)}
                    >
                      诊断台
                    </button>
                  ) : null}
                  {step.artifacts.map((artifact) =>
                    renderArtifactButton(
                      artifact,
                      artifact.kind === "screenshot" ? onOpenScreenshot : onOpenDiagnostic,
                    ),
                  )}
                </div>
              ) : step.diagnosticPath || step.pageSnapshotPath ? (
                onInspectDiagnostic ? (
                  <button
                    type="button"
                    className="fw-step-screenshot-btn"
                    title={step.diagnosticPath ?? step.pageSnapshotPath}
                    onClick={() => onInspectDiagnostic(step)}
                  >
                    诊断台
                  </button>
                ) : onOpenDiagnostic ? (
                  <button
                    type="button"
                    className="fw-step-screenshot-btn"
                    title={step.diagnosticPath ?? step.pageSnapshotPath}
                    onClick={() => onOpenDiagnostic(step.diagnosticPath ?? step.pageSnapshotPath!)}
                  >
                    {shortenPath(step.diagnosticPath ?? step.pageSnapshotPath!)}
                  </button>
                ) : (
                  <span title={step.diagnosticPath ?? step.pageSnapshotPath}>
                    {shortenPath(step.diagnosticPath ?? step.pageSnapshotPath!)}
                  </span>
                )
              ) : step.screenshotPath ? (
                renderArtifactButton(
                  {
                    kind: "screenshot",
                    label: "步骤截图",
                    path: step.screenshotPath,
                  },
                  onOpenScreenshot,
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
