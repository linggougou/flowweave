import type { StudioExecution } from "./shared/studio-api-types.js";
import { buildFailureInsight } from "./shared/failure-insights.js";

type ExecutionResultSummaryProps = {
  execution: StudioExecution;
  taskName: string;
};

function formatStatus(status: string): string {
  switch (status) {
    case "passed":
    case "success":
      return "成功";
    case "failed":
      return "失败";
    case "cancelled":
      return "已取消";
    case "running":
      return "运行中";
    default:
      return "等待运行";
  }
}

function formatResultTime(iso?: string): string {
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

export function ExecutionResultSummary({ execution, taskName }: ExecutionResultSummaryProps) {
  const failedStep = execution.steps.find((step) => step.status === "failed");
  const insight = failedStep ? buildFailureInsight(failedStep) : undefined;
  const completed = execution.steps.filter((step) => step.status === "passed").length;
  const statusLabel = formatStatus(execution.status);
  const statusClass = execution.status === "passed" ? "success" : execution.status;

  return (
    <section
      className={`studio-result-summary result-${statusClass}`}
      aria-labelledby="studio-result-title"
    >
      <header className="studio-result-header">
        <div>
          <p className="business-eyebrow">最近一次运行</p>
          <h2 id="studio-result-title">{taskName}</h2>
        </div>
        <span className={`business-status status-${statusClass}`}>{statusLabel}</span>
      </header>
      <p className="studio-result-facts">
        {formatResultTime(execution.finishedAt ?? execution.startedAt)} · {execution.steps.length}{" "}
        个步骤 · 已完成 {completed}/{execution.steps.length}
      </p>
      {failedStep ? (
        <div className="studio-result-message">
          <strong>
            主要原因：{failedStep.label} · {insight?.title ?? "没有按计划完成"}
          </strong>
          <p>任务在第 {failedStep.stepIndex + 1} 步停止，已完成的步骤仍保留在运行记录中。</p>
          <p>
            <span className="result-advice-label">建议</span>
            先核对目标页面和该步骤，必要时重新录制后再运行。
          </p>
        </div>
      ) : execution.status === "passed" ? (
        <div className="studio-result-message result-message-success">
          <strong>本次自动化任务已完成</strong>
          <p>全部步骤均按计划结束。</p>
        </div>
      ) : null}
    </section>
  );
}
