import { useCallback, useEffect, useRef, useState, type FormEvent, type MouseEvent } from "react";
import { createPortableFlowDocument, type FlowDocument } from "@flowweave/flow-dsl";
import { analyzeFlowFragility } from "@flowweave/page-intelligence";
import {
  APP_DISPLAY_NAME,
  FlowStepsTable,
  FlowVersionList,
  JsonDiffView,
  createJsonDiff,
  StepLogTable,
  type StepLogRow,
} from "@flowweave/ui";
import { DiagnosticInspector } from "./DiagnosticInspector.js";
import { ExecutionRunContextPanel } from "./ExecutionRunContextPanel.js";
import { ExecutionResultSummary } from "./ExecutionResultSummary.js";
import { ExecutionCompatibilityNotice } from "./ExecutionCompatibilityNotice.js";
import { ExecutionProgressPanel } from "./ExecutionProgressPanel.js";
import { FragilityNotice } from "./FragilityNotice.js";
import { flowStepsToRows } from "./flow-step-format.js";
import { registerWindowFocusRefresh, resolveRefreshedFlowSelection } from "./refresh-state.js";
import { buildExecutionCompatibilityWarnings } from "./shared/execution-fragility.js";
import { buildFailureInsight } from "./shared/failure-insights.js";
import {
  buildFragilityVariableContext,
  buildVariableInputsForFlow,
  buildRunDraftState,
  collectRunPreflightIssues,
  parseVariableInput,
  shouldRestoreRecentRunInput,
  type VariableInputs,
} from "./shared/run-input-state.js";
import { isSensitiveVariableName } from "./shared/sensitive-variables.js";
import {
  createExecutionProgressState,
  failExecutionProgressUnlessTerminal,
  finalizeExecutionProgress,
  reduceExecutionProgress,
  type ExecutionProgressState,
} from "./shared/execution-progress.js";
import { buildRunConfirmationSummary, type RunConfirmationSummary } from "./shared/run-safety.js";
import { RunSafetyConfirmation } from "./RunSafetyConfirmation.js";
import { ExecutionDeletionConfirmation } from "./ExecutionDeletionConfirmation.js";
import {
  ExecutionScreenshotPreview,
  type ExecutionScreenshotPreviewStatus,
} from "./ExecutionScreenshotPreview.js";
import { ViewSwitcher } from "./ViewSwitcher.js";
import type {
  ExecutionStepLog,
  ExecutionSummary,
  StudioExecution,
  StudioFlowRef,
  StudioFlowVersion,
  StudioProject,
} from "./shared/studio-api-types.js";
import { resolveExecutionSelectionAfterDeletion } from "./shared/execution-maintenance.js";
import {
  isCurrentVersionRequest,
  isMatchingExecutionDeletionResult,
} from "./shared/maintenance-request-guards.js";

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

function readNativeFilePortability(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    return getStudioApi().nativeFilePortability === true;
  } catch {
    return false;
  }
}

function readNativeExecutionDeletion(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const api = getStudioApi();
    return api.nativeExecutionDeletion === true && typeof api.deleteExecution === "function";
  } catch {
    return false;
  }
}

function readNativeExecutionScreenshotPreview(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return getStudioApi().nativeExecutionScreenshotPreview === true;
  } catch {
    return false;
  }
}

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

function formatBusinessExecutionStatus(status: string): string {
  switch (status) {
    case "passed":
    case "success":
      return "成功";
    case "failed":
      return "失败";
    case "cancelled":
      return "已取消";
    case "running":
      return "运行中";
    default:
      return "等待运行";
  }
}

type MainTab = "flow" | "executions" | "versions";
type ScreenshotPreviewState = {
  status: ExecutionScreenshotPreviewStatus;
  blobUrl: string | null;
  stepIndex: number;
  stepLabel: string;
  unavailableMessage?: string;
};
const LAYOUT_CONTRACT_STATE_KEY = Symbol.for("flowweave.studio.layout-contract-state");

type LayoutContractRenderState = {
  projects: StudioProject[];
  selectedProjectId: string;
  flows: StudioFlowRef[];
  selectedFlowId: string;
  currentFlow: FlowDocument;
  selectedEnvironmentName: string;
  baseUrlDraft: string;
  storageStatePathDraft: string;
  variableInputs: VariableInputs;
};

function readLayoutContractRenderState(): LayoutContractRenderState | undefined {
  if (import.meta.env.MODE !== "test") {
    return undefined;
  }

  const testGlobal = globalThis as typeof globalThis & {
    [LAYOUT_CONTRACT_STATE_KEY]?: LayoutContractRenderState;
  };

  return testGlobal[LAYOUT_CONTRACT_STATE_KEY];
}

