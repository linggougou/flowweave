import { useCallback, useEffect, useRef, useState, type FormEvent, type MouseEvent } from "react";
import type { FlowDocument } from "@flowweave/flow-dsl";
import { analyzeFlowFragility } from "@flowweave/page-intelligence";
import {
  APP_DISPLAY_NAME,
  FlowStepsTable,
  FlowVersionList,
  StepLogTable,
  type StepLogRow,
} from "@flowweave/ui";
import { DiagnosticInspector } from "./DiagnosticInspector.js";
import { ExecutionRunContextPanel } from "./ExecutionRunContextPanel.js";
import { ExecutionCompatibilityNotice } from "./ExecutionCompatibilityNotice.js";
import { FragilityNotice } from "./FragilityNotice.js";
import { flowStepsToRows } from "./flow-step-format.js";
import { buildExecutionCompatibilityWarnings } from "./shared/execution-fragility.js";
import {
  buildFragilityVariableContext,
  buildVariableInputsForFlow,
  buildRunDraftState,
  collectRunPreflightIssues,
  parseVariableInput,
  shouldRestoreRecentRunInput,
  type VariableInputs,
} from "./shared/run-input-state.js";
import type {
  ExecutionStepLog,
  ExecutionSummary,
  StudioExecution,
  StudioFlowRef,
  StudioFlowVersion,
  StudioProject,
} from "./shared/studio-api-types.js";

const SHOW_BROWSER_STORAGE_KEY = "flowweave:studio-show-browser";
const SIDEBAR_EXECUTIONS_MAX = 5;

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

import { FlowEmptyGuide } from "./FlowEmptyGuide.js";
import { getStudioApi } from "./studio-client.js";

function formatStudioError(err: unknown): string {
  if (!(err instanceof Error)) {
    return "操作失败";
  }
  return err.message.replace(/^Error invoking remote method '[^']+':\s*/i, "");
}

