import type { ReactNode } from "react";

export type StepLogRow = {
  stepIndex: number;
  stepId: string;
  label: string;
  status: string;
  message?: string;
  startedAt: string;
  finishedAt?: string;
};

export type StepLogTableProps = {
  steps: StepLogRow[];
  emptyMessage?: string;
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
          <th>说明</th>
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
            <td>{step.message ?? "—"}</td>
            <td>{formatTime(step.startedAt)}</td>
            <td>{step.finishedAt ? formatTime(step.finishedAt) : "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("zh-CN");
  } catch {
    return iso;
  }
}
