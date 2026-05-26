import { useCallback, useEffect, useState } from "react";
import type { FlowDocument } from "@flowweave/flow-dsl";
import type { ExecutionResult, FlowVersionRecord } from "@flowweave/project-knowledge";
import {
  APP_DISPLAY_NAME,
  FlowVersionList,
  StepLogTable,
  type StepLogRow,
} from "@flowweave/ui";

import * as api from "./api.js";
import type { WebProject } from "./api.js";

type MainTab = "executions" | "versions";

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
  const [projects, setProjects] = useState<WebProject[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [flows, setFlows] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedFlowId, setSelectedFlowId] = useState<string | null>(null);
  const [mainTab, setMainTab] = useState<MainTab>("versions");
  const [executions, setExecutions] = useState<ExecutionResult[]>([]);
  const [selectedExecutionId, setSelectedExecutionId] = useState<string | null>(null);
  const [executionDetail, setExecutionDetail] = useState<ExecutionResult | null>(null);
  const [versions, setVersions] = useState<FlowVersionRecord[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [previewFlow, setPreviewFlow] = useState<FlowDocument | null>(null);
  const [currentFlow, setCurrentFlow] = useState<FlowDocument | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshProjects = useCallback(async () => {
    const list = await api.listProjects();
    setProjects(list);
    if (list.length > 0 && !selectedProjectId) {
      setSelectedProjectId(list[0]?.id ?? null);
    }
  }, [selectedProjectId]);

  const refreshFlows = useCallback(async (projectId: string) => {
    const list = await api.listFlows(projectId);
    setFlows(list);
    if (list.length > 0 && !selectedFlowId) {
      setSelectedFlowId(list[0]?.id ?? null);
    } else if (!list.some((f) => f.id === selectedFlowId)) {
      setSelectedFlowId(list[0]?.id ?? null);
    }
  }, [selectedFlowId]);

  const refreshVersions = useCallback(async (projectId: string, flowId: string) => {
    const list = await api.listFlowVersions(projectId, flowId);
    setVersions(list);
    setSelectedVersionId(null);
    setPreviewFlow(null);
    const flow = await api.getFlow(projectId, flowId);
    setCurrentFlow(flow);
  }, []);

  useEffect(() => {
    void refreshProjects().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "加载项目失败");
    });
  }, [refreshProjects]);

  useEffect(() => {
    if (!selectedProjectId) {
      setFlows([]);
      setExecutions([]);
      return;
    }
    void refreshFlows(selectedProjectId).catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "加载 Flow 失败");
    });
    void api.listExecutions(selectedProjectId).then(setExecutions).catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "加载执行历史失败");
    });
  }, [selectedProjectId, refreshFlows]);

  useEffect(() => {
    if (!selectedProjectId || !selectedFlowId) {
      setVersions([]);
      setCurrentFlow(null);
      return;
    }
    void refreshVersions(selectedProjectId, selectedFlowId).catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "加载版本失败");
    });
  }, [selectedProjectId, selectedFlowId, refreshVersions]);

  useEffect(() => {
    if (!selectedExecutionId) {
      setExecutionDetail(null);
      return;
    }
    void api.getExecution(selectedExecutionId).then(setExecutionDetail).catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "加载执行详情失败");
    });
  }, [selectedExecutionId]);

  const loadVersionPreview = async (versionId: string) => {
    if (!selectedProjectId) {
      return;
    }
    setSelectedVersionId(versionId);
    const doc = await api.getFlowVersion(selectedProjectId, versionId);
    setPreviewFlow(doc);
  };

  const handleRestore = async (versionId: string) => {
    if (!selectedProjectId || !selectedFlowId) {
      return;
    }
    setRestoringId(versionId);
    setError(null);
    try {
      await api.restoreFlowVersion(selectedProjectId, versionId);
      await refreshVersions(selectedProjectId, selectedFlowId);
      setPreviewFlow(null);
      setSelectedVersionId(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "恢复失败");
    } finally {
      setRestoringId(null);
    }
  };

  const steps: StepLogRow[] = (executionDetail?.steps ?? []).map((step) => ({
    stepIndex: step.stepIndex,
    stepId: step.stepId,
    label: step.stepId,
    status: step.status,
    message: step.errorMessage,
    startedAt: executionDetail?.startedAt ?? "—",
    finishedAt: executionDetail?.finishedAt,
    screenshotPath: step.screenshotPath,
  }));

  return (
    <div className="app">
      <aside className="sidebar">
        <h1>{APP_DISPLAY_NAME} 控制台</h1>
        <p>Web 工作台：项目、Flow 版本与执行历史</p>
        <h2 className="sidebar-section-title">项目</h2>
        <ul className="project-list">
          {projects.map((project) => (
            <li key={project.id}>
              <button
                type="button"
                className={
                  project.id === selectedProjectId ? "project-item active" : "project-item"
                }
                onClick={() => {
                  setSelectedProjectId(project.id);
                  setSelectedFlowId(null);
                }}
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
          <>
            <h2 className="sidebar-section-title">Flow</h2>
            {flows.length === 0 ? (
              <p className="sidebar-empty">暂无 Flow，请先在 Studio 或 e2e 写入</p>
            ) : (
              <ul className="flow-list">
                {flows.map((flow) => (
                  <li key={flow.id}>
                    <button
                      type="button"
                      className={
                        flow.id === selectedFlowId ? "flow-item active" : "flow-item"
                      }
                      onClick={() => setSelectedFlowId(flow.id)}
                    >
                      <span className="flow-item-name">{flow.name}</span>
                      <span className="flow-item-id">{flow.id}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : null}
      </aside>
      <main className="main">
        <div className="main-tabs">
          <button
            type="button"
            className={mainTab === "versions" ? "main-tab active" : "main-tab"}
            onClick={() => setMainTab("versions")}
          >
            Flow 版本
          </button>
          <button
            type="button"
            className={mainTab === "executions" ? "main-tab active" : "main-tab"}
            onClick={() => setMainTab("executions")}
          >
            执行历史
          </button>
        </div>
        {error ? <p className="error">{error}</p> : null}
        {mainTab === "versions" ? (
          <section className="panel">
            {!selectedFlowId || !currentFlow ? (
              <p className="panel-empty">选择项目与 Flow 查看版本历史</p>
            ) : (
              <>
                <header className="panel-header">
                  <h2>{currentFlow.name}</h2>
                  <p className="panel-meta">
                    当前 {currentFlow.steps.length} 步 · ID {currentFlow.id}
                  </p>
                </header>
                <FlowVersionList
                  versions={versions}
                  selectedVersionId={selectedVersionId}
                  onSelect={(id) => void loadVersionPreview(id)}
                  onRestore={(id) => void handleRestore(id)}
                  restoringId={restoringId}
                  emptyMessage="尚无历史版本；再次保存 Flow 后将自动快照"
                />
                {previewFlow ? (
                  <details className="flow-preview" open>
                    <summary>
                      预览 v{versions.find((v) => v.id === selectedVersionId)?.version ?? "?"} ·{" "}
                      {previewFlow.steps.length} 步
                    </summary>
                    <pre>{JSON.stringify(previewFlow, null, 2)}</pre>
                  </details>
                ) : null}
              </>
            )}
          </section>
        ) : (
          <section className="panel executions-panel">
            <div className="executions-layout">
              <ul className="execution-history-list">
                {executions.length === 0 ? (
                  <li className="sidebar-empty">暂无执行记录</li>
                ) : (
                  executions.map((item) => (
                    <li key={item.executionId}>
                      <button
                        type="button"
                        className={
                          item.executionId === selectedExecutionId
                            ? "execution-history-item active"
                            : "execution-history-item"
                        }
                        onClick={() => setSelectedExecutionId(item.executionId)}
                      >
                        <span className="execution-history-id">
                          {item.executionId.slice(0, 8)}…
                        </span>
                        <span className="execution-history-meta">
                          {item.status} · {formatExecutionTime(item.startedAt)}
                        </span>
                      </button>
                    </li>
                  ))
                )}
              </ul>
              <StepLogTable steps={steps} emptyMessage="选择一条执行记录查看步骤" />
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
