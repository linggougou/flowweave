import { useCallback, useEffect, useState } from "react";
import { APP_DISPLAY_NAME } from "@flowweave/ui";
import { StepLogTable } from "@flowweave/ui";
import type {
  ExecutionStepLog,
  ExecutionSummary,
  StudioExecution,
  StudioProject,
} from "./shared/studio-api-types.js";

function getStudioApi() {
  if (!window.flowweaveStudio) {
    throw new Error("未找到 flowweaveStudio API，请确认 preload 已加载");
  }
  return window.flowweaveStudio;
}

function formatExecutionTime(iso?: string): string {
  if (!iso) {
    return "—";
  }
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

export function App() {
  const [projects, setProjects] = useState<StudioProject[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [executionHistory, setExecutionHistory] = useState<ExecutionSummary[]>([]);
  const [execution, setExecution] = useState<StudioExecution | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshProjects = useCallback(async () => {
    const api = getStudioApi();
    const list = await api.listProjects();
    setProjects(list);
    if (list.length > 0 && !selectedProjectId) {
      setSelectedProjectId(list[0]?.id ?? null);
    }
  }, [selectedProjectId]);

  const refreshExecutionHistory = useCallback(async (projectId: string) => {
    const api = getStudioApi();
    const history = await api.listExecutions(projectId);
    setExecutionHistory(history);
  }, []);

  useEffect(() => {
    void refreshProjects().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "加载项目失败");
    });
  }, [refreshProjects]);

  useEffect(() => {
    if (!selectedProjectId) {
      setExecutionHistory([]);
      return;
    }
    void refreshExecutionHistory(selectedProjectId).catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "加载执行历史失败");
    });
  }, [selectedProjectId, refreshExecutionHistory]);

  const loadExecution = async (executionId: string) => {
    const api = getStudioApi();
    const detail = await api.getExecution(executionId);
    setExecution(detail);
  };

  const handleRun = async () => {
    if (!selectedProjectId) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const api = getStudioApi();
      const result = await api.runFlow(selectedProjectId);
      const detail = await api.getExecution(result.executionId);
      setExecution(detail);
      await refreshExecutionHistory(selectedProjectId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "运行失败");
    } finally {
      setLoading(false);
    }
  };

  const steps: ExecutionStepLog[] = execution?.steps ?? [];

  return (
    <div className="app">
      <aside className="sidebar">
        <h1>{APP_DISPLAY_NAME} Studio</h1>
        <p>P2 工作台：执行历史与流程运行</p>
        <ul className="project-list">
          {projects.map((project) => (
            <li key={project.id}>
              <button
                type="button"
                className={
                  project.id === selectedProjectId
                    ? "project-item active"
                    : "project-item"
                }
                onClick={() => setSelectedProjectId(project.id)}
              >
                {project.name}
              </button>
            </li>
          ))}
        </ul>
        {selectedProjectId ? (
          <section className="execution-history">
            <h2>最近执行</h2>
            {executionHistory.length === 0 ? (
              <p className="execution-history-empty">暂无执行记录</p>
            ) : (
              <ul className="execution-history-list">
                {executionHistory.map((item) => (
                  <li key={item.executionId}>
                    <button
                      type="button"
                      className={
                        execution?.executionId === item.executionId
                          ? "execution-history-item active"
                          : "execution-history-item"
                      }
                      onClick={() => void loadExecution(item.executionId)}
                    >
                      <span className="execution-history-id">
                        {item.executionId.slice(0, 8)}…
                      </span>
                      <span className="execution-history-meta">
                        {item.status} · {formatExecutionTime(item.startedAt)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}
      </aside>
      <main className="main">
        <div className="toolbar">
          <button
            type="button"
            disabled={!selectedProjectId || loading}
            onClick={() => void handleRun()}
          >
            {loading ? "运行中…" : "运行流程"}
          </button>
          <span className="status">
            {execution
              ? `执行 ${execution.executionId.slice(0, 8)}… · ${execution.status}`
              : "尚未运行"}
          </span>
        </div>
        {error ? <p className="error">{error}</p> : null}
        {execution?.fragilityWarnings && execution.fragilityWarnings.length > 0 ? (
          <ul className="fragility-warnings">
            {execution.fragilityWarnings.map((w) => (
              <li key={w.stepId}>
                <strong>{w.stepId}</strong>：{w.message}
              </li>
            ))}
          </ul>
        ) : null}
        <StepLogTable steps={steps} emptyMessage="选择项目并点击「运行流程」查看步骤日志" />
      </main>
    </div>
  );
}
