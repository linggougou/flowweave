import type { ReactNode } from "react";
import type { ExecutionStepLog } from "./shared/studio-api-types.js";
import { buildDiagnosticRepairSuggestions } from "./shared/repair-suggestions.js";

type DiagnosticInspectorProps = {
  steps: ExecutionStepLog[];
  selectedStepIndex: number | null;
  onSelectStepIndex: (stepIndex: number) => void;
  onOpenPath: (filePath: string) => void;
};

function formatCount(value?: number): string {
  return value === undefined ? "—" : String(value);
}

function formatStatus(status: ExecutionStepLog["status"]): string {
  switch (status) {
    case "failed":
      return "失败";
    case "passed":
      return "通过";
    case "running":
      return "执行中";
    case "pending":
      return "待执行";
    case "skipped":
      return "跳过";
  }
}

function countStrategyAttempts(
  step: ExecutionStepLog,
): {
  successCount: number;
  failureCount: number;
  visibleCandidateCount: number;
} {
  const attempts = step.diagnostic?.strategyAttempts ?? [];
  return {
    successCount: attempts.filter((attempt) => attempt.success).length,
    failureCount: attempts.filter((attempt) => !attempt.success).length,
    visibleCandidateCount: attempts.reduce(
      (total, attempt) => total + (attempt.visibleCount ?? 0),
      0,
    ),
  };
}

function resolvePrimaryDiagnosticHint(step: ExecutionStepLog): string {
  const failedAttempt = step.diagnostic?.strategyAttempts.find(
    (attempt) => !attempt.success && attempt.error,
  );
  if (failedAttempt) {
    return `${failedAttempt.label}：${failedAttempt.error}`;
  }
  if (step.message) {
    return step.message;
  }
  return "当前步骤未提供额外失败信息，建议先打开 diagnostic JSON 查看完整原始产物。";
}

