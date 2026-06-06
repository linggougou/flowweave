import type { ReactNode } from "react";

export type FlowStepRow = {
  stepIndex: number;
  stepId: string;
  type: string;
  summary: string;
  detail?: string;
};

export type FlowStepsTableProps = {
  steps: FlowStepRow[];
  emptyMessage?: string;
};

export function FlowStepsTable({
  steps,
  emptyMessage = "暂无步骤",
}: FlowStepsTableProps): ReactNode {
  if (steps.length === 0) {
    return <p className="fw-step-log-empty">{emptyMessage}</p>;
  }

  return (
    <table className="fw-step-log-table fw-flow-steps-table">
      <thead>
        <tr>
          <th>#</th>
          <th>类型</th>
          <th>步骤 ID</th>
          <th>内容</th>
          <th>定位</th>
        </tr>
      </thead>
      <tbody>
        {steps.map((step) => (
          <tr key={`${step.stepId}-${step.stepIndex}`}>
            <td>{step.stepIndex + 1}</td>
            <td>{step.type}</td>
            <td className="fw-flow-step-id" title={step.stepId}>
              {shortId(step.stepId)}
            </td>
            <td>{step.summary}</td>
            <td className="fw-flow-step-detail" title={step.detail}>
              {step.detail ?? "—"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function shortId(id: string): string {
  if (id.length <= 12) {
    return id;
  }
  return `${id.slice(0, 8)}…`;
}
