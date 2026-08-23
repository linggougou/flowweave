import type { ExecutionResult } from "@flowweave/project-knowledge";
import { StepLogTable, type StepLogRow } from "@flowweave/ui";

import { ExecutionResultSummary, formatBusinessStatus } from "./business-view.js";

type ExecutionRecordsViewProps = {
  taskName: string;
  executions: ExecutionResult[];
  selectedExecutionId: string | null;
  executionDetail: ExecutionResult | null;
  detailLoading: boolean;
  onSelect: (executionId: string) => void;
};

function formatExecutionTime(iso?: string): string {
  if (!iso) return "时间未记录";
  try {
    return new Date(iso).toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function toStepRows(execution: ExecutionResult): StepLogRow[] {
  return execution.steps.map((step) => ({
    stepIndex: step.stepIndex,
    stepId: step.stepId,
    label: `步骤 ${step.stepIndex + 1} · ${step.stepId}`,
    status: step.status,
    message: step.errorMessage,
    durationMs: step.durationMs,
    startedAt: execution.startedAt ?? "—",
    finishedAt: execution.finishedAt,
    screenshotPath: step.screenshotPath,
    diagnosticPath: step.diagnosticPath,
  }));
}

export function ExecutionRecordsView({
  taskName,
  executions,
  selectedExecutionId,
  executionDetail,
  detailLoading,
  onSelect,
}: ExecutionRecordsViewProps) {
  const selectedSummary =
    executions.find((execution) => execution.executionId === selectedExecutionId) ?? null;
  const matchingDetail =
    executionDetail?.executionId === selectedExecutionId ? executionDetail : null;
  const summaryExecution = matchingDetail ?? selectedSummary;
  const steps = matchingDetail ? toStepRows(matchingDetail) : [];

  if (!selectedSummary || !summaryExecution) return null;

  return (
    <>
      <ExecutionResultSummary execution={summaryExecution} taskName={taskName} />
      <div className="execution-records-layout">
        <section className="run-record-list" aria-labelledby="run-record-list-title">
          <h2 id="run-record-list-title">运行记录</h2>
          <ul className="execution-history-list">
            {executions.map((item, index) => (
              <li key={item.executionId}>
                <button
                  type="button"
                  aria-pressed={item.executionId === selectedExecutionId}
                  className={
                    item.executionId === selectedExecutionId
                      ? "execution-history-item active"
                      : "execution-history-item"
                  }
                  onClick={() => onSelect(item.executionId)}
                >
                  <span className="execution-history-label">
                    {index === 0 ? "最近一次" : `较早记录 ${index}`}
                  </span>
                  <span className={`execution-history-status status-${item.status}`}>
                    {formatBusinessStatus(item.status)} ·{" "}
                    {formatExecutionTime(item.finishedAt ?? item.startedAt)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <details className="professional-details">
          <summary>专业日志</summary>
          <p className="professional-details-intro">
            供排障使用：步骤状态、底层错误、截图路径和诊断文件。
          </p>
          {detailLoading || !matchingDetail ? (
            <p className="execution-detail-loading" role="status">
              正在加载所选运行记录…
            </p>
          ) : (
            <>
              <div className="table-scroll">
                <StepLogTable steps={steps} emptyMessage="该运行记录没有步骤日志" />
              </div>
              <dl className="technical-identifiers">
                <div>
                  <dt>运行标识</dt>
                  <dd>{matchingDetail.executionId}</dd>
                </div>
                <div>
                  <dt>任务标识</dt>
                  <dd>{matchingDetail.flowId}</dd>
                </div>
              </dl>
            </>
          )}
        </details>
      </div>
    </>
  );
}