export function DiagnosticInspector({
  steps,
  selectedStepIndex,
  onSelectStepIndex,
  onOpenPath,
}: DiagnosticInspectorProps): ReactNode {
  const diagnosticSteps = steps.filter(
    (step) => step.diagnosticPath || step.pageSnapshotPath || step.pageSnapshot,
  );

  if (diagnosticSteps.length === 0) {
    return null;
  }

  const activeStep =
    diagnosticSteps.find((step) => step.stepIndex === selectedStepIndex) ??
    diagnosticSteps.find((step) => step.diagnosticPath) ??
    diagnosticSteps[0]!;
  const diagnostic = activeStep.diagnostic;
  const summary = countStrategyAttempts(activeStep);
  const repairSuggestions = buildDiagnosticRepairSuggestions(activeStep);

  return (
    <section className="flow-preview">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "flex-start",
        }}
        >
        <div>
          <h3 style={{ marginBottom: 4 }}>诊断工作台</h3>
          <p className="flow-content-meta">
            聚焦命中策略、失败原因与页面快照，帮助快速定位回放异常
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {diagnosticSteps.map((step) => (
            <button
              key={`${step.stepId}-${step.stepIndex}`}
              type="button"
              className={step.stepIndex === activeStep.stepIndex ? "tab-btn active" : "tab-btn"}
              onClick={() => onSelectStepIndex(step.stepIndex)}
            >
              步骤 {step.stepIndex + 1}
            </button>
          ))}
        </div>
      </div>

      <p className="execution-history-meta" style={{ marginTop: 12 }}>
        {activeStep.label} · {formatStatus(activeStep.status)} · ID <code>{activeStep.stepId}</code>
      </p>

      {activeStep.message ? (
        <p className="error" role="alert">
          {activeStep.message}
        </p>
      ) : null}

      <div
        style={{
          display: "grid",
          gap: 12,
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          marginBottom: 16,
        }}
      >
        <div className="flow-preview" style={{ margin: 0 }}>
          <strong>成功策略</strong>
          <div>{summary.successCount}</div>
        </div>
        <div className="flow-preview" style={{ margin: 0 }}>
          <strong>失败策略</strong>
          <div>{summary.failureCount}</div>
        </div>
        <div className="flow-preview" style={{ margin: 0 }}>
          <strong>可见候选</strong>
          <div>{summary.visibleCandidateCount}</div>
        </div>
      </div>

      <div className="flow-preview" style={{ margin: "0 0 16px" }}>
        <strong>优先排查</strong>
        <p className="flow-content-meta" style={{ marginTop: 8 }}>
          {resolvePrimaryDiagnosticHint(activeStep)}
        </p>
      </div>

      {repairSuggestions.length > 0 ? (
        <div className="flow-preview" style={{ margin: "0 0 16px" }}>
          <strong>修复建议</strong>
          <ul style={{ margin: "12px 0 0", paddingLeft: 20, display: "grid", gap: 12 }}>
            {repairSuggestions.map((suggestion) => (
              <li key={suggestion.id}>
                <strong>{suggestion.title}</strong>
                <p className="flow-content-meta" style={{ margin: "4px 0 0" }}>
                  下一步：{suggestion.action}
                </p>
                <p className="flow-content-meta" style={{ margin: "4px 0 0" }}>
                  依据：{suggestion.reason}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        {activeStep.diagnosticPath ? (
          <button type="button" onClick={() => onOpenPath(activeStep.diagnosticPath!)}>
            打开 diagnostic JSON
          </button>
        ) : null}
        {activeStep.pageSnapshotPath ? (
          <button type="button" onClick={() => onOpenPath(activeStep.pageSnapshotPath!)}>
            打开 page JSON
          </button>
        ) : null}
        {activeStep.screenshotPath ? (
          <button type="button" onClick={() => onOpenPath(activeStep.screenshotPath!)}>
            打开截图
          </button>
        ) : null}
      </div>

      {diagnostic ? (
        <>
          <table className="fw-step-log-table">
            <tbody>
              <tr>
                <th>URL</th>
                <td>{diagnostic.url}</td>
              </tr>
              <tr>
                <th>标题</th>
                <td>{diagnostic.title || "—"}</td>
              </tr>
              <tr>
                <th>策略尝试数</th>
                <td>{diagnostic.strategyAttempts.length}</td>
              </tr>
            </tbody>
          </table>

          <h4 style={{ margin: "16px 0 8px" }}>定位策略尝试</h4>
          <table className="fw-step-log-table">
            <thead>
              <tr>
                <th>策略</th>
                <th>匹配数</th>
                <th>可见数</th>
                <th>结果</th>
                <th>错误</th>
              </tr>
            </thead>
            <tbody>
              {diagnostic.strategyAttempts.map((attempt, index) => (
                <tr key={`${attempt.label}-${index}`}>
                  <td>{attempt.label}</td>
                  <td>{attempt.matchedCount}</td>
                  <td>{formatCount(attempt.visibleCount)}</td>
                  <td>{attempt.success ? "成功" : "失败"}</td>
                  <td>{attempt.error ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {diagnostic.targetHints ? (
            <>
              <h4 style={{ margin: "16px 0 8px" }}>目标提示</h4>
              <table className="fw-step-log-table">
                <tbody>
                  <tr>
                    <th>标签</th>
                    <td>{diagnostic.targetHints.tagName ?? "—"}</td>
                  </tr>
                  <tr>
                    <th>输入类型</th>
                    <td>{diagnostic.targetHints.inputType ?? "—"}</td>
                  </tr>
                  <tr>
                    <th>name 属性</th>
                    <td>{diagnostic.targetHints.nameAttr ?? "—"}</td>
                  </tr>
                  <tr>
                    <th>占位提示</th>
                    <td>{diagnostic.targetHints.placeholder ?? "—"}</td>
                  </tr>
                  <tr>
                    <th>关联文案</th>
                    <td>{diagnostic.targetHints.labelText ?? "—"}</td>
                  </tr>
                  <tr>
                    <th>文本样本</th>
                    <td>{diagnostic.targetHints.textSample ?? "—"}</td>
                  </tr>
                </tbody>
              </table>
            </>
          ) : null}
        </>
      ) : activeStep.diagnosticPath ? (
        <p className="execution-history-empty">
          已检测到诊断文件路径，但当前无法解析内容。可以直接打开 JSON 继续排查。
        </p>
      ) : null}

      {activeStep.pageSnapshot ? (
        <details style={{ marginTop: 12 }} open>
          <summary>页面摘要</summary>
          <table className="fw-step-log-table" style={{ marginTop: 12 }}>
            <tbody>
              <tr>
                <th>页面 URL</th>
                <td>{activeStep.pageSnapshot.url}</td>
              </tr>
              <tr>
                <th>页面标题</th>
                <td>{activeStep.pageSnapshot.title || "—"}</td>
              </tr>
              <tr>
                <th>表单数</th>
                <td>{activeStep.pageSnapshot.formCount}</td>
              </tr>
              <tr>
                <th>按钮数</th>
                <td>{activeStep.pageSnapshot.buttonCount}</td>
              </tr>
              <tr>
                <th>链接数</th>
                <td>{activeStep.pageSnapshot.linkCount}</td>
              </tr>
              <tr>
                <th>采集时间</th>
                <td>{activeStep.pageSnapshot.capturedAt}</td>
              </tr>
            </tbody>
          </table>
        </details>
      ) : null}
    </section>
  );
}
