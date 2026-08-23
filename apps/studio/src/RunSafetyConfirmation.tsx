import type { RunConfirmationSummary } from "./shared/run-safety.js";

type RunSafetyConfirmationProps = {
  summary: RunConfirmationSummary;
  riskAcknowledged: boolean;
  disabled: boolean;
  onRiskAcknowledgedChange: (checked: boolean) => void;
  onConfirm: () => void;
  onCancel: () => void;
};

export function RunSafetyConfirmation({
  summary,
  riskAcknowledged,
  disabled,
  onRiskAcknowledgedChange,
  onConfirm,
  onCancel,
}: RunSafetyConfirmationProps) {
  const target = summary.domains.length > 0 ? summary.domains.join("、") : "任务中记录的网页";
  const confirmDisabled = disabled || (summary.requiresConfirmation && !riskAcknowledged);

  return (
    <div className="run-confirmation-backdrop">
      <section
        className="run-confirmation"
        role="dialog"
        aria-modal="true"
        aria-labelledby="run-confirmation-title"
      >
        <p className="business-eyebrow">运行前确认</p>
        <h3 id="run-confirmation-title">确认运行「{summary.taskName}」</h3>
        <dl className="run-confirmation-facts">
          <div>
            <dt>目标站点</dt>
            <dd>{target}</dd>
          </div>
          <div>
            <dt>运行环境</dt>
            <dd>{summary.environmentName}</dd>
          </div>
          <div>
            <dt>操作范围</dt>
            <dd>{summary.stepCount} 个步骤</dd>
          </div>
        </dl>

        {summary.highRiskActions.length > 0 ? (
          <div className="run-risk-warning" role="alert">
            <strong>该任务包含高风险操作</strong>
            <ul>
              {summary.highRiskActions.map((action) => (
                <li key={action.kind}>
                  {action.label}（第 {action.stepIndexes.map((index) => index + 1).join("、")} 步）
                </li>
              ))}
            </ul>
            <label>
              <input
                type="checkbox"
                checked={riskAcknowledged}
                disabled={disabled}
                onChange={(event) => onRiskAcknowledgedChange(event.target.checked)}
              />
              我已核对目标站点和高风险操作
            </label>
          </div>
        ) : (
          <p className="run-confirmation-note">请核对目标站点和运行环境后继续。</p>
        )}

        <div className="run-confirmation-actions">
          <button type="button" className="secondary-btn" disabled={disabled} onClick={onCancel}>
            返回检查
          </button>
          <button
            type="button"
            className="run-primary-btn"
            data-action="confirm-run"
            disabled={confirmDisabled}
            onClick={onConfirm}
          >
            确认运行
          </button>
        </div>
      </section>
    </div>
  );
}