export function App() {
  const layoutContractRenderState = readLayoutContractRenderState();
  const nativeFilePortability = readNativeFilePortability();
  const nativeExecutionDeletion = readNativeExecutionDeletion();
  const nativeExecutionScreenshotPreview = readNativeExecutionScreenshotPreview();
  const [tab, setTab] = useState<MainTab>("flow");
  const [projects, setProjects] = useState<StudioProject[]>(
    layoutContractRenderState?.projects ?? [],
  );
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    layoutContractRenderState?.selectedProjectId ?? null,
  );
  const [flows, setFlows] = useState<StudioFlowRef[]>(layoutContractRenderState?.flows ?? []);
  const [selectedFlowId, setSelectedFlowId] = useState<string | null>(
    layoutContractRenderState?.selectedFlowId ?? null,
  );
  const [versions, setVersions] = useState<StudioFlowVersion[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [previewVersion, setPreviewVersion] = useState<FlowDocument | null>(null);
  const [currentFlow, setCurrentFlow] = useState<FlowDocument | null>(
    layoutContractRenderState?.currentFlow ?? null,
  );
  const [flowLoading, setFlowLoading] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [executionHistory, setExecutionHistory] = useState<ExecutionSummary[]>([]);
  const [execution, setExecution] = useState<StudioExecution | null>(null);
  const [selectedExecutionId, setSelectedExecutionId] = useState<string | null>(null);
  const [deletionTarget, setDeletionTarget] = useState<ExecutionSummary | null>(null);
  const [deletionBusy, setDeletionBusy] = useState(false);
  const [deletionError, setDeletionError] = useState<string | null>(null);
  const [deletionNotice, setDeletionNotice] = useState<string | null>(null);
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
  const [refreshing, setRefreshing] = useState(false);
  const [refreshNotice, setRefreshNotice] = useState<string | null>(null);
  const [selectedEnvironmentName, setSelectedEnvironmentName] = useState(
    layoutContractRenderState?.selectedEnvironmentName ?? "",
  );
  const [baseUrlDraft, setBaseUrlDraft] = useState(layoutContractRenderState?.baseUrlDraft ?? "");
  const [storageStatePathDraft, setStorageStatePathDraft] = useState(
    layoutContractRenderState?.storageStatePathDraft ?? "",
  );
  const [variableInputs, setVariableInputs] = useState<VariableInputs>(
    layoutContractRenderState?.variableInputs ?? {},
  );
  const [selectedDiagnosticStepIndex, setSelectedDiagnosticStepIndex] = useState<number | null>(
    null,
  );
  const [pendingRunSummary, setPendingRunSummary] = useState<RunConfirmationSummary | null>(null);
  const [riskAcknowledged, setRiskAcknowledged] = useState(false);
  const [executionProgress, setExecutionProgress] = useState<ExecutionProgressState | null>(null);
  const [runStartedAt, setRunStartedAt] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [cancelling, setCancelling] = useState(false);
  const [portabilityBusy, setPortabilityBusy] = useState<"import" | "export" | null>(null);
  const [portabilityNotice, setPortabilityNotice] = useState<string | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<ScreenshotPreviewState | null>(null);
  const previousDraftFlowIdRef = useRef<string | null>(null);
  const selectedProjectIdRef = useRef(selectedProjectId);
  const selectedFlowIdRef = useRef(selectedFlowId);
  const flowLoadRequestIdRef = useRef(0);
  const portabilityRequestIdRef = useRef(0);
  const flowSelectionRevisionRef = useRef(0);
  const executionHistoryRequestIdRef = useRef(0);
  const executionDetailRequestIdRef = useRef(0);
  const versionListRequestIdRef = useRef(0);
  const versionDetailRequestIdRef = useRef(0);
  const deletionRequestIdRef = useRef(0);
  const workspaceRefreshRequestIdRef = useRef(0);
  const selectedExecutionIdRef = useRef(selectedExecutionId);
  const selectedVersionIdRef = useRef(selectedVersionId);
  const deletionTriggerRef = useRef<HTMLElement | null>(null);
  const screenshotPreviewGenerationRef = useRef(0);
  const screenshotPreviewBlobUrlRef = useRef<string | null>(null);
  selectedProjectIdRef.current = selectedProjectId;
  selectedFlowIdRef.current = selectedFlowId;
  selectedExecutionIdRef.current = selectedExecutionId;
  selectedVersionIdRef.current = selectedVersionId;

  const revokeScreenshotPreviewBlobUrl = useCallback(() => {
    const blobUrl = screenshotPreviewBlobUrlRef.current;
    screenshotPreviewBlobUrlRef.current = null;
    if (blobUrl) {
      URL.revokeObjectURL(blobUrl);
    }
  }, []);

  const closeScreenshotPreview = useCallback(() => {
    screenshotPreviewGenerationRef.current += 1;
    revokeScreenshotPreviewBlobUrl();
    setScreenshotPreview(null);
  }, [revokeScreenshotPreviewBlobUrl]);

  useEffect(() => {
    screenshotPreviewGenerationRef.current += 1;
    revokeScreenshotPreviewBlobUrl();
    setScreenshotPreview(null);
  }, [selectedProjectId, selectedFlowId, selectedExecutionId, revokeScreenshotPreviewBlobUrl]);

  useEffect(
    () => () => {
      screenshotPreviewGenerationRef.current += 1;
      revokeScreenshotPreviewBlobUrl();
    },
    [revokeScreenshotPreviewBlobUrl],
  );

  useEffect(() => {
    const api = getStudioApi();
    if (!api.onExecutionProgress) {
      return;
    }
    return api.onExecutionProgress((event) => {
      setExecutionProgress((previous) => {
        const current =
          previous && previous.executionId === event.executionId
            ? previous
            : createExecutionProgressState(event.executionId);
        return reduceExecutionProgress(current, event);
      });
    });
  }, []);

  useEffect(() => {
    if (!loading || runStartedAt === null) {
      return;
    }
    const updateElapsed = () => {
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - runStartedAt) / 1000)));
    };
    updateElapsed();
    const timer = window.setInterval(updateElapsed, 1000);
    return () => window.clearInterval(timer);
  }, [loading, runStartedAt]);

  useEffect(() => {
    setPendingRunSummary(null);
    setRiskAcknowledged(false);
  }, [selectedProjectId, selectedFlowId]);

  const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? null;
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
    const requestId = ++executionHistoryRequestIdRef.current;
    const api = getStudioApi();
    const history = await api.listExecutions(projectId);
    if (
      requestId !== executionHistoryRequestIdRef.current ||
      selectedProjectIdRef.current !== projectId
    ) {
      return [];
    }
    setExecutionHistory(history);
    return history;
  }, []);

  const refreshFlows = useCallback(
    async (projectId: string) => {
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
      const flowId =
        selectedFlowId && list.some((it) => it.id === selectedFlowId) ? selectedFlowId : fallback;
      setSelectedFlowId(flowId);
    },
    [selectedFlowId],
  );

  const refreshVersions = useCallback(async (projectId: string, flowId: string) => {
    const requestId = ++versionListRequestIdRef.current;
    const api = getStudioApi();
    const list = await api.listFlowVersions(projectId, flowId);
    if (
      requestId !== versionListRequestIdRef.current ||
      selectedProjectIdRef.current !== projectId ||
      selectedFlowIdRef.current !== flowId
    ) {
      return;
    }
    setVersions(list);
    setSelectedVersionId(null);
    selectedVersionIdRef.current = null;
    setPreviewVersion(null);
  }, []);

  const refreshWorkspace = useCallback(async () => {
    if (refreshing) {
      return;
    }

    const requestId = ++workspaceRefreshRequestIdRef.current;
    const selectionRevision = flowSelectionRevisionRef.current;
    setRefreshing(true);
    setRefreshNotice(null);
    try {
      const api = getStudioApi();
      const projectList = await api.listProjects();
      if (
        requestId !== workspaceRefreshRequestIdRef.current ||
        selectionRevision !== flowSelectionRevisionRef.current
      )
        return;
      const targetProjectId =
        selectedProjectId && projectList.some((project) => project.id === selectedProjectId)
          ? selectedProjectId
          : (projectList[0]?.id ?? null);
      setProjects(projectList);

      if (targetProjectId !== selectedProjectId) {
        flowSelectionRevisionRef.current += 1;
        flowLoadRequestIdRef.current += 1;
        executionHistoryRequestIdRef.current += 1;
        executionDetailRequestIdRef.current += 1;
        versionListRequestIdRef.current += 1;
        versionDetailRequestIdRef.current += 1;
        selectedProjectIdRef.current = targetProjectId;
        selectedFlowIdRef.current = null;
        selectedExecutionIdRef.current = null;
        selectedVersionIdRef.current = null;
        setSelectedProjectId(targetProjectId);
        setSelectedFlowId(null);
        setSelectedExecutionId(null);
        setSelectedVersionId(null);
        setFlows([]);
        setExecutionHistory([]);
        setExecution(null);
        setCurrentFlow(null);
        setVersions([]);
        setPreviewVersion(null);
        setDeletionTarget(null);
        setRefreshNotice(targetProjectId ? "已切换到仍然存在的项目" : "项目列表已刷新");
        setError(null);
        return;
      }

      selectedProjectIdRef.current = targetProjectId;
      setSelectedProjectId(targetProjectId);

      if (!targetProjectId) {
        setFlows([]);
        setExecutionHistory([]);
        setSelectedFlowId(null);
        setCurrentFlow(null);
        setVersions([]);
        setRefreshNotice("项目列表已刷新");
        setError(null);
        return;
      }

      const [nextFlows, history] = await Promise.all([
        api.listFlows(targetProjectId),
        api.listExecutions(targetProjectId),
      ]);
      if (
        requestId !== workspaceRefreshRequestIdRef.current ||
        selectionRevision !== flowSelectionRevisionRef.current ||
        selectedProjectIdRef.current !== targetProjectId
      )
        return;
      const previousFlows = targetProjectId === selectedProjectId ? flows : [];
      const nextSelectedFlowId = resolveRefreshedFlowSelection(
        previousFlows,
        nextFlows,
        targetProjectId === selectedProjectId ? selectedFlowId : null,
        true,
      );
      const previousIds = new Set(previousFlows.map((flow) => flow.id));
      const discovered = nextFlows.find((flow) => !previousIds.has(flow.id));
      const flowChanged = nextSelectedFlowId !== selectedFlowId;

      if (flowChanged) {
        flowSelectionRevisionRef.current += 1;
        flowLoadRequestIdRef.current += 1;
        executionDetailRequestIdRef.current += 1;
        versionListRequestIdRef.current += 1;
        versionDetailRequestIdRef.current += 1;
        selectedExecutionIdRef.current = null;
        selectedVersionIdRef.current = null;
        setSelectedExecutionId(null);
        setSelectedVersionId(null);
        setExecution(null);
        setCurrentFlow(null);
        setVersions([]);
        setPreviewVersion(null);
      }

      setFlows(nextFlows);
      setExecutionHistory(history);
      selectedFlowIdRef.current = nextSelectedFlowId;
      setSelectedFlowId(nextSelectedFlowId);
      if (nextFlows.length === 0) {
        setCurrentFlow(null);
        setVersions([]);
      }
      setRefreshNotice(discovered ? `已发现新任务「${discovered.name}」` : "已刷新当前项目");
      setError(null);
    } catch (err: unknown) {
      if (requestId === workspaceRefreshRequestIdRef.current) {
        setError(formatStudioError(err));
      }
    } finally {
      if (requestId === workspaceRefreshRequestIdRef.current) {
        setRefreshing(false);
      }
    }
  }, [flows, refreshing, selectedFlowId, selectedProjectId]);

  const loadFlowDocument = useCallback(async (projectId: string, flowId: string) => {
    const requestId = ++flowLoadRequestIdRef.current;
    setFlowLoading(true);
    setError(null);
    try {
      const api = getStudioApi();
      const doc = await api.getFlow(projectId, flowId);
      if (
        requestId !== flowLoadRequestIdRef.current ||
        selectedProjectIdRef.current !== projectId ||
        selectedFlowIdRef.current !== flowId
      ) {
        return;
      }
      setCurrentFlow(doc);
    } catch (err: unknown) {
      if (
        requestId !== flowLoadRequestIdRef.current ||
        selectedProjectIdRef.current !== projectId ||
        selectedFlowIdRef.current !== flowId
      ) {
        return;
      }
      const message = formatStudioError(err);
      if (isFlowNotFoundMessage(message)) {
        setCurrentFlow(null);
        setSelectedFlowId(null);
        return;
      }
      setCurrentFlow(null);
      setError(message);
    } finally {
      if (requestId === flowLoadRequestIdRef.current) {
        setFlowLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void refreshProjects().catch((err: unknown) => {
      setError(formatStudioError(err));
    });
  }, [refreshProjects]);

  useEffect(() => {
    return registerWindowFocusRefresh(window, () => {
      void refreshWorkspace();
    });
  }, [refreshWorkspace]);

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
    const projectId = selectedProjectId;
    void refreshExecutionHistory(projectId).catch((err: unknown) => {
      if (selectedProjectIdRef.current === projectId) {
        setError(formatStudioError(err));
      }
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
    const projectId = selectedProjectId;
    const flowId = selectedFlowId;
    void refreshVersions(projectId, flowId).catch((err: unknown) => {
      if (selectedProjectIdRef.current === projectId && selectedFlowIdRef.current === flowId) {
        setError(formatStudioError(err));
      }
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
      execution.steps.find((step) => step.hasDiagnostic || step.diagnostic) ??
      execution.steps.find((step) => step.hasPageSnapshot || step.pageSnapshot);
    setSelectedDiagnosticStepIndex(firstDiagnosticStep?.stepIndex ?? null);
  }, [execution?.executionId, execution]);

  const loadExecution = async (executionId: string) => {
    const projectId = selectedProjectIdRef.current;
    const flowId = selectedFlowIdRef.current;
    const selectionRevision = flowSelectionRevisionRef.current;
    const requestId = ++executionDetailRequestIdRef.current;
    const api = getStudioApi();
    const detail = await api.getExecution(executionId);
    if (
      requestId !== executionDetailRequestIdRef.current ||
      selectedExecutionIdRef.current !== executionId ||
      selectedProjectIdRef.current !== projectId ||
      selectedFlowIdRef.current !== flowId ||
      flowSelectionRevisionRef.current !== selectionRevision ||
      (detail !== null && (detail.projectId !== projectId || detail.flowId !== flowId))
    ) {
      return null;
    }
    setExecution(detail);
    return detail;
  };

  const handleSelectFlow = (flowId: string) => {
    if (renamingFlowId) {
      return;
    }
    flowSelectionRevisionRef.current += 1;
    flowLoadRequestIdRef.current += 1;
    executionDetailRequestIdRef.current += 1;
    versionDetailRequestIdRef.current += 1;
    selectedFlowIdRef.current = flowId;
    setPortabilityNotice(null);
    setSelectedFlowId(flowId);
    selectedVersionIdRef.current = null;
    setSelectedVersionId(null);
    setPreviewVersion(null);
    selectedExecutionIdRef.current = null;
    setSelectedExecutionId(null);
    setExecution(null);
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
      setError("任务名称不能为空");
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
    flowSelectionRevisionRef.current += 1;
    versionListRequestIdRef.current += 1;
    versionDetailRequestIdRef.current += 1;
    selectedFlowIdRef.current = flowId;
    selectedExecutionIdRef.current = executionId;
    selectedVersionIdRef.current = null;
    setSelectedFlowId(flowId);
    setSelectedExecutionId(executionId);
    setSelectedVersionId(null);
    setPreviewVersion(null);
    setExecution(null);
    setTab("executions");
    void loadExecution(executionId);
  };

  const handleSelectProject = (projectId: string) => {
    portabilityRequestIdRef.current += 1;
    workspaceRefreshRequestIdRef.current += 1;
    flowSelectionRevisionRef.current += 1;
    flowLoadRequestIdRef.current += 1;
    executionHistoryRequestIdRef.current += 1;
    executionDetailRequestIdRef.current += 1;
    versionListRequestIdRef.current += 1;
    versionDetailRequestIdRef.current += 1;
    selectedProjectIdRef.current = projectId;
    selectedFlowIdRef.current = null;
    setPortabilityBusy(null);
    setFlowLoading(false);
    setRefreshing(false);
    setSelectedProjectId(projectId);
    setSelectedFlowId(null);
    setCurrentFlow(null);
    setVersions([]);
    selectedVersionIdRef.current = null;
    setSelectedVersionId(null);
    setPreviewVersion(null);
    setError(null);
    setExecution(null);
    selectedExecutionIdRef.current = null;
    setSelectedExecutionId(null);
    setDeletionTarget(null);
    setDeletionNotice(null);
    setSelectedEnvironmentName("");
    setBaseUrlDraft("");
    setStorageStatePathDraft("");
    setVariableInputs({});
    setPortabilityNotice(null);
    setTab("flow");
  };

  const handleImportFlowFile = async () => {
    if (!selectedProjectId || portabilityBusy) {
      return;
    }
    const projectId = selectedProjectId;
    const requestId = ++portabilityRequestIdRef.current;
    const selectionRevision = flowSelectionRevisionRef.current;
    setPortabilityBusy("import");
    setError(null);
    setPortabilityNotice(null);
    try {
      const api = getStudioApi();
      const result = await api.importFlowFile(projectId);
      if (result.status === "cancelled") {
        return;
      }
      if (
        requestId !== portabilityRequestIdRef.current ||
        selectedProjectIdRef.current !== projectId
      ) {
        return;
      }
      setFlows((previous) => [
        {
          id: result.flow.id,
          name: result.flow.name,
          createdAt: result.flow.meta.createdAt,
        },
        ...previous.filter((flow) => flow.id !== result.flow.id),
      ]);
      const nextFlows = await api.listFlows(projectId);
      if (
        requestId !== portabilityRequestIdRef.current ||
        selectedProjectIdRef.current !== projectId
      ) {
        return;
      }
      setFlows(nextFlows);
      if (flowSelectionRevisionRef.current !== selectionRevision) {
        return;
      }
      flowLoadRequestIdRef.current += 1;
      selectedFlowIdRef.current = result.flow.id;
      setSelectedFlowId(result.flow.id);
      setCurrentFlow(result.flow);
      setVersions([]);
      setPreviewVersion(null);
      setTab("flow");
      setPortabilityNotice(
        `已导入「${result.flow.name}」，产生 ${result.warnings.length} 条安全处理提醒。请补齐运行所需输入，并检查业务文本是否符合预期。`,
      );
    } catch (err: unknown) {
      if (
        requestId === portabilityRequestIdRef.current &&
        selectedProjectIdRef.current === projectId
      ) {
        setError(formatStudioError(err));
      }
    } finally {
      if (requestId === portabilityRequestIdRef.current) {
        setPortabilityBusy(null);
      }
    }
  };

  const handleExportFlowFile = async () => {
    if (!selectedProjectId || !selectedFlowId || portabilityBusy) {
      return;
    }
    const projectId = selectedProjectId;
    const flowId = selectedFlowId;
    const requestId = ++portabilityRequestIdRef.current;
    setPortabilityBusy("export");
    setError(null);
    setPortabilityNotice(null);
    try {
      const result = await getStudioApi().exportFlowFile(projectId, flowId);
      if (result.status === "cancelled") {
        return;
      }
      if (
        requestId !== portabilityRequestIdRef.current ||
        selectedProjectIdRef.current !== projectId ||
        selectedFlowIdRef.current !== flowId
      ) {
        return;
      }
      setPortabilityNotice(
        `已导出「${selectedFlowName}」，包含 ${result.warnings.length} 条安全处理提醒。导出仅处理可识别的敏感字段，请检查业务文本。`,
      );
    } catch (err: unknown) {
      if (requestId === portabilityRequestIdRef.current) {
        setError(formatStudioError(err));
      }
    } finally {
      if (requestId === portabilityRequestIdRef.current) {
        setPortabilityBusy(null);
      }
    }
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

  const handlePrepareRun = () => {
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
      setError(`运行前检查未通过：${preflightIssues.map((issue) => issue.message).join("；")}`);
      return;
    }

    setRiskAcknowledged(false);
    setPendingRunSummary(
      buildRunConfirmationSummary(currentFlow, {
        environmentName: selectedEnvironmentName || "默认环境",
        baseUrl: baseUrlDraft,
      }),
    );
  };

  const handleRun = async () => {
    if (!selectedProjectId || !selectedFlowId || !currentFlow) {
      return;
    }
    const preflightIssues = collectRunPreflightIssues(currentFlow, {
      baseUrl: baseUrlDraft,
      storageStatePath: storageStatePathDraft,
      variables: variableInputs,
    });
    if (preflightIssues.length > 0) {
      setPendingRunSummary(null);
      setError(`运行前检查未通过：${preflightIssues.map((issue) => issue.message).join("；")}`);
      return;
    }

    setPendingRunSummary(null);
    setLoading(true);
    setCancelling(false);
    setElapsedSeconds(0);
    setRunStartedAt(Date.now());
    setExecutionProgress(createExecutionProgressState("pending"));
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
      setExecutionProgress((previous) =>
        finalizeExecutionProgress(
          previous ?? createExecutionProgressState(result.executionId),
          result,
          currentFlow.steps.length,
        ),
      );
      const detail = await api.getExecution(result.executionId);
      selectedExecutionIdRef.current = result.executionId;
      setSelectedExecutionId(result.executionId);
      setExecution(detail);
      setTab("executions");
      setExecutionsExpanded(true);
      await refreshExecutionHistory(selectedProjectId);
      await loadFlowDocument(selectedProjectId, selectedFlowId);
    } catch (err: unknown) {
      setError(formatStudioError(err));
      setExecutionProgress((previous) =>
        previous
          ? failExecutionProgressUnlessTerminal(previous, "运行未完成，请查看错误提示")
          : previous,
      );
    } finally {
      setLoading(false);
      setRunStartedAt(null);
      setCancelling(false);
    }
  };

  const handleCancelRun = async () => {
    const executionId = executionProgress?.executionId;
    const api = getStudioApi();
    if (!executionId || executionId === "pending" || !api.cancelExecution) {
      return;
    }
    setCancelling(true);
    setError(null);
    try {
      const result = await api.cancelExecution(executionId);
      if (!result.accepted && !result.alreadyCancelled) {
        setError("当前任务已结束，无法再取消运行");
      }
    } catch (err: unknown) {
      setError(formatStudioError(err));
      setCancelling(false);
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

  const steps: StepLogRow[] = (execution?.steps ?? []).map((step) => {
    const insight = buildFailureInsight(step);

    return {
      stepIndex: step.stepIndex,
      stepId: step.stepId,
      label: step.label,
      status: step.status,
      message: step.message,
      durationMs: step.durationMs,
      startedAt: step.startedAt,
      finishedAt: step.finishedAt,
      hasScreenshot: step.hasScreenshot,
      hasDiagnostic: step.hasDiagnostic,
      hasPageSnapshot: step.hasPageSnapshot,
      insightCategoryLabel: insight?.categoryLabel,
      insightTitle: insight?.title,
      insightSummary: insight?.summary,
      pageSummary: insight?.pageSummary,
      artifacts: insight?.artifacts,
    };
  });

  const diagnosticSteps: ExecutionStepLog[] = (execution?.steps ?? []).filter(
    (step) => step.hasDiagnostic || step.hasPageSnapshot || step.diagnostic || step.pageSnapshot,
  );
  const executionCompatibilityWarnings = execution
    ? buildExecutionCompatibilityWarnings({
        flowSnapshot: execution.flowSnapshot,
        runContext: execution.runContext,
      })
    : [];

  const previewExecutionScreenshot = async (step: Pick<ExecutionStepLog, "stepIndex" | "label">) => {
    const projectId = selectedProjectIdRef.current;
    const executionId = selectedExecutionIdRef.current;
    const flowId = selectedFlowIdRef.current;
    const api = getStudioApi();
    if (
      !nativeExecutionScreenshotPreview ||
      !projectId ||
      !executionId ||
      execution?.executionId !== executionId
    ) {
      return;
    }

    const generation = ++screenshotPreviewGenerationRef.current;
    const isCurrentPreviewRequest = () =>
      generation === screenshotPreviewGenerationRef.current &&
      selectedProjectIdRef.current === projectId &&
      selectedFlowIdRef.current === flowId &&
      selectedExecutionIdRef.current === executionId;
    revokeScreenshotPreviewBlobUrl();
    setScreenshotPreview({
      status: "loading",
      blobUrl: null,
      stepIndex: step.stepIndex,
      stepLabel: step.label,
    });

    try {
      const result = await api.getExecutionScreenshotPreview({
        projectId,
        executionId,
        stepIndex: step.stepIndex,
      });
      if (result.status === "absent") {
        if (!isCurrentPreviewRequest()) return;
        setScreenshotPreview({
          status: "unavailable",
          blobUrl: null,
          stepIndex: step.stepIndex,
          stepLabel: step.label,
        });
        return;
      }

      if (!isCurrentPreviewRequest()) return;

      const bytes = new Uint8Array(result.bytes);
      const blobUrl = URL.createObjectURL(new Blob([bytes], { type: "image/png" }));
      if (!isCurrentPreviewRequest()) {
        URL.revokeObjectURL(blobUrl);
        return;
      }
      screenshotPreviewBlobUrlRef.current = blobUrl;
      setScreenshotPreview({
        status: "available",
        blobUrl,
        stepIndex: step.stepIndex,
        stepLabel: step.label,
      });
    } catch (err: unknown) {
      if (!isCurrentPreviewRequest()) {
        return;
      }
      setScreenshotPreview({
        status: "unavailable",
        blobUrl: null,
        stepIndex: step.stepIndex,
        stepLabel: step.label,
        unavailableMessage: formatStudioError(err),
      });
    }
  };

  const inspectDiagnostic = (step: StepLogRow) => {
    setSelectedDiagnosticStepIndex(step.stepIndex);
  };

  const loadVersion = async (versionId: string) => {
    if (!selectedProjectId || !selectedFlowId) return;
    const projectId = selectedProjectId;
    const flowId = selectedFlowId;
    const requestId = ++versionDetailRequestIdRef.current;
    setSelectedVersionId(versionId);
    selectedVersionIdRef.current = versionId;
    setPreviewVersion(null);
    setError(null);
    const api = getStudioApi();
    try {
      const detail = await api.getFlowVersion(projectId, versionId);
      if (
        !isCurrentVersionRequest({
          requestId,
          latestRequestId: versionDetailRequestIdRef.current,
          projectId,
          selectedProjectId: selectedProjectIdRef.current,
          flowId,
          selectedFlowId: selectedFlowIdRef.current,
          versionId,
          selectedVersionId: selectedVersionIdRef.current,
        })
      ) {
        return;
      }
      if (detail && detail.id !== flowId) {
        throw new Error("历史版本与当前任务不匹配，已拒绝展示");
      }
      setPreviewVersion(detail ? createPortableFlowDocument(detail).document : null);
    } catch (err: unknown) {
      if (
        requestId === versionDetailRequestIdRef.current &&
        selectedProjectIdRef.current === projectId &&
        selectedFlowIdRef.current === flowId
      ) {
        setPreviewVersion(null);
        setError(formatStudioError(err));
      }
    }
  };

  const openDeletionConfirmation = (item: ExecutionSummary, trigger: HTMLElement) => {
    if (!nativeExecutionDeletion) return;
    deletionTriggerRef.current = trigger;
    setDeletionError(null);
    setDeletionTarget(item);
  };

  const closeDeletionConfirmation = () => {
    if (deletionBusy) return;
    setDeletionTarget(null);
    setDeletionError(null);
  };

  const handleDeleteExecution = async () => {
    const api = getStudioApi();
    if (!selectedProjectId || !deletionTarget || !api.deleteExecution || deletionBusy) return;
    const projectId = selectedProjectId;
    const target = deletionTarget;
    const previous = executionHistory;
    const previousSelection = selectedExecutionIdRef.current;
    const requestId = ++deletionRequestIdRef.current;
    setDeletionBusy(true);
    setDeletionError(null);
    setDeletionNotice(null);
    try {
      const result = await api.deleteExecution(projectId, target.executionId);
      if (requestId !== deletionRequestIdRef.current || selectedProjectIdRef.current !== projectId)
        return;
      if (!isMatchingExecutionDeletionResult(result, projectId, target.executionId)) {
        throw new Error("删除结果与请求不匹配，已拒绝刷新界面状态");
      }
      const refreshed = await api.listExecutions(projectId);
      if (requestId !== deletionRequestIdRef.current || selectedProjectIdRef.current !== projectId)
        return;
      executionHistoryRequestIdRef.current += 1;
      setExecutionHistory(refreshed);
      const nextSelection = resolveExecutionSelectionAfterDeletion(
        previous,
        refreshed,
        target.executionId,
        previousSelection,
      );
      setDeletionTarget(null);
      if (result.status === "deleted" && result.artifacts === "quarantined") {
        setDeletionNotice("运行记录已删除；部分产物已安全隔离在本地回收区，可稍后检查。");
      } else if (result.status === "already-absent") {
        setDeletionNotice("该运行记录已不存在，列表已刷新。");
      } else {
        setDeletionNotice("运行记录及其受控产物已删除。");
      }
      if (previousSelection === target.executionId) {
        selectedExecutionIdRef.current = nextSelection;
        setSelectedExecutionId(nextSelection);
        setExecution(null);
        if (nextSelection) {
          const next = refreshed.find((item) => item.executionId === nextSelection);
          if (next) {
            flowSelectionRevisionRef.current += 1;
            selectedFlowIdRef.current = next.flowId;
            setSelectedFlowId(next.flowId);
            void loadExecution(next.executionId);
          }
        }
      }
    } catch (err: unknown) {
      if (
        requestId === deletionRequestIdRef.current &&
        selectedProjectIdRef.current === projectId
      ) {
        setDeletionError(formatStudioError(err));
      }
    } finally {
      if (requestId === deletionRequestIdRef.current) setDeletionBusy(false);
    }
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
  const portableCurrentFlow = currentFlow ? createPortableFlowDocument(currentFlow).document : null;
  const versionDiff =
    previewVersion && portableCurrentFlow
      ? createJsonDiff(previewVersion, portableCurrentFlow)
      : null;

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1>{APP_DISPLAY_NAME} Studio</h1>
          <p>录制、运行并查看自动化任务结果</p>
        </div>
        <div className="sidebar-scroll">
          <section className="sidebar-section sidebar-section-projects">
            <div className="sidebar-section-head">
              <h2>项目</h2>
              <div className="sidebar-section-actions">
                <button
                  type="button"
                  className="sidebar-text-btn"
                  aria-label="刷新当前项目"
                  title="刷新项目和任务"
                  disabled={refreshing}
                  onClick={() => void refreshWorkspace()}
                >
                  {refreshing ? "刷新中…" : "刷新"}
                </button>
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
                      project.id === selectedProjectId ? "project-item active" : "project-item"
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

          {selectedProjectId ? (
            <section className="sidebar-section sidebar-section-primary">
              <div className="sidebar-section-head">
                <h2>自动化任务</h2>
                {nativeFilePortability ? (
                  <button
                    type="button"
                    className="sidebar-text-btn"
                    disabled={portabilityBusy !== null}
                    onClick={() => void handleImportFlowFile()}
                  >
                    {portabilityBusy === "import" ? "导入中…" : "导入 JSON"}
                  </button>
                ) : null}
              </div>
              {refreshNotice ? (
                <p className="sidebar-refresh-notice" role="status">
                  {refreshNotice}
                </p>
              ) : null}
              {flows.length === 0 ? (
                <p className="execution-history-empty sidebar-flow-hint">
                  本项目尚无自动化任务。请打开浏览器扩展开始录制，完成后保存到
                  <strong>同名项目</strong>。
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
                <span>最近运行记录</span>
                <span className="sidebar-section-toggle-meta">
                  {executionHistory.length > 0 ? `${executionHistory.length} 条` : "无"}
                  <span className="sidebar-chevron">{executionsExpanded ? "▾" : "▸"}</span>
                </span>
              </button>
              {executionsExpanded ? (
                executionHistory.length === 0 ? (
                  <p className="execution-history-empty">暂无运行记录</p>
                ) : (
                  <>
                    <ul className="execution-history-list">
                      {executionHistory.map((item) => (
                        <li key={item.executionId} className="execution-history-row">
                          <button
                            type="button"
                            className={
                              selectedExecutionId === item.executionId
                                ? "execution-history-item active"
                                : "execution-history-item"
                            }
                            onClick={() => handleSelectExecution(item.executionId, item.flowId)}
                          >
                            <span className="execution-history-id">
                              {flows.find((flow) => flow.id === item.flowId)?.name ?? "自动化任务"}
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
                              {formatBusinessExecutionStatus(item.status)} ·{" "}
                              {formatExecutionTime(item.startedAt)}
                            </span>
                          </button>
                          {nativeExecutionDeletion ? (
                            <button
                              type="button"
                              className="execution-history-delete"
                              aria-label={`删除 ${flows.find((flow) => flow.id === item.flowId)?.name ?? "自动化任务"} 的运行记录`}
                              title="删除运行记录"
                              onClick={(event) =>
                                openDeletionConfirmation(item, event.currentTarget)
                              }
                            >
                              删除
                            </button>
                          ) : null}
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
        <nav className="workspace-breadcrumb" aria-label="当前位置">
          <span>{selectedProjectName ?? "未选择项目"}</span>
          <span aria-hidden="true">›</span>
          <span>{selectedFlowId ? selectedFlowName : "未选择自动化任务"}</span>
          <span aria-hidden="true">›</span>
          <strong>
            {tab === "flow" ? "任务步骤" : tab === "executions" ? "运行记录" : "版本记录"}
          </strong>
        </nav>
        <ViewSwitcher value={tab} onChange={setTab} />
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}
        {portabilityNotice ? (
          <p className="portability-notice" role="status">
            {portabilityNotice}
          </p>
        ) : null}
        {deletionNotice ? (
          <p className="portability-notice" role="status">
            {deletionNotice}
          </p>
        ) : null}
        {selectedProjectId && currentFlow ? (
          <section className="run-workspace" aria-labelledby="run-workspace-title">
            <header className="run-workspace-header">
              <div>
                <p className="business-eyebrow">当前自动化任务</p>
                <h2 id="run-workspace-title">{currentFlow.name}</h2>
              </div>
              <div className="run-workspace-actions">
                {nativeFilePortability ? (
                  <button
                    type="button"
                    className="run-secondary-btn"
                    disabled={portabilityBusy !== null}
                    onClick={() => void handleExportFlowFile()}
                  >
                    {portabilityBusy === "export" ? "导出中…" : "导出 JSON"}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="run-primary-btn"
                  disabled={loading || projectHasNoFlows}
                  onClick={handlePrepareRun}
                >
                  {loading ? "运行中…" : "运行任务"}
                </button>
              </div>
            </header>

            <dl className="task-facts">
              <div>
                <dt>目标站点</dt>
                <dd>{baseUrlDraft || selectedProject?.baseUrl || "使用任务中的网页地址"}</dd>
              </div>
              <div>
                <dt>步骤</dt>
                <dd>{currentFlow.steps.length} 个</dd>
              </div>
              <div>
                <dt>最近结果</dt>
                <dd>
                  {executionHistory.find((item) => item.flowId === currentFlow.id)
                    ? formatBusinessExecutionStatus(
                        executionHistory.find((item) => item.flowId === currentFlow.id)!.status,
                      )
                    : "尚未运行"}
                </dd>
              </div>
            </dl>

            {executionProgress ? (
              <ExecutionProgressPanel
                progress={executionProgress}
                elapsedSeconds={elapsedSeconds}
                canCancel={Boolean(
                  loading &&
                  executionProgress.executionId !== "pending" &&
                  getStudioApi().cancelExecution,
                )}
                cancelling={cancelling}
                onCancel={() => void handleCancelRun()}
              />
            ) : null}

            <section className="necessary-parameters" aria-labelledby="necessary-parameters-title">
              <h3 id="necessary-parameters-title">必要参数</h3>
              {currentFlow.variables.length > 0 ? (
                <div className="parameter-grid">
                  {currentFlow.variables.map((variable) => (
                    <label key={variable.name}>
                      <span>
                        {variable.name}
                        {variable.required ? "（必填）" : "（可选）"}
                      </span>
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
                          <option value="true">是</option>
                          <option value="false">否</option>
                        </select>
                      ) : (
                        <input
                          type={
                            isSensitiveVariableName(variable.name)
                              ? "password"
                              : variable.type === "number"
                                ? "number"
                                : "text"
                          }
                          autoComplete={
                            isSensitiveVariableName(variable.name) ? "current-password" : undefined
                          }
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
                <p className="execution-history-empty">该任务无需填写参数，可以直接运行。</p>
              )}
            </section>

            <details className="advanced-settings">
              <summary>高级设置</summary>
              <div className="advanced-settings-content">
                <label>
                  运行环境
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
                <label className="run-option" title="开启后会显示浏览器窗口">
                  <input
                    type="checkbox"
                    checked={showBrowser}
                    disabled={loading}
                    onChange={(event) => {
                      const next = event.target.checked;
                      setShowBrowser(next);
                      try {
                        localStorage.setItem(SHOW_BROWSER_STORAGE_KEY, next ? "1" : "0");
                      } catch {
                        // 本地偏好不可写时仍允许继续运行。
                      }
                    }}
                  />
                  显示浏览器窗口
                </label>
                <p className="execution-history-meta">
                  {selectedEnvironment
                    ? `当前环境：${selectedEnvironment.name}`
                    : "当前项目未配置默认环境，将使用任务中的完整网页地址。"}
                </p>
                <section className="preflight-details">
                  <h3>preflight 检查</h3>
                  {runPreflightIssues.length > 0 ? (
                    <ul>
                      {runPreflightIssues.map((issue) => (
                        <li key={`${issue.code}-${issue.field}`}>{issue.message}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>本地 preflight 已通过；运行时还会检查 Storage State 文件。</p>
                  )}
                </section>
              </div>
            </details>
          </section>
        ) : null}
        {tab === "flow" ? (
          <section className="flow-content-panel">
            {projectHasNoFlows ? (
              <FlowEmptyGuide projectName={selectedProjectName} />
            ) : flowLoading ? (
              <p className="execution-history-empty">正在加载自动化任务…</p>
            ) : currentFlow ? (
              <>
                <header className="flow-content-header">
                  <p className="business-eyebrow">任务步骤</p>
                  <h2>{currentFlow.name}</h2>
                </header>
                {currentFlow.steps.length === 0 ? (
                  <p className="flow-steps-empty-hint">
                    该任务已保存但<strong>没有录制步骤</strong>。请在浏览器扩展中重新录制后保存。
                  </p>
                ) : (
                  <ol className="business-step-list">
                    {flowStepRows.map((step) => (
                      <li key={step.stepId}>
                        <span className="business-step-number">{step.stepIndex + 1}</span>
                        <span>{step.summary}</span>
                      </li>
                    ))}
                  </ol>
                )}
                <details className="professional-diagnostics">
                  <summary>专业诊断</summary>
                  <div className="professional-diagnostics-content">
                    <p className="flow-content-meta">
                      任务标识：<code>{currentFlow.id}</code>
                      {currentFlow.meta?.source ? ` · 来源：${currentFlow.meta.source}` : ""}
                      {currentFlow.meta?.updatedAt
                        ? ` · 更新：${formatExecutionTime(currentFlow.meta.updatedAt)}`
                        : ""}
                    </p>
                    <FragilityNotice warnings={flowFragilityIssues} />
                    <div className="table-scroll">
                      <FlowStepsTable
                        steps={flowStepRows}
                        emptyMessage="该任务没有步骤，请在扩展中重新录制"
                      />
                    </div>
                    <details className="flow-preview">
                      <summary>查看原始 JSON</summary>
                      <pre>{JSON.stringify(currentFlow, null, 2)}</pre>
                    </details>
                  </div>
                </details>
              </>
            ) : (
              <p className="execution-history-empty">
                在左侧「自动化任务」中选择一项，查看录制步骤
              </p>
            )}
          </section>
        ) : null}
        {tab === "executions" ? (
          <section className="execution-business-view">
            {execution ? (
              <ExecutionResultSummary execution={execution} taskName={selectedFlowName} />
            ) : (
              <div className="execution-empty-state">
                <h2>还没有可查看的运行结果</h2>
                <p>
                  {selectedFlowId
                    ? "点击上方「运行任务」，完成后会在这里展示最近结果。"
                    : "请先在左侧选择一个自动化任务。"}
                </p>
              </div>
            )}
            <details className="professional-diagnostics">
              <summary>专业诊断</summary>
              <div className="professional-diagnostics-content">
                <ExecutionCompatibilityNotice warnings={executionCompatibilityWarnings} />
                {execution?.fragilityIssues && execution.fragilityIssues.length > 0 ? (
                  <FragilityNotice warnings={execution.fragilityIssues} />
                ) : null}
                <ExecutionRunContextPanel runContext={execution?.runContext} />
                <div className="table-scroll">
                  <StepLogTable
                    steps={steps}
                    emptyMessage={
                      selectedFlowId ? "运行任务或从左侧选择一条运行记录" : "请先选择一个自动化任务"
                    }
                    onPreviewScreenshot={
                      nativeExecutionScreenshotPreview
                        ? (step) => void previewExecutionScreenshot(step)
                        : undefined
                    }
                    onInspectDiagnostic={inspectDiagnostic}
                  />
                </div>
                {execution && diagnosticSteps.length > 0 ? (
                  <DiagnosticInspector
                    steps={execution.steps}
                    selectedStepIndex={selectedDiagnosticStepIndex}
                    onSelectStepIndex={setSelectedDiagnosticStepIndex}
                    onPreviewScreenshot={
                      nativeExecutionScreenshotPreview
                        ? (step) => void previewExecutionScreenshot(step)
                        : undefined
                    }
                  />
                ) : null}
              </div>
            </details>
          </section>
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
                  emptyMessage="暂无历史版本，修改并保存任务后会自动生成"
                />
                {previewVersion ? (
                  <section className="flow-preview" aria-labelledby="flow-version-diff-title">
                    <h3 id="flow-version-diff-title">
                      历史 v{versions.find((item) => item.id === selectedVersionId)?.version ?? "?"}
                      {" → 当前任务"}
                    </h3>
                    <p className="flow-version-diff-summary">
                      {versionDiff?.totalChanges ?? 0} 处业务结构变化；比较副本中的敏感值已隐藏。
                    </p>
                    <details className="professional-diagnostics">
                      <summary>专业详情</summary>
                      <div className="professional-diagnostics-content">
                        <JsonDiffView
                          before={previewVersion}
                          after={portableCurrentFlow}
                          beforeLabel="历史值"
                          afterLabel="当前值"
                          ariaLabel="历史版本到当前任务的只读差异"
                        />
                      </div>
                    </details>
                  </section>
                ) : null}
              </>
            ) : projectHasNoFlows ? (
              <FlowEmptyGuide projectName={selectedProjectName} />
            ) : (
              <p className="execution-history-empty">请在左侧自动化任务列表中选择一项</p>
            )}
          </section>
        ) : null}
      </main>
      {pendingRunSummary ? (
        <RunSafetyConfirmation
          summary={pendingRunSummary}
          riskAcknowledged={riskAcknowledged}
          disabled={loading}
          onRiskAcknowledgedChange={setRiskAcknowledged}
          onConfirm={() => void handleRun()}
          onCancel={() => setPendingRunSummary(null)}
        />
      ) : null}
      {deletionTarget ? (
        <ExecutionDeletionConfirmation
          execution={deletionTarget}
          taskName={flows.find((flow) => flow.id === deletionTarget.flowId)?.name ?? "自动化任务"}
          disabled={deletionBusy}
          error={deletionError}
          returnFocusTo={deletionTriggerRef.current}
          onConfirm={() => void handleDeleteExecution()}
          onCancel={closeDeletionConfirmation}
        />
      ) : null}
      {screenshotPreview ? (
        <ExecutionScreenshotPreview
          status={screenshotPreview.status}
          blobUrl={screenshotPreview.blobUrl}
          stepIndex={screenshotPreview.stepIndex}
          stepLabel={screenshotPreview.stepLabel}
          unavailableMessage={screenshotPreview.unavailableMessage}
          onClose={closeScreenshotPreview}
        />
      ) : null}
    </div>
  );
}
