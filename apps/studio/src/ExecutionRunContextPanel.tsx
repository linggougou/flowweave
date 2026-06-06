import type { ReactNode } from "react";

import type {
  RunFlowVariableValue,
  StudioExecutionRunContext,
} from "./shared/studio-api-types.js";

type ExecutionRunContextPanelProps = {
  runContext?: StudioExecutionRunContext;
};

function formatVariableValue(value: RunFlowVariableValue): string {
  return typeof value === "boolean" ? (value ? "true" : "false") : String(value);
}

export function ExecutionRunContextPanel({
  runContext,
}: ExecutionRunContextPanelProps): ReactNode {
  if (!runContext) {
    return null;
  }

  const variableEntries = Object.entries(runContext.variables ?? {});

  return (
    <section className="flow-preview">
      <h3 style={{ marginBottom: 4 }}>本次运行上下文</h3>
      <p className="flow-content-meta">
        执行时实际注入到 Runtime 的环境、登录态与变量快照
      </p>

      <table className="fw-step-log-table" style={{ marginTop: 12 }}>
        <tbody>
          <tr>
            <th>环境名称</th>
            <td>{runContext.environmentName ?? "—"}</td>
          </tr>
          <tr>
            <th>Base URL</th>
            <td>{runContext.baseUrl ?? "—"}</td>
          </tr>
          <tr>
            <th>Storage State</th>
            <td>{runContext.storageStatePath ?? "—"}</td>
          </tr>
        </tbody>
      </table>

      <h4 style={{ margin: "16px 0 8px" }}>变量快照</h4>
      {variableEntries.length > 0 ? (
        <table className="fw-step-log-table">
          <thead>
            <tr>
              <th>变量名</th>
              <th>运行值</th>
            </tr>
          </thead>
          <tbody>
            {variableEntries.map(([name, value]) => (
              <tr key={name}>
                <td>{name}</td>
                <td>{formatVariableValue(value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="execution-history-empty">本次执行没有注入变量</p>
      )}
    </section>
  );
}
