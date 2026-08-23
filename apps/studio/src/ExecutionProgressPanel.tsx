import type { ExecutionProgressState } from "./shared/execution-progress.js";

type ExecutionProgressPanelProps = {
  progress: ExecutionProgressState;
  elapsedSeconds: number;
  canCancel: boolean;
  cancelling: boolean;
  onCancel: () => void;
};

function formatProgressStatus(status: ExecutionProgressState["status"]): string {
  switch (status) {
    case "completed":
      return "运行完成";
    case "failed":
      return "运行失败";
    case "cancelled":
      return "已取消运行";
    case "running":
      return "正在运行";
    default:
      return "正在准备";
  }
}

export function ExecutionProgressPanel({
  progress,
  elapsedSeconds,
  canCancel,
  cancelling,
  onCancel,
}: ExecutionProgressPanelProps) {
  const boundedCompleted = Math.min(progress.completedSteps, progress.totalSteps);
  const progressMax = Math.max(progress.totalSteps, 1);
  const currentStep =
    progress.currentStepIndex === undefined || progress.totalSteps === 0
      ? null
      : Math.min(progress.currentStepIndex + 1, progress.totalSteps);

  return (
    <section className={`execution-progress execution-progress-${progress.status}`} aria-live="polite">
      <div className="execution-progress-heading">
        <div>
          <strong>{formatProgressStatus(progress.status)}</strong>
          <span>
            {currentStep !== null
              ? `当前第 ${currentStep}/${progress.totalSteps} 步 · 已完成 ${boundedCompleted} 步`
              : progress.totalSteps > 0
                ? `已完成 ${boundedCompleted}/${progress.totalSteps} 步`
              : "正在获取步骤信息"}
            {` · 已用时 ${elapsedSeconds} 秒`}
          </span>
        </div>
        {canCancel ? (
          <button
            type="button"
            className="cancel-run-btn"
            data-action="cancel-run"
            disabled={cancelling}
            onClick={onCancel}
          >
            {cancelling ? "正在取消…" : "取消运行"}
          </button>
        ) : null}
      </div>
      <div
        className="execution-progress-track"
        role="progressbar"
        aria-label="任务运行进度"
        aria-valuemin={0}
        aria-valuemax={progressMax}
        aria-valuenow={boundedCompleted}
      >
        <span style={{ width: `${(boundedCompleted / progressMax) * 100}%` }} />
      </div>
      <p>{progress.currentAction}</p>
    </section>
  );
}
