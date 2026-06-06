import type { ReactNode } from "react";
import type { ExecutionStepLog } from "./shared/studio-api-types.js";

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
          <h3 style={{ marginBottom: 4 }}>诊断面板</h3>
          <p className="flow-content-meta">
            直接读取运行产物中的 `step-&lt;n&gt;-diagnostic.json` 与 `page-&lt;n&gt;.json`
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
            <details style={{ marginTop: 12 }}>
              <summary>目标提示</summary>
              <pre>{JSON.stringify(diagnostic.targetHints, null, 2)}</pre>
            </details>
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
