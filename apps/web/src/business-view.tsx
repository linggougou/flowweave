import type { ReactNode } from "react";
import type { ExecutionResult } from "@flowweave/project-knowledge";

export type BusinessExecutionStatus = ExecutionResult["status"];

export function formatBusinessStatus(status: BusinessExecutionStatus): string {
  switch (status) {
    case "success":
      return "成功";
    case "failed":
      return "失败";
    case "cancelled":
      return "已取消";
  }
}

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

function formatDuration(startedAt?: string, finishedAt?: string): string | undefined {
  if (!startedAt || !finishedAt) return undefined;
  const durationMs = new Date(finishedAt).getTime() - new Date(startedAt).getTime();
  if (!Number.isFinite(durationMs) || durationMs < 0) return undefined;
  if (durationMs < 1000) return `${durationMs} 毫秒`;
  return `${(durationMs / 1000).toFixed(durationMs < 10_000 ? 1 : 0)} 秒`;
}

function describeFailure(execution: ExecutionResult): { cause: string; suggestion: string } {
  const failedStep = execution.steps.find((step) => step.status === "failed");
  const rawMessage = failedStep?.errorMessage ?? "";
  if (/timeout|timed out|waitfor|等待|超时/i.test(rawMessage)) {
    return {
      cause: "页面在预期时间内没有准备好",
      suggestion: "回到 Studio 核对目标页面是否已加载完成，再重新运行一次。",
    };
  }
  if (/locator|not found|no element|找不到|未找到/i.test(rawMessage)) {
    return {
      cause: "运行时没有找到需要操作的页面内容",
      suggestion: "回到 Studio 打开失败步骤，确认页面内容是否已变化。",
    };
  }
  const failedStepNumber = failedStep ? failedStep.stepIndex + 1 : undefined;
  return {
    cause: failedStepNumber ? `任务在第 ${failedStepNumber} 步没有完成` : "任务未能完成",
    suggestion: "回到 Studio 查看失败步骤，确认目标站点和必要参数后再试。",
  };
}

type WorkspaceBreadcrumbProps = {
  projectName?: string;
  taskName?: string;
  viewName: string;
};

export function WorkspaceBreadcrumb({
  projectName,
  taskName,
  viewName,
}: WorkspaceBreadcrumbProps): ReactNode {
  return (
    <nav className="workspace-breadcrumb" aria-label="当前位置">
      <span>{projectName ?? "未选择项目"}</span>
      <span aria-hidden="true">›</span>
      <span>{taskName ?? "未选择自动化任务"}</span>
      <span aria-hidden="true">›</span>
      <strong>{viewName}</strong>
    </nav>
  );
}

type EmptyWorkspaceGuideProps = {
  kind: "projects" | "tasks" | "executions";
  projectName?: string;
  taskName?: string;
};

export function EmptyWorkspaceGuide({ kind, projectName, taskName }: EmptyWorkspaceGuideProps) {
  const title =
    kind === "projects"
      ? "还没有可查看的项目"
      : kind === "tasks"
        ? `${projectName ? `项目「${projectName}」` : "当前项目"}还没有自动化任务`
        : `${taskName ? `任务「${taskName}」` : "当前任务"}还没有运行记录`;

  return (
    <section className="empty-workspace" aria-labelledby={`empty-${kind}-title`}>
      <span className="empty-workspace-icon" aria-hidden="true">
        ◎
      </span>
      <h2 id={`empty-${kind}-title`}>{title}</h2>
      <p>完成一次录制和运行后，最近结果会自动出现在这里。</p>
      <ol>
        <li>
          <strong>打开织流 Studio</strong>，选择或新建项目
        </li>
        <li>
          <strong>打开浏览器扩展开始录制</strong>，完成后保存到同一项目
        </li>
        <li>回到 Studio 运行任务，再到这里查看结果</li>
      </ol>
    </section>
  );
}

type ExecutionResultSummaryProps = {
  execution: ExecutionResult;
  taskName: string;
};

export function ExecutionResultSummary({ execution, taskName }: ExecutionResultSummaryProps) {
  const statusLabel = formatBusinessStatus(execution.status);
  const completedSteps = execution.steps.filter((step) => step.status === "passed").length;
  const duration = formatDuration(execution.startedAt, execution.finishedAt);
  const failure = execution.status === "failed" ? describeFailure(execution) : undefined;

  return (
    <section className={`result-summary result-${execution.status}`} aria-labelledby="result-title">
      <header className="result-summary-header">
        <div>
          <p className="result-eyebrow">最近一次运行</p>
          <h2 id="result-title">{taskName}</h2>
        </div>
        <span className={`status-pill status-${execution.status}`}>{statusLabel}</span>
      </header>
      <div className="result-facts" aria-label="运行摘要">
        <span>{formatExecutionTime(execution.finishedAt ?? execution.startedAt)}</span>
        <span>{execution.steps.length} 个步骤</span>
        <span>
          已完成 {completedSteps}/{execution.steps.length}
        </span>
        {duration ? <span>用时 {duration}</span> : null}
      </div>
      {failure ? (
        <div className="result-message result-message-failed">
          <strong>主要原因：{failure.cause}</strong>
          <p>
            <span className="result-advice-label">建议</span>
            {failure.suggestion}
          </p>
        </div>
      ) : execution.status === "cancelled" ? (
        <div className="result-message">
          <strong>任务已停止</strong>
          <p>已完成的步骤仍保留在本条运行记录中。</p>
        </div>
      ) : (
        <div className="result-message result-message-success">
          <strong>本次自动化任务已完成</strong>
          <p>全部步骤均按计划结束，可以继续处理下一项工作。</p>
        </div>
      )}
    </section>
  );
}
