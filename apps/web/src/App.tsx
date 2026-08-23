import { useCallback, useEffect, useMemo, useState } from "react";
import type { FlowDocument } from "@flowweave/flow-dsl";
import type { ExecutionResult, FlowVersionRecord } from "@flowweave/project-knowledge";
import { APP_DISPLAY_NAME, FlowVersionList } from "@flowweave/ui";

import * as api from "./api.js";
import type { WebProject } from "./api.js";
import { EmptyWorkspaceGuide, WorkspaceBreadcrumb } from "./business-view.js";
import { ExecutionRecordsView } from "./ExecutionRecordsView.js";
import { ViewSwitcher } from "./ViewSwitcher.js";
import { createExecutionDetailLoader } from "./execution-detail-loader.js";

type MainTab = "executions" | "versions";

export function App() {
  const [projects, setProjects] = useState<WebProject[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [flows, setFlows] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedFlowId, setSelectedFlowId] = useState<string | null>(null);
  const [mainTab, setMainTab] = useState<MainTab>("executions");
  const [executions, setExecutions] = useState<ExecutionResult[]>([]);
  const [selectedExecutionId, setSelectedExecutionId] = useState<string | null>(null);
  const [executionDetail, setExecutionDetail] = useState<ExecutionResult | null>(null);
  const [executionDetailLoading, setExecutionDetailLoading] = useState(false);
  const [versions, setVersions] = useState<FlowVersionRecord[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [previewFlow, setPreviewFlow] = useState<FlowDocument | null>(null);
  const [currentFlow, setCurrentFlow] = useState<FlowDocument | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedProject = projects.find((project) => project.id === selectedProjectId);
  const selectedFlow = flows.find((flow) => flow.id === selectedFlowId);
  const taskExecutions = useMemo(
    () => executions.filter((execution) => execution.flowId === selectedFlowId),
    [executions, selectedFlowId],
  );
  const executionDetailLoader = useMemo(() => createExecutionDetailLoader(api.getExecution), []);

  const refreshProjects = useCallback(async () => {
    const list = await api.listProjects();
    setProjects(list);
    if (list.length > 0 && !selectedProjectId) setSelectedProjectId(list[0]?.id ?? null);
  }, [selectedProjectId]);

  const refreshFlows = useCallback(async (projectId: string) => {
    const list = await api.listFlows(projectId);
    setFlows(list);
    setSelectedFlowId((current) =>
      current && list.some((item) => item.id === current) ? current : (list[0]?.id ?? null),
    );
  }, []);

  const refreshVersions = useCallback(async (projectId: string, flowId: string) => {
    const [list, flow] = await Promise.all([
      api.listFlowVersions(projectId, flowId),
      api.getFlow(projectId, flowId),
    ]);
    setVersions(list);
    setSelectedVersionId(null);
    setPreviewFlow(null);
    setCurrentFlow(flow);
  }, []);

  useEffect(() => {
    void refreshProjects().catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : "加载项目失败");
    });
  }, [refreshProjects]);

  useEffect(() => {
    if (!selectedProjectId) {
      setFlows([]);
      setExecutions([]);
      return;
    }
    setError(null);
    void refreshFlows(selectedProjectId).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : "加载自动化任务失败");
    });
    void api
      .listExecutions(selectedProjectId)
      .then(setExecutions)
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : "加载运行记录失败");
      });
  }, [selectedProjectId, refreshFlows]);

  useEffect(() => {
    if (!selectedProjectId || !selectedFlowId) {
      setVersions([]);
      setCurrentFlow(null);
      return;
    }
    void refreshVersions(selectedProjectId, selectedFlowId).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : "加载版本记录失败");
    });
  }, [selectedProjectId, selectedFlowId, refreshVersions]);

  useEffect(() => {
    const nextExecutionId = taskExecutions.some(
      (execution) => execution.executionId === selectedExecutionId,
    )
      ? selectedExecutionId
      : (taskExecutions[0]?.executionId ?? null);
    setSelectedExecutionId(nextExecutionId);
  }, [selectedExecutionId, taskExecutions]);

  useEffect(() => {
    if (!selectedExecutionId) {
      setExecutionDetail(null);
      setExecutionDetailLoading(false);
      return;
    }
    setExecutionDetail(null);
    setExecutionDetailLoading(true);
    setError(null);
    return executionDetailLoader.load(selectedExecutionId, {
      onSuccess: (_executionId, detail) => {
        setExecutionDetail(detail);
        setExecutionDetailLoading(false);
      },
      onError: (_executionId, reason) => {
        setExecutionDetail(null);
        setExecutionDetailLoading(false);
        setError(reason instanceof Error ? reason.message : "加载运行详情失败");
      },
    });
  }, [executionDetailLoader, selectedExecutionId]);

  const loadVersionPreview = async (versionId: string) => {
    if (!selectedProjectId) return;
    setSelectedVersionId(versionId);
    setPreviewFlow(await api.getFlowVersion(selectedProjectId, versionId));
  };

  const handleRestore = async (versionId: string) => {
    if (!selectedProjectId || !selectedFlowId) return;
    setRestoringId(versionId);
    setError(null);
    try {
      await api.restoreFlowVersion(selectedProjectId, versionId);
      await refreshVersions(selectedProjectId, selectedFlowId);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "恢复失败");
    } finally {
      setRestoringId(null);
    }
  };

  const viewName = mainTab === "executions" ? "最近运行结果" : "版本记录";

  return (
    <div className="app">
      <aside className="sidebar">
        <header className="sidebar-brand">
          <h1>{APP_DISPLAY_NAME}</h1>
          <p>自动化任务结果中心</p>
        </header>

        <h2 className="sidebar-section-title">项目</h2>
        <ul className="project-list">
          {projects.map((project) => (
            <li key={project.id}>
              <button
                type="button"
                className={
                  project.id === selectedProjectId ? "project-item active" : "project-item"
                }
                aria-current={project.id === selectedProjectId ? "true" : undefined}
                onClick={() => {
                  setSelectedProjectId(project.id);
                  setSelectedFlowId(null);
                  setSelectedExecutionId(null);
                  setMainTab("executions");
                }}
              >
                <span className="project-item-name">{project.name}</span>
                {project.baseUrl ? (
                  <span className="project-item-env">{project.baseUrl}</span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>

        {selectedProjectId ? (
          <>
            <h2 className="sidebar-section-title">自动化任务</h2>
            {flows.length === 0 ? (
              <p className="sidebar-empty">还没有任务，请打开浏览器扩展开始录制。</p>
            ) : (
              <ul className="flow-list">
                {flows.map((flow) => (
                  <li key={flow.id}>
                    <button
                      type="button"
                      className={flow.id === selectedFlowId ? "flow-item active" : "flow-item"}
                      aria-current={flow.id === selectedFlowId ? "true" : undefined}
                      onClick={() => {
                        setSelectedFlowId(flow.id);
                        setSelectedExecutionId(null);
                        setMainTab("executions");
                      }}
                    >
                      <span className="flow-item-name">{flow.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : null}
      </aside>

      <main className="main">
        <WorkspaceBreadcrumb
          projectName={selectedProject?.name}
          taskName={selectedFlow?.name}
          viewName={viewName}
        />

        <ViewSwitcher value={mainTab} onChange={setMainTab} />

        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}

        {projects.length === 0 ? (
          <EmptyWorkspaceGuide kind="projects" />
        ) : flows.length === 0 ? (
          <EmptyWorkspaceGuide kind="tasks" projectName={selectedProject?.name} />
        ) : mainTab === "executions" ? (
          <section className="panel executions-panel" aria-label="运行记录">
            {taskExecutions.length === 0 ? (
              <EmptyWorkspaceGuide kind="executions" taskName={selectedFlow?.name} />
            ) : (
              <ExecutionRecordsView
                taskName={selectedFlow?.name ?? "当前自动化任务"}
                executions={taskExecutions}
                selectedExecutionId={selectedExecutionId}
                executionDetail={executionDetail}
                detailLoading={executionDetailLoading}
                onSelect={setSelectedExecutionId}
              />
            )}
          </section>
        ) : (
          <section className="panel versions-panel" aria-label="版本记录">
            {!selectedFlowId || !currentFlow ? (
              <EmptyWorkspaceGuide kind="tasks" projectName={selectedProject?.name} />
            ) : (
              <>
                <header className="panel-header">
                  <p className="result-eyebrow">自动化任务</p>
                  <h2>{currentFlow.name}</h2>
                  <p className="panel-meta">当前共 {currentFlow.steps.length} 个步骤</p>
                </header>
                <FlowVersionList
                  versions={versions}
                  selectedVersionId={selectedVersionId}
                  onSelect={(id) => void loadVersionPreview(id)}
                  onRestore={(id) => void handleRestore(id)}
                  restoringId={restoringId}
                  emptyMessage="尚无历史版本；再次保存任务后将自动保留版本"
                />
                {previewFlow ? (
                  <details className="professional-details">
                    <summary>专业详情：版本原始数据</summary>
                    <pre>{JSON.stringify(previewFlow, null, 2)}</pre>
                  </details>
                ) : null}
              </>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