function isFlowNotFoundMessage(message: string): boolean {
  return /flow\s*不存在/i.test(message) || /flow not found/i.test(message);
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

type MainTab = "flow" | "executions" | "versions";

export function App() {
  const [tab, setTab] = useState<MainTab>("flow");
  const [projects, setProjects] = useState<StudioProject[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [flows, setFlows] = useState<StudioFlowRef[]>([]);
  const [selectedFlowId, setSelectedFlowId] = useState<string | null>(null);
  const [versions, setVersions] = useState<StudioFlowVersion[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [previewVersion, setPreviewVersion] = useState<FlowDocument | null>(null);
  const [currentFlow, setCurrentFlow] = useState<FlowDocument | null>(null);
  const [flowLoading, setFlowLoading] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [executionHistory, setExecutionHistory] = useState<ExecutionSummary[]>([]);
  const [execution, setExecution] = useState<StudioExecution | null>(null);
  const [loading, setLoading] = useState(false);
  const [showBrowser, setShowBrowser] = useState(readShowBrowserPreference);
  const [error, setError] = useState<string | null>(null);
  const [showNewProjectForm, setShowNewProjectForm] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [creatingProject, setCreatingProject] = useState(false);
  const [executionsExpanded, setExecutionsExpanded] = useState(false);
  const [renamingFlowId, setRenamingFlowId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [selectedEnvironmentName, setSelectedEnvironmentName] = useState("");
  const [baseUrlDraft, setBaseUrlDraft] = useState("");
  const [storageStatePathDraft, setStorageStatePathDraft] = useState("");
  const [variableInputs, setVariableInputs] = useState<VariableInputs>({});
  const [selectedDiagnosticStepIndex, setSelectedDiagnosticStepIndex] = useState<number | null>(
    null,
  );
  const previousDraftFlowIdRef = useRef<string | null>(null);

  const selectedProject =
    projects.find((project) => project.id === selectedProjectId) ?? null;
  const selectedProjectName = selectedProject?.name;
  const availableEnvironments = selectedProject?.environments ?? [];

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
      setCurrentFlow(null);
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

  const loadFlowDocument = useCallback(
    async (projectId: string, flowId: string) => {
      setFlowLoading(true);
      setError(null);
      try {
        const api = getStudioApi();
        const doc = await api.getFlow(projectId, flowId);
        setCurrentFlow(doc);
      } catch (err: unknown) {
        const message = formatStudioError(err);
        if (isFlowNotFoundMessage(message)) {
          setCurrentFlow(null);
          setSelectedFlowId(null);
          return;
        }
        setCurrentFlow(null);
        setError(message);
      } finally {
        setFlowLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void refreshProjects().catch((err: unknown) => {
      setError(formatStudioError(err));
    });
  }, [refreshProjects]);

  useEffect(() => {
    if (!selectedProjectId) {
      setExecutionHistory([]);
      setFlows([]);
      setVersions([]);
      setCurrentFlow(null);
      setSelectedFlowId(null);
      return;
    }
    setError(null);
    void refreshExecutionHistory(selectedProjectId).catch((err: unknown) => {
      setError(formatStudioError(err));
    });
    void refreshFlows(selectedProjectId).catch((err: unknown) => {
      setError(formatStudioError(err));
    });
  }, [selectedProjectId, refreshExecutionHistory, refreshFlows]);

  useEffect(() => {
    if (!selectedProjectId || !selectedFlowId) {
      setVersions([]);
      if (!selectedFlowId) {
        setCurrentFlow(null);
      }
      return;
    }
    if (!flows.some((flow) => flow.id === selectedFlowId)) {
      return;
    }
    void refreshVersions(selectedProjectId, selectedFlowId).catch((err: unknown) => {
      setError(formatStudioError(err));
    });
    void loadFlowDocument(selectedProjectId, selectedFlowId);
  }, [selectedProjectId, selectedFlowId, flows, refreshVersions, loadFlowDocument]);

  useEffect(() => {
    const environment =
      availableEnvironments.find((item) => item.name === selectedEnvironmentName) ?? null;

    if (environment) {
      return;
    }

    const fallback =
      availableEnvironments.find((item) => item.isDefault) ?? availableEnvironments[0] ?? null;

    if (!fallback) {
      setSelectedEnvironmentName("");
      setBaseUrlDraft("");
      setStorageStatePathDraft("");
      return;
    }

    setSelectedEnvironmentName(fallback.name);
    setBaseUrlDraft(fallback.baseUrl);
    setStorageStatePathDraft(fallback.storageStatePath ?? "");
  }, [availableEnvironments, selectedEnvironmentName]);

  useEffect(() => {
    const previousFlowId = previousDraftFlowIdRef.current;
    previousDraftFlowIdRef.current = currentFlow?.id ?? null;
    setVariableInputs((previous) =>
      buildVariableInputsForFlow(currentFlow, {
        previous,
        previousFlowId,
      }),
    );
  }, [currentFlow]);

  useEffect(() => {
    if (!selectedFlowId || !currentFlow || currentFlow.id === selectedFlowId) {
      return;
    }

    setSelectedEnvironmentName("");
    setBaseUrlDraft("");
    setStorageStatePathDraft("");
    setVariableInputs({});
  }, [currentFlow, selectedFlowId]);

  useEffect(() => {
    if (
      !selectedProjectId ||
      !selectedFlowId ||
      !shouldRestoreRecentRunInput(currentFlow, selectedFlowId)
    ) {
      return;
    }

    let cancelled = false;
    void getStudioApi()
      .getFlowRunInput(selectedProjectId, selectedFlowId)
      .then((recentInput) => {
        if (cancelled || !recentInput) {
          return;
        }
        const draft = buildRunDraftState(currentFlow, recentInput);
        setSelectedEnvironmentName(draft.selectedEnvironmentName);
        setBaseUrlDraft(draft.baseUrlDraft);
        setStorageStatePathDraft(draft.storageStatePathDraft);
        setVariableInputs(draft.variableInputs);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(formatStudioError(err));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [currentFlow, selectedFlowId, selectedProjectId]);

  useEffect(() => {
    if (!execution) {
      setSelectedDiagnosticStepIndex(null);
      return;
    }
    const firstDiagnosticStep =
      execution.steps.find((step) => step.diagnosticPath) ??
      execution.steps.find((step) => step.pageSnapshotPath);
    setSelectedDiagnosticStepIndex(firstDiagnosticStep?.stepIndex ?? null);
  }, [execution?.executionId, execution]);

  const loadExecution = async (executionId: string) => {
    const api = getStudioApi();
    const detail = await api.getExecution(executionId);
    setExecution(detail);
    return detail;
  };

  const handleSelectFlow = (flowId: string) => {
    if (renamingFlowId) {
      return;
    }
    setSelectedFlowId(flowId);
    setTab("flow");
  };

  const handleStartRenameFlow = (flow: StudioFlowRef, event: MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
    setRenamingFlowId(flow.id);
    setRenameDraft(flow.name);
  };

  const handleCancelRenameFlow = () => {
    setRenamingFlowId(null);
    setRenameDraft("");
  };

  const handleSubmitRenameFlow = async (event: FormEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (!selectedProjectId || !renamingFlowId) {
      return;
    }
    const name = renameDraft.trim();
    if (!name) {
      setError("Flow 名称不能为空");
      return;
    }
    setRenaming(true);
    setError(null);
    try {
      const api = getStudioApi();
      const updated = await api.renameFlow(selectedProjectId, renamingFlowId, name);
      setFlows((prev) =>
        prev.map((flow) => (flow.id === updated.id ? { ...flow, name: updated.name } : flow)),
      );
      if (currentFlow?.id === updated.id) {
        setCurrentFlow({ ...currentFlow, name: updated.name });
      }
      setRenamingFlowId(null);
      setRenameDraft("");
    } catch (err: unknown) {
      setError(formatStudioError(err));
    } finally {
      setRenaming(false);
    }
  };

  const handleSelectExecution = (executionId: string, flowId: string) => {
    setSelectedFlowId(flowId);
    setTab("executions");
    void loadExecution(executionId);
  };

  const handleSelectProject = (projectId: string) => {
    setSelectedProjectId(projectId);
    setSelectedFlowId(null);
    setCurrentFlow(null);
    setVersions([]);
    setPreviewVersion(null);
    setError(null);
    setExecution(null);
    setSelectedEnvironmentName("");
    setBaseUrlDraft("");
    setStorageStatePathDraft("");
    setVariableInputs({});
    setTab("flow");
  };

  const handleCreateProject = async (event: FormEvent) => {
    event.preventDefault();
    const name = newProjectName.trim();
    if (!name) {
      setError("请输入项目名称");
      return;
    }
    setCreatingProject(true);
    setError(null);
    try {
      const api = getStudioApi();
      const project = await api.createProject(name);
      await refreshProjects();
      setSelectedProjectId(project.id);
      setSelectedFlowId(null);
      setCurrentFlow(null);
      setFlows([]);
      setExecutionHistory([]);
      setExecution(null);
      setShowNewProjectForm(false);
      setNewProjectName("");
      setTab("flow");
    } catch (err: unknown) {
      setError(formatStudioError(err));
    } finally {
      setCreatingProject(false);
    }
  };

  const handleSelectEnvironment = (environmentName: string) => {
    const environment = availableEnvironments.find((item) => item.name === environmentName);
    setSelectedEnvironmentName(environmentName);
    setBaseUrlDraft(environment?.baseUrl ?? "");
    setStorageStatePathDraft(environment?.storageStatePath ?? "");
  };

  const handleRun = async () => {
    if (!selectedProjectId || !selectedFlowId || !currentFlow) {
      return;
    }
    setError(null);
    const preflightIssues = collectRunPreflightIssues(currentFlow, {
      baseUrl: baseUrlDraft,
      storageStatePath: storageStatePathDraft,
      variables: variableInputs,
    });
    if (preflightIssues.length > 0) {
      setError(
        `运行前检查未通过：${preflightIssues.map((issue) => issue.message).join("；")}`,
      );
      return;
    }

    setLoading(true);
    try {
      const variables: Record<string, string | number | boolean> = {};
      for (const variable of currentFlow.variables) {
        const value = parseVariableInput(variable, variableInputs[variable.name] ?? "");
        if (value !== undefined) {
          variables[variable.name] = value;
        }
      }

      const api = getStudioApi();
      const result = await api.runFlow(selectedProjectId, selectedFlowId, {
        showBrowser,
        environmentName: selectedEnvironmentName || "默认环境",
        baseUrl: baseUrlDraft,
        storageStatePath: storageStatePathDraft,
        variables,
      });
      const detail = await api.getExecution(result.executionId);
      setExecution(detail);
      setTab("executions");
      setExecutionsExpanded(true);
      await refreshExecutionHistory(selectedProjectId);
      await loadFlowDocument(selectedProjectId, selectedFlowId);
    } catch (err: unknown) {
      setError(formatStudioError(err));
    } finally {
      setLoading(false);
    }
  };

  const flowFragilityIssues =
    currentFlow !== null
      ? analyzeFlowFragility(currentFlow, {
          baseUrl: baseUrlDraft.trim(),
          variables: buildFragilityVariableContext(currentFlow, variableInputs),
      })
      : [];
  const runPreflightIssues = collectRunPreflightIssues(currentFlow, {
    baseUrl: baseUrlDraft,
    storageStatePath: storageStatePathDraft,
    variables: variableInputs,
  });

  const flowStepRows = currentFlow ? flowStepsToRows(currentFlow.steps) : [];

  const hasFlowsInProject = flows.length > 0;
  const projectHasNoFlows = Boolean(selectedProjectId) && !hasFlowsInProject;

  const selectedFlowName =
    flows.find((f) => f.id === selectedFlowId)?.name ?? selectedFlowId ?? "—";

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
    diagnosticPath: step.diagnosticPath,
    pageSnapshotPath: step.pageSnapshotPath,
  }));

  const diagnosticSteps: ExecutionStepLog[] = (execution?.steps ?? []).filter(
    (step) => step.diagnosticPath || step.pageSnapshotPath || step.pageSnapshot,
  );
  const executionCompatibilityWarnings = execution
    ? buildExecutionCompatibilityWarnings({
        flowSnapshot: execution.flowSnapshot,
        runContext: execution.runContext,
      })
    : [];

  const openLocalPath = (filePath: string) => {
    void getStudioApi()
      .openPath(filePath)
      .catch((err: unknown) => {
        setError(formatStudioError(err));
      });
  };

  const inspectDiagnostic = (step: StepLogRow) => {
    setSelectedDiagnosticStepIndex(step.stepIndex);
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
      setError(formatStudioError(err));
    } finally {
      setRestoringId(null);
    }
  };

  const selectedEnvironment =
    availableEnvironments.find((item) => item.name === selectedEnvironmentName) ?? null;

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1>{APP_DISPLAY_NAME} Studio</h1>
          <p>P2 工作台：录制、回放与执行历史</p>
        </div>

        <section className="sidebar-section sidebar-section-projects">
          <div className="sidebar-section-head">
            <h2>项目</h2>
            <button
              type="button"
              className="sidebar-icon-btn"
              title="新建项目"
              aria-label="新建项目"
              onClick={() => {
                setShowNewProjectForm((v) => !v);
                setError(null);
              }}
            >
              +
            </button>
          </div>
          {showNewProjectForm ? (
            <form className="new-project-form" onSubmit={(e) => void handleCreateProject(e)}>
              <input
                type="text"
                value={newProjectName}
                placeholder="项目名称"
                maxLength={64}
                autoFocus
                disabled={creatingProject}
                onChange={(e) => setNewProjectName(e.target.value)}
              />
              <div className="new-project-actions">
                <button type="submit" disabled={creatingProject || !newProjectName.trim()}>
                  {creatingProject ? "创建中…" : "创建"}
                </button>
                <button
                  type="button"
                  className="sidebar-text-btn"
                  disabled={creatingProject}
                  onClick={() => {
                    setShowNewProjectForm(false);
                    setNewProjectName("");
                  }}
                >
                  取消
                </button>
              </div>
            </form>
          ) : null}
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
                  onClick={() => handleSelectProject(project.id)}
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
        </section>

        <div className="sidebar-scroll">
          {selectedProjectId ? (
            <section className="sidebar-section sidebar-section-primary">
              <h2>Flow 列表</h2>
              {flows.length === 0 ? (
                <p className="execution-history-empty sidebar-flow-hint">
                  本项目尚无 Flow。请用浏览器扩展录制操作，并在扩展侧栏选择<strong>同名项目</strong>
                  后点击「同步到知识库」。
                </p>
              ) : (
                <ul className="execution-history-list flow-list">
                  {flows.map((flow) => (
                    <li key={flow.id}>
                      {renamingFlowId === flow.id ? (
                        <form
                          className="flow-list-rename-form"
                          onSubmit={(event) => void handleSubmitRenameFlow(event)}
                        >
                          <input
                            type="text"
                            className="flow-list-rename-input"
                            value={renameDraft}
                            onChange={(event) => setRenameDraft(event.target.value)}
                            autoFocus
                            disabled={renaming}
                            onKeyDown={(event) => {
                              if (event.key === "Escape") {
                                event.preventDefault();
                                handleCancelRenameFlow();
                              }
                            }}
                          />
                          <div className="flow-list-rename-actions">
                            <button type="submit" disabled={renaming}>
                              保存
                            </button>
                            <button
                              type="button"
                              className="flow-list-rename-cancel"
                              disabled={renaming}
                              onClick={handleCancelRenameFlow}
                            >
                              取消
                            </button>
                          </div>
                        </form>
                      ) : (
                        <button
                          type="button"
                          className={
                            selectedFlowId === flow.id
                              ? "execution-history-item flow-list-item active"
                              : "execution-history-item flow-list-item"
                          }
                          onClick={() => handleSelectFlow(flow.id)}
                        >
                          <span className="flow-list-item-row">
                            <span className="flow-list-name">{flow.name}</span>
                            <span
                              className="flow-list-rename-btn"
                              role="button"
                              tabIndex={0}
                              title="重命名"
                              aria-label={`重命名 ${flow.name}`}
                              onClick={(event) => handleStartRenameFlow(flow, event)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                  event.preventDefault();
                                  handleStartRenameFlow(flow, event as unknown as MouseEvent);
                                }
                              }}
                            >
                              ✎
                            </span>
                          </span>
                          <span className="execution-history-meta">
                            添加于 {formatExecutionTime(flow.createdAt)}
                          </span>
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : null}

          {selectedProjectId ? (
            <section className="sidebar-section sidebar-section-executions">
              <button
                type="button"
                className="sidebar-section-toggle"
                onClick={() => setExecutionsExpanded((v) => !v)}
                aria-expanded={executionsExpanded}
              >
                <span>最近执行</span>
                <span className="sidebar-section-toggle-meta">
                  {executionHistory.length > 0 ? `${executionHistory.length} 条` : "无"}
                  <span className="sidebar-chevron">{executionsExpanded ? "▾" : "▸"}</span>
                </span>
              </button>
              {executionsExpanded ? (
                executionHistory.length === 0 ? (
                  <p className="execution-history-empty">暂无执行记录</p>
                ) : (
                  <>
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
                            onClick={() => handleSelectExecution(item.executionId, item.flowId)}
                          >
                            <span className="execution-history-id">
                              {item.executionId.slice(0, 8)}…
                            </span>
                            <span
                              className={
                                item.status === "failed"
                                  ? "execution-history-meta execution-history-status-failed"
                                  : item.status === "passed"
                                    ? "execution-history-meta execution-history-status-passed"
                                    : "execution-history-meta"
                              }
                            >
                              {item.status === "failed"
                                ? "失败"
                                : item.status === "passed"
                                  ? "通过"
                                  : item.status}{" "}
                              · {formatExecutionTime(item.startedAt)}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                    <p className="sidebar-hint">仅显示最近 {SIDEBAR_EXECUTIONS_MAX} 条</p>
                  </>
                )
              ) : null}
            </section>
          ) : null}
        </div>
      </aside>
      <main className="main">
        <div className="toolbar">
          <button
            type="button"
            className={tab === "flow" ? "tab-btn active" : "tab-btn"}
            onClick={() => setTab("flow")}
          >
            录制内容
          </button>
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
            disabled={!selectedProjectId || !selectedFlowId || loading || projectHasNoFlows}
            title={
              projectHasNoFlows
                ? "请先用扩展录制并同步 Flow"
                : !selectedFlowId
                  ? "请先在侧栏选择一个 Flow"
                  : undefined
            }
            onClick={() => void handleRun()}
          >
            {loading ? "运行中…" : "运行流程"}
          </button>
          {projectHasNoFlows ? (
            <span className="status status-hint">本项目还没有 Flow，无法运行</span>
          ) : !selectedFlowId && selectedProjectId ? (
            <span className="status status-hint">请在左侧 Flow 列表中选择一个流程</span>
          ) : null}
          <span className="status" title={selectedFlowId ?? undefined}>
            {selectedFlowId
              ? `Flow：${selectedFlowName}${currentFlow ? ` · ${currentFlow.steps.length} 步` : ""}`
              : "未选择 Flow"}
            {execution
              ? ` · 执行 ${execution.executionId.slice(0, 8)}… ${execution.status}`
              : ""}
          </span>
        </div>
        {error ? <p className="error" role="alert">{error}</p> : null}
        {selectedProjectId ? (
          <section className="flow-content-panel">
            <header className="flow-content-header">
              <h2>运行环境</h2>
              <p className="flow-content-meta">
                当前项目环境与运行时变量会在执行时注入到 Studio Runtime
              </p>
            </header>
            <div className="new-project-form" style={{ maxWidth: "100%" }}>
              <label>
                环境
                <select
                  value={selectedEnvironmentName}
                  disabled={loading || availableEnvironments.length === 0}
                  onChange={(event) => handleSelectEnvironment(event.target.value)}
                >
                  {availableEnvironments.length === 0 ? (
                    <option value="">未配置默认环境</option>
                  ) : (
                    availableEnvironments.map((environment) => (
                      <option key={environment.name} value={environment.name}>
                        {environment.name}
                        {environment.isDefault ? "（默认）" : ""}
                      </option>
                    ))
                  )}
                </select>
              </label>
              <label>
                Base URL
                <input
                  type="text"
                  value={baseUrlDraft}
                  placeholder="https://example.com"
                  disabled={loading}
                  onChange={(event) => setBaseUrlDraft(event.target.value)}
                />
              </label>
              <label>
                Storage State 路径
                <input
                  type="text"
                  value={storageStatePathDraft}
                  placeholder="/path/to/storage-state.json"
                  disabled={loading}
                  onChange={(event) => setStorageStatePathDraft(event.target.value)}
                />
              </label>
              <p className="execution-history-meta">
                {selectedEnvironment
                  ? `当前环境：${selectedEnvironment.name}`
                  : "当前项目还没有默认环境，运行时将只使用 Flow 自身的绝对地址。"}
              </p>
            </div>
            <section className="flow-preview">
              <h3>变量注入</h3>
              {currentFlow && currentFlow.variables.length > 0 ? (
                <div className="new-project-form" style={{ maxWidth: "100%" }}>
                  {currentFlow.variables.map((variable) => (
                    <label key={variable.name}>
                      {variable.name}（{variable.type}
                      {variable.required ? "，必填" : "，可选"}）
                      {variable.type === "boolean" ? (
                        <select
                          value={variableInputs[variable.name] ?? ""}
                          disabled={loading}
                          onChange={(event) =>
                            setVariableInputs((previous) => ({
                              ...previous,
                              [variable.name]: event.target.value,
                            }))
                          }
                        >
                          {!variable.required ? <option value="">未设置</option> : null}
                          <option value="true">true</option>
                          <option value="false">false</option>
                        </select>
                      ) : (
                        <input
                          type={variable.type === "number" ? "number" : "text"}
                          value={variableInputs[variable.name] ?? ""}
                          placeholder={
                            variable.defaultValue === undefined
                              ? "请输入运行值"
                              : `默认值：${String(variable.defaultValue)}`
                          }
                          disabled={loading}
                          onChange={(event) =>
                            setVariableInputs((previous) => ({
                              ...previous,
                              [variable.name]: event.target.value,
                            }))
                          }
                        />
                      )}
                    </label>
                  ))}
                </div>
              ) : (
                <p className="execution-history-empty">当前 Flow 未声明运行变量</p>
              )}
            </section>
            <section className="flow-preview">
              <h3>运行前检查</h3>
              {runPreflightIssues.length > 0 ? (
                <ul className="execution-history-list">
                  {runPreflightIssues.map((issue) => (
                    <li key={`${issue.code}-${issue.field}`}>
                      <p className="error" role="alert">
                        {issue.message}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="execution-history-meta">
                  本地 preflight 已通过；点击「运行流程」后还会继续检查 Storage State
                  文件是否存在。
                </p>
              )}
            </section>
          </section>
        ) : null}
        {tab === "flow" ? (
          <section className="flow-content-panel">
            {projectHasNoFlows ? (
              <FlowEmptyGuide projectName={selectedProjectName} />
            ) : flowLoading ? (
              <p className="execution-history-empty">正在加载 Flow…</p>
            ) : currentFlow ? (
              <>
                <header className="flow-content-header">
                  <h2>{currentFlow.name}</h2>
                  <p className="flow-content-meta">
                    ID：<code>{currentFlow.id}</code>
                    {currentFlow.meta?.source ? ` · 来源：${currentFlow.meta.source}` : ""}
                    {currentFlow.meta?.updatedAt
                      ? ` · 更新：${formatExecutionTime(currentFlow.meta.updatedAt)}`
                      : ""}
                  </p>
                </header>
                {currentFlow.steps.length === 0 ? (
                  <p className="flow-steps-empty-hint">
                    该 Flow 已同步但<strong>没有录制步骤</strong>。请在扩展中重新录制页面操作后再同步。
                  </p>
                ) : null}
                <FragilityNotice warnings={flowFragilityIssues} />
                <FlowStepsTable
                  steps={flowStepRows}
                  emptyMessage="该 Flow 没有步骤，请在扩展中录制后重新同步"
                />
                <details className="flow-preview">
                  <summary>查看原始 JSON</summary>
                  <pre>{JSON.stringify(currentFlow, null, 2)}</pre>
                </details>
              </>
            ) : (
              <p className="execution-history-empty">
                在左侧「Flow 列表」中选择一个流程，查看录制步骤与定位策略
              </p>
            )}
          </section>
        ) : null}
        {tab === "executions" ? (
          <>
            <ExecutionCompatibilityNotice warnings={executionCompatibilityWarnings} />
            {execution?.fragilityIssues && execution.fragilityIssues.length > 0 ? (
              <FragilityNotice warnings={execution.fragilityIssues} />
            ) : null}
            <ExecutionRunContextPanel runContext={execution?.runContext} />
            <StepLogTable
              steps={steps}
              emptyMessage={
                selectedFlowId
                  ? "点击「运行流程」或从左侧选择一条执行记录"
                  : "请先在侧栏选择一个 Flow"
              }
              onOpenScreenshot={openLocalPath}
              onOpenDiagnostic={openLocalPath}
              onInspectDiagnostic={inspectDiagnostic}
            />
            {execution && diagnosticSteps.length > 0 ? (
              <DiagnosticInspector
                steps={execution.steps}
                selectedStepIndex={selectedDiagnosticStepIndex}
                onSelectStepIndex={setSelectedDiagnosticStepIndex}
                onOpenPath={openLocalPath}
              />
            ) : null}
          </>
        ) : null}
        {tab === "versions" ? (
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
                  onSelect={(id: string) => void loadVersion(id)}
                  onRestore={(id: string) => void handleRestore(id)}
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
            ) : projectHasNoFlows ? (
              <FlowEmptyGuide projectName={selectedProjectName} />
            ) : (
              <p className="execution-history-empty">请在左侧 Flow 列表中选择一个流程</p>
            )}
          </section>
        ) : null}
      </main>
    </div>
  );
}
