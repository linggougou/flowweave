import { useCallback, useEffect, useState } from "react";
import { APP_DISPLAY_NAME } from "@flowweave/ui";
import { StepLogTable } from "@flowweave/ui";
import type {
  ExecutionStepLog,
  StudioExecution,
  StudioProject,
} from "./shared/studio-api-types.js";

function getStudioApi() {
  if (!window.flowweaveStudio) {
    throw new Error("未找到 flowweaveStudio API，请确认 preload 已加载");
  }
  return window.flowweaveStudio;
}

export function App() {
  const [projects, setProjects] = useState<StudioProject[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
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

  useEffect(() => {
    void refreshProjects().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "加载项目失败");
    });
  }, [refreshProjects]);

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
        <p>P1 工作台：项目列表与流程运行</p>
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
        <StepLogTable steps={steps} emptyMessage="选择项目并点击「运行流程」查看步骤日志" />
      </main>
    </div>
  );
}
