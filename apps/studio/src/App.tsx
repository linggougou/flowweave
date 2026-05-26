import { useCallback, useEffect, useState } from "react";
import type { FlowDocument } from "@flowweave/flow-dsl";
import {
  APP_DISPLAY_NAME,
  FlowVersionList,
  StepLogTable,
  type StepLogRow,
} from "@flowweave/ui";
import type {
  ExecutionStepLog,
  ExecutionSummary,
  StudioExecution,
  StudioFlowRef,
  StudioFlowVersion,
  StudioProject,
} from "./shared/studio-api-types.js";

const SHOW_BROWSER_STORAGE_KEY = "flowweave:studio-show-browser";

function readShowBrowserPreference(): boolean {
  try {
    const raw = localStorage.getItem(SHOW_BROWSER_STORAGE_KEY);
    if (raw === "0" || raw === "false") {
      return false;
    }
    return true;
  } catch {
    return true;
  }
}

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
  const [tab, setTab] = useState<"executions" | "versions">("executions");
  const [projects, setProjects] = useState<StudioProject[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [flows, setFlows] = useState<StudioFlowRef[]>([]);
  const [selectedFlowId, setSelectedFlowId] = useState<string | null>(null);
  const [versions, setVersions] = useState<StudioFlowVersion[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [previewVersion, setPreviewVersion] = useState<FlowDocument | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [executionHistory, setExecutionHistory] = useState<ExecutionSummary[]>([]);
  const [execution, setExecution] = useState<StudioExecution | null>(null);
  const [loading, setLoading] = useState(false);
  const [showBrowser, setShowBrowser] = useState(readShowBrowserPreference);
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

  const refreshFlows = useCallback(async (projectId: string) => {
    const api = getStudioApi();
    const list = await api.listFlows(projectId);
    setFlows(list);
    if (list.length === 0) {
      setSelectedFlowId(null);
      setVersions([]);
      return;
    }
    const fallback = list[0]?.id ?? null;
    const flowId = selectedFlowId && list.some((it) => it.id === selectedFlowId)
      ? selectedFlowId
      : fallback;
    setSelectedFlowId(flowId);
  }, [selectedFlowId]);

  const refreshVersions = useCallback(async (projectId: string, flowId: string) => {
    const api = getStudioApi();
    const list = await api.listFlowVersions(projectId, flowId);
    setVersions(list);
    setSelectedVersionId(null);
    setPreviewVersion(null);
  }, []);

  useEffect(() => {
    void refreshProjects().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "加载项目失败");
    });
  }, [refreshProjects]);

  useEffect(() => {
    if (!selectedProjectId) {
      setExecutionHistory([]);
      setFlows([]);
      setVersions([]);
      return;
    }
    void refreshExecutionHistory(selectedProjectId).catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "加载执行历史失败");
    });
    void refreshFlows(selectedProjectId).catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "加载 Flow 列表失败");
    });
  }, [selectedProjectId, refreshExecutionHistory, refreshFlows]);

  useEffect(() => {
    if (!selectedProjectId || !selectedFlowId) {
      setVersions([]);
      return;
    }
    void refreshVersions(selectedProjectId, selectedFlowId).catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "加载版本历史失败");
    });
  }, [selectedProjectId, selectedFlowId, refreshVersions]);

  const loadExecution = async (executionId: string) => {
    const api = getStudioApi();
    const detail = await api.getExecution(executionId);
    setExecution(detail);
  };

  const handleRun = async () => {
    if (!selectedProjectId || !selectedFlowId) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const api = getStudioApi();
      const result = await api.runFlow(selectedProjectId, selectedFlowId, {
        showBrowser,
      });
      const detail = await api.getExecution(result.executionId);
      setExecution(detail);
      await refreshExecutionHistory(selectedProjectId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "运行失败");
    } finally {
      setLoading(false);
    }
  };

  const steps: StepLogRow[] = (execution?.steps ?? []).map((step) => ({
    stepIndex: step.stepIndex,
    stepId: step.stepId,
    label: step.label,
    status: step.status,
    message: step.message,
    durationMs: step.durationMs,
    startedAt: step.startedAt,
    finishedAt: step.finishedAt,
    screenshotPath: step.screenshotPath,
  }));

  const openScreenshot = (filePath: string) => {
    void getStudioApi()
      .openPath(filePath)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "无法打开截图");
      });
  };

  const loadVersion = async (versionId: string) => {
    if (!selectedProjectId) return;
    setSelectedVersionId(versionId);
    const api = getStudioApi();
    const detail = await api.getFlowVersion(selectedProjectId, versionId);
    setPreviewVersion(detail);
  };

  const handleRestore = async (versionId: string) => {
    if (!selectedProjectId || !selectedFlowId) return;
    setRestoringId(versionId);
    setError(null);
    try {
      const api = getStudioApi();
      await api.restoreFlowVersion(selectedProjectId, versionId);
      await refreshVersions(selectedProjectId, selectedFlowId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "恢复版本失败");
    } finally {
      setRestoringId(null);
    }
  };

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
                <span className="project-item-name">{project.name}</span>
                {project.baseUrl ? (
                  <span className="project-item-env" title={project.baseUrl}>
                    {project.baseUrl.length > 36
                      ? `…${project.baseUrl.slice(-32)}`
                      : project.baseUrl}
                  </span>
                ) : null}
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
        {selectedProjectId ? (
          <section className="execution-history">
            <h2>Flow 列表</h2>
            {flows.length === 0 ? (
              <p className="execution-history-empty">暂无 Flow</p>
            ) : (
              <ul className="execution-history-list">
                {flows.map((flow) => (
                  <li key={flow.id}>
                    <button
                      type="button"
                      className={
                        selectedFlowId === flow.id
                          ? "execution-history-item active"
                          : "execution-history-item"
                      }
                      onClick={() => setSelectedFlowId(flow.id)}
                    >
                      <span className="execution-history-id">{flow.name}</span>
                      <span className="execution-history-meta">{flow.id}</span>
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
            className={tab === "executions" ? "tab-btn active" : "tab-btn"}
            onClick={() => setTab("executions")}
          >
            执行日志
          </button>
          <button
            type="button"
            className={tab === "versions" ? "tab-btn active" : "tab-btn"}
            onClick={() => setTab("versions")}
          >
            Flow 版本
          </button>
          <label className="run-option" title="开启后会弹出 Chromium 窗口，便于确认是否在执行">
            <input
              type="checkbox"
              checked={showBrowser}
              disabled={loading}
              onChange={(e) => {
                const next = e.target.checked;
                setShowBrowser(next);
                try {
                  localStorage.setItem(SHOW_BROWSER_STORAGE_KEY, next ? "1" : "0");
                } catch {
                  // ignore
                }
              }}
            />
            显示浏览器窗口
          </label>
          <button
            type="button"
            disabled={!selectedProjectId || !selectedFlowId || loading}
            title={!selectedFlowId ? "请先在侧栏选择一个 Flow" : undefined}
            onClick={() => void handleRun()}
          >
            {loading ? "运行中…" : "运行流程"}
          </button>
          {!selectedFlowId && selectedProjectId ? (
            <span className="status">请先在侧栏选择一个 Flow</span>
          ) : null}
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
        {tab === "executions" ? (
          <StepLogTable
            steps={steps}
            emptyMessage="选择项目并点击「运行流程」查看步骤日志"
            onOpenScreenshot={openScreenshot}
          />
        ) : (
          <section className="flow-version-panel">
            {selectedFlowId ? (
              <>
                <FlowVersionList
                  versions={versions.map((v) => ({
                    id: v.id,
                    version: v.version,
                    name: v.name,
                    stepCount: v.stepCount,
                    createdAt: v.createdAt,
                    changeMessage: v.changeMessage,
                  }))}
                  selectedVersionId={selectedVersionId}
                  restoringId={restoringId}
                  onSelect={(id) => void loadVersion(id)}
                  onRestore={(id) => void handleRestore(id)}
                  emptyMessage="暂无历史版本，修改并保存 Flow 后会自动生成"
                />
                {previewVersion ? (
                  <details className="flow-preview" open>
                    <summary>
                      版本预览 · {previewVersion.name}（{previewVersion.steps.length} 步）
                    </summary>
                    <pre>{JSON.stringify(previewVersion, null, 2)}</pre>
                  </details>
                ) : null}
              </>
            ) : (
              <p className="execution-history-empty">当前项目暂无 Flow</p>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
