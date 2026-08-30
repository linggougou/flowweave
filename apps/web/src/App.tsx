import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { createPortableFlowDocument, type FlowDocument } from "@flowweave/flow-dsl";
import type { ExecutionResult, FlowVersionRecord } from "@flowweave/project-knowledge";
import { APP_DISPLAY_NAME, FlowVersionList, JsonDiffView, createJsonDiff } from "@flowweave/ui";

import * as api from "./api.js";
import type { WebFlowRef, WebProject } from "./api.js";
import { EmptyWorkspaceGuide, WorkspaceBreadcrumb } from "./business-view.js";
import { ExecutionRecordsView } from "./ExecutionRecordsView.js";
import { ViewSwitcher } from "./ViewSwitcher.js";
import { createExecutionDetailLoader } from "./execution-detail-loader.js";

type MainTab = "executions" | "versions";
type VersionPreviewStatus = "idle" | "loading" | "ready";

export function App() {
  const [projects, setProjects] = useState<WebProject[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [flows, setFlows] = useState<WebFlowRef[]>([]);
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
  const [versionPreviewStatus, setVersionPreviewStatus] = useState<VersionPreviewStatus>("idle");
  const [flowRefreshNonce, setFlowRefreshNonce] = useState(0);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [renamingFlowId, setRenamingFlowId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const renameRequestIdRef = useRef(0);
  const latestRenameRequestByFlowRef = useRef(new Map<string, number>());
  const selectedProjectIdRef = useRef(selectedProjectId);
  const selectedFlowIdRef = useRef(selectedFlowId);
  const selectedVersionIdRef = useRef(selectedVersionId);
  const flowListRequestIdRef = useRef(0);
  const executionsRequestIdRef = useRef(0);
  const currentFlowRequestIdRef = useRef(0);
  const versionsRequestIdRef = useRef(0);
  const versionPreviewRequestIdRef = useRef(0);

  selectedProjectIdRef.current = selectedProjectId;
  selectedFlowIdRef.current = selectedFlowId;
  selectedVersionIdRef.current = selectedVersionId;

  const selectedProject = projects.find((project) => project.id === selectedProjectId);
  const selectedFlow = flows.find((flow) => flow.id === selectedFlowId);
  const taskExecutions = useMemo(
    () => executions.filter((execution) => execution.flowId === selectedFlowId),
    [executions, selectedFlowId],
  );
  const executionDetailLoader = useMemo(() => createExecutionDetailLoader(api.getExecution), []);
  const selectedVersion = versions.find((version) => version.id === selectedVersionId) ?? null;
  const versionDiff = useMemo(
    () =>
      previewFlow && currentFlow
        ? createJsonDiff(previewFlow, currentFlow, { maxChanges: 500 })
        : null,
    [currentFlow, previewFlow],
  );
  const versionDiffCounts = useMemo(() => {
    const counts = { added: 0, removed: 0, changed: 0 };
    for (const entry of versionDiff?.entries ?? []) counts[entry.kind] += 1;
    return counts;
  }, [versionDiff]);

  const refreshProjects = useCallback(async () => {
    const list = await api.listProjects();
    setProjects(list);
    if (list.length > 0 && !selectedProjectId) setSelectedProjectId(list[0]?.id ?? null);
  }, [selectedProjectId]);

  useEffect(() => {
    void refreshProjects().catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : "加载项目失败");
    });
  }, [refreshProjects]);

  useEffect(() => {
    const requestId = flowListRequestIdRef.current + 1;
    flowListRequestIdRef.current = requestId;
    if (!selectedProjectId) {
      setFlows([]);
      setSelectedFlowId(null);
      setExecutions([]);
      return;
    }
    const projectId = selectedProjectId;
    setFlows([]);
    setSelectedFlowId(null);
    setError(null);
    void api
      .listFlows(projectId)
      .then((list) => {
        if (
          flowListRequestIdRef.current !== requestId ||
          selectedProjectIdRef.current !== projectId
        ) {
          return;
        }
        setFlows(list);
        setSelectedFlowId(list[0]?.id ?? null);
      })
      .catch((reason: unknown) => {
        if (
          flowListRequestIdRef.current === requestId &&
          selectedProjectIdRef.current === projectId
        ) {
          setError(reason instanceof Error ? reason.message : "加载自动化任务失败");
        }
      });
  }, [selectedProjectId]);

  useEffect(() => {
    const currentFlowRequestId = currentFlowRequestIdRef.current + 1;
    const versionsRequestId = versionsRequestIdRef.current + 1;
    const executionsRequestId = executionsRequestIdRef.current + 1;
    currentFlowRequestIdRef.current = currentFlowRequestId;
    versionsRequestIdRef.current = versionsRequestId;
    executionsRequestIdRef.current = executionsRequestId;
    versionPreviewRequestIdRef.current += 1;
    selectedVersionIdRef.current = null;
    setSelectedVersionId(null);
    setPreviewFlow(null);
    setVersionPreviewStatus("idle");
    setVersions([]);
    setCurrentFlow(null);
    setExecutions([]);
    setSelectedExecutionId(null);

    if (!selectedProjectId || !selectedFlowId) {
      return;
    }

    const projectId = selectedProjectId;
    const flowId = selectedFlowId;
    const isCurrentFlowSelection = () =>
      selectedProjectIdRef.current === projectId && selectedFlowIdRef.current === flowId;

    setError(null);
    void api
      .getFlow(projectId, flowId)
      .then((flow) => {
        if (currentFlowRequestIdRef.current !== currentFlowRequestId || !isCurrentFlowSelection()) {
          return;
        }
        if (flow.id !== flowId || flow.projectId !== projectId) {
          setError("当前任务数据校验失败，已拒绝展示");
          return;
        }
        setCurrentFlow(createPortableFlowDocument(flow).document);
      })
      .catch((reason: unknown) => {
        if (currentFlowRequestIdRef.current === currentFlowRequestId && isCurrentFlowSelection()) {
          setError(reason instanceof Error ? reason.message : "加载当前任务失败");
        }
      });

    void api
      .listFlowVersions(projectId, flowId)
      .then((list) => {
        if (versionsRequestIdRef.current !== versionsRequestId || !isCurrentFlowSelection()) {
          return;
        }
        if (list.some((item) => item.projectId !== projectId || item.flowId !== flowId)) {
          setError("版本列表与当前任务不匹配，已拒绝展示");
          return;
        }
        setVersions(list);
      })
      .catch((reason: unknown) => {
        if (versionsRequestIdRef.current === versionsRequestId && isCurrentFlowSelection()) {
          setError(reason instanceof Error ? reason.message : "加载版本记录失败");
        }
      });

    void api
      .listExecutions(projectId)
      .then((list) => {
        if (executionsRequestIdRef.current !== executionsRequestId || !isCurrentFlowSelection()) {
          return;
        }
        setExecutions(list);
      })
      .catch((reason: unknown) => {
        if (executionsRequestIdRef.current === executionsRequestId && isCurrentFlowSelection()) {
          setError(reason instanceof Error ? reason.message : "加载运行记录失败");
        }
      });
  }, [flowRefreshNonce, selectedProjectId, selectedFlowId]);

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
    if (!selectedProjectId || !selectedFlowId) return;
    const projectId = selectedProjectId;
    const flowId = selectedFlowId;
    const requestId = versionPreviewRequestIdRef.current + 1;
    versionPreviewRequestIdRef.current = requestId;
    selectedVersionIdRef.current = versionId;
    setSelectedVersionId(versionId);
    setPreviewFlow(null);
    setVersionPreviewStatus("loading");
    setError(null);
    try {
      const historicalFlow = await api.getFlowVersion(projectId, versionId);
      if (
        versionPreviewRequestIdRef.current !== requestId ||
        selectedProjectIdRef.current !== projectId ||
        selectedFlowIdRef.current !== flowId ||
        selectedVersionIdRef.current !== versionId
      ) {
        return;
      }
      if (historicalFlow.id !== flowId || historicalFlow.projectId !== projectId) {
        setVersionPreviewStatus("idle");
        setError("版本数据与当前任务不匹配，已拒绝展示");
        return;
      }
      setPreviewFlow(createPortableFlowDocument(historicalFlow).document);
      setVersionPreviewStatus("ready");
    } catch (reason: unknown) {
      if (
        versionPreviewRequestIdRef.current === requestId &&
        selectedProjectIdRef.current === projectId &&
        selectedFlowIdRef.current === flowId &&
        selectedVersionIdRef.current === versionId
      ) {
        setVersionPreviewStatus("idle");
        setError(reason instanceof Error ? reason.message : "加载历史版本失败");
      }
    }
  };

  const handleRestore = async (versionId: string) => {
    if (!selectedProjectId || !selectedFlowId) return;
    setRestoringId(versionId);
    setError(null);
    try {
      const baseline = flows.find((flow) => flow.id === selectedFlowId);
      if (!baseline) throw new Error("任务 revision 不可用，请刷新后重试");
      await api.restoreFlowVersion(selectedProjectId, versionId, baseline.revision);
      const nextFlows = await api.listFlows(selectedProjectId);
      setFlows(nextFlows);
      if (
        selectedProjectIdRef.current === selectedProjectId &&
        selectedFlowIdRef.current === selectedFlowId
      ) {
        setFlowRefreshNonce((current) => current + 1);
      }
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "恢复失败");
    } finally {
      setRestoringId(null);
    }
  };

  const resetRename = () => {
    renameRequestIdRef.current += 1;
    setRenamingFlowId(null);
    setRenameDraft("");
    setRenaming(false);
  };

  const handleStartRename = (flow: WebFlowRef) => {
    renameRequestIdRef.current += 1;
    setSelectedFlowId(flow.id);
    setRenamingFlowId(flow.id);
    setRenameDraft(flow.name);
    setRenaming(false);
    setError(null);
  };

  const handleSubmitRename = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedProjectId || !renamingFlowId || renaming) return;

    const name = renameDraft.trim();
    if (!name) {
      setError("任务名称不能为空");
      return;
    }

    const projectId = selectedProjectId;
    const flowId = renamingFlowId;
    const requestId = renameRequestIdRef.current + 1;
    renameRequestIdRef.current = requestId;
    const requestKey = `${projectId}\u0000${flowId}`;
    latestRenameRequestByFlowRef.current.set(requestKey, requestId);
    setRenaming(true);
    setError(null);

    try {
      const baseline = flows.find((flow) => flow.id === flowId);
      if (!baseline) throw new Error("任务 revision 不可用，请刷新后重试");
      const updated = await api.renameFlow(projectId, flowId, name, baseline.revision);
      if (
        latestRenameRequestByFlowRef.current.get(requestKey) !== requestId ||
        selectedProjectIdRef.current !== projectId
      ) {
        return;
      }

      setFlows((current) =>
        current.map((flow) =>
          flow.id === updated.flowId
            ? {
                ...flow,
                name: updated.name,
                revision: updated.revision,
                schemaVersion: updated.schemaVersion,
              }
            : flow,
        ),
      );
      setCurrentFlow((current) =>
        requestId === renameRequestIdRef.current &&
        selectedFlowIdRef.current === flowId &&
        current?.id === updated.flowId
          ? { ...current, name: updated.name }
          : current,
      );
      if (requestId === renameRequestIdRef.current && selectedFlowIdRef.current === flowId) {
        setRenamingFlowId(null);
        setRenameDraft("");
      }
    } catch (reason: unknown) {
      if (
        requestId === renameRequestIdRef.current &&
        selectedProjectIdRef.current === projectId &&
        selectedFlowIdRef.current === flowId
      ) {
        setError(reason instanceof Error ? reason.message : "重命名失败");
      }
    } finally {
      if (
        requestId === renameRequestIdRef.current &&
        selectedProjectIdRef.current === projectId &&
        selectedFlowIdRef.current === flowId
      ) {
        setRenaming(false);
      }
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
                  resetRename();
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
                    {renamingFlowId === flow.id ? (
                      <form
                        className="flow-rename-form"
                        onSubmit={(event) => void handleSubmitRename(event)}
                      >
                        <label className="sr-only" htmlFor={`flow-name-${flow.id}`}>
                          自动化任务名称
                        </label>
                        <input
                          id={`flow-name-${flow.id}`}
                          name="flow-name"
                          value={renameDraft}
                          onChange={(event) => setRenameDraft(event.target.value)}
                          disabled={renaming}
                          autoFocus
                          onKeyDown={(event) => {
                            if (event.key === "Escape" && !renaming) {
                              event.preventDefault();
                              resetRename();
                            }
                          }}
                        />
                        <div className="flow-rename-actions">
                          <button type="submit" aria-label="保存名称" disabled={renaming}>
                            {renaming ? "保存中…" : "保存"}
                          </button>
                          <button
                            type="button"
                            aria-label="取消重命名"
                            disabled={renaming}
                            onClick={resetRename}
                          >
                            取消
                          </button>
                        </div>
                      </form>
                    ) : (
                      <div className="flow-item-row">
                        <button
                          type="button"
                          className={flow.id === selectedFlowId ? "flow-item active" : "flow-item"}
                          aria-current={flow.id === selectedFlowId ? "true" : undefined}
                          onClick={() => {
                            resetRename();
                            setSelectedFlowId(flow.id);
                            setSelectedExecutionId(null);
                            setMainTab("executions");
                          }}
                        >
                          <span className="flow-item-name">{flow.name}</span>
                        </button>
                        <button
                          type="button"
                          className="flow-rename-trigger"
                          aria-label={`重命名 ${flow.name}`}
                          title={`重命名「${flow.name}」`}
                          onClick={() => handleStartRename(flow)}
                        >
                          重命名
                        </button>
                      </div>
                    )}
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
            {!selectedFlowId ? (
              <EmptyWorkspaceGuide kind="tasks" projectName={selectedProject?.name} />
            ) : !currentFlow ? (
              <p className="version-loading" role="status">
                正在加载当前任务…
              </p>
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
                {versionPreviewStatus === "loading" ? (
                  <p className="version-loading" role="status">
                    正在加载历史版本并生成安全差异…
                  </p>
                ) : null}
                {previewFlow && selectedVersion && versionDiff ? (
                  <section className="version-diff" aria-labelledby="version-diff-title">
                    <header className="version-diff-header">
                      <h3 id="version-diff-title">历史 v{selectedVersion.version} → 当前任务</h3>
                      <p className="version-diff-privacy">敏感值已隐藏</p>
                    </header>
                    <p className="version-diff-summary" aria-live="polite">
                      {versionDiff.truncated
                        ? `共 ${versionDiff.totalChanges} 处变化；前 ${versionDiff.entries.length} 处中：新增 ${versionDiffCounts.added} · 删除 ${versionDiffCounts.removed} · 修改 ${versionDiffCounts.changed}`
                        : `新增 ${versionDiffCounts.added} · 删除 ${versionDiffCounts.removed} · 修改 ${versionDiffCounts.changed}`}
                    </p>
                    <details className="professional-details version-diff-details">
                      <summary>专业详情：差异路径与安全值</summary>
                      <p className="professional-details-intro">
                        历史版本与当前任务均已生成安全展示副本；此处只能查看，不能编辑或保存。
                      </p>
                      <JsonDiffView
                        before={previewFlow}
                        after={currentFlow}
                        beforeLabel={`历史 v${selectedVersion.version}`}
                        afterLabel="当前任务"
                        ariaLabel={`历史 v${selectedVersion.version} 与当前任务差异`}
                      />
                    </details>
                  </section>
                ) : null}
              </>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
