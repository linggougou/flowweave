import type { ReactNode } from "react";

import type { StudioExecutionCompatibilityWarning } from "./shared/studio-api-types.js";

export type ExecutionCompatibilityNoticeProps = {
  warnings: StudioExecutionCompatibilityWarning[];
};

export function ExecutionCompatibilityNotice({
  warnings,
}: ExecutionCompatibilityNoticeProps): ReactNode {
  if (warnings.length === 0) {
    return null;
  }

  return (
    <aside className="execution-compatibility-notice" role="status">
      <div className="execution-compatibility-head">
        <span className="execution-compatibility-badge">旧记录</span>
        <span className="execution-compatibility-title">历史执行兼容提示</span>
      </div>
      <ul className="execution-compatibility-list">
        {warnings.map((warning) => (
          <li key={warning.code}>
            <span className="execution-compatibility-message">{warning.message}</span>
          </li>
        ))}
      </ul>
    </aside>
  );
}
