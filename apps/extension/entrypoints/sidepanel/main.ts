import {
  checkKnowledgeApi,
  createKnowledgeProject,
  DEFAULT_KNOWLEDGE_API_BASE,
  listKnowledgeProjects,
  type KnowledgeProject,
} from "../../lib/knowledge-client.js";
import {
  MSG_CLEAR_SESSION,
  MSG_COMPLETE_SESSION,
  MSG_EXPORT_FLOW,
  MSG_GET_SESSION,
  MSG_PAUSE_SESSION,
  MSG_PING_CONTENT,
  MSG_RECORD_EVENT,
  MSG_RESTORE_CLEARED_SESSION,
  MSG_RESUME_SESSION,
  MSG_SET_PROJECT,
  MSG_SET_TASK_NAME,
  MSG_START_SESSION,
  MSG_SYNC_KNOWLEDGE,
  type ExtensionMessage,
  type ExportFlowMessage,
  type ExportFlowResponse,
  type GetSessionMessage,
  type SessionState,
  type SyncKnowledgeMessage,
  type SyncKnowledgeResponse,
} from "../../lib/messages.js";
import { STORAGE_SELECTED_PROJECT_KEY } from "../../lib/storage-keys.js";

const API_BASE_KEY = "flowweave:api-base";

const countEl = document.getElementById("event-count");
const metaEl = document.getElementById("session-meta");
const exportBtn = document.getElementById("export-btn") as HTMLButtonElement | null;
const clearBtn = document.getElementById("clear-btn") as HTMLButtonElement | null;
const syncBtn = document.getElementById("sync-btn") as HTMLButtonElement | null;
const statusEl = document.getElementById("status");
const projectSelect = document.getElementById("project-select") as HTMLSelectElement | null;
const refreshProjectsBtn = document.getElementById("refresh-projects-btn") as HTMLButtonElement | null;
const recordingPageEl = document.getElementById("recording-page");
const reloadPageBtn = document.getElementById("reload-page-btn") as HTMLButtonElement | null;
const recordingStatusEl = document.getElementById("recording-status");
const startBtn = document.getElementById("start-btn") as HTMLButtonElement | null;
const pauseBtn = document.getElementById("pause-btn") as HTMLButtonElement | null;
const resumeBtn = document.getElementById("resume-btn") as HTMLButtonElement | null;
const completeBtn = document.getElementById("complete-btn") as HTMLButtonElement | null;
const completionPreviewEl = document.getElementById("completion-preview");
const targetSitesEl = document.getElementById("target-sites");
const stepPreviewEl = document.getElementById("step-preview");
const taskNameEl = document.getElementById("task-name") as HTMLInputElement | null;
const restoreBtn = document.getElementById("restore-btn") as HTMLButtonElement | null;

let projects: KnowledgeProject[] = [];
let apiOnline = false;
let selectedProjectId: string | null = null;
let currentSession: SessionState | null = null;

function setStatus(text: string): void {
  if (statusEl) statusEl.textContent = text;
}

function getApiBase(): string {
  return DEFAULT_KNOWLEDGE_API_BASE;
}

function renderSession(state: SessionState): void {
  currentSession = state;
  if (countEl) countEl.textContent = String(state.eventCount);
  if (metaEl) {
    metaEl.textContent = `会话 ${state.sessionId.slice(0, 8)}… · 项目 ${state.projectId}`;
  }
  const isIdle = state.status === "idle";
  const isRecording = state.status === "recording";
  const isPaused = state.status === "paused";
  const isCompleted = state.status === "completed";
  const canComplete = state.eventCount > 0 && (isRecording || isPaused);
  if (recordingStatusEl) {
    recordingStatusEl.textContent = isIdle
      ? "尚未开始"
      : isRecording
        ? "正在录制"
        : isPaused
          ? "录制已暂停"
          : "录制已完成";
  }
  if (startBtn) startBtn.hidden = !isIdle;
  if (pauseBtn) pauseBtn.hidden = !isRecording;
  if (resumeBtn) resumeBtn.hidden = !isPaused;
  if (completeBtn) {
    completeBtn.hidden = !(isRecording || isPaused);
    completeBtn.disabled = !canComplete;
  }
  if (completionPreviewEl) completionPreviewEl.hidden = !isCompleted;
  if (targetSitesEl) {
    targetSitesEl.textContent = `目标站点：${state.targetSites.join("、") || "未识别"}`;
  }
  if (stepPreviewEl) {
    stepPreviewEl.replaceChildren(
      ...state.preview.map((step) => {
        const item = document.createElement("li");
        item.textContent = step.label;
        return item;
      }),
    );
  }
  if (taskNameEl && state.taskName && taskNameEl.value !== state.taskName) {
    taskNameEl.value = state.taskName;
  }
  if (exportBtn) exportBtn.disabled = !isCompleted || state.eventCount === 0;
  if (clearBtn) clearBtn.disabled = isIdle && state.eventCount === 0;
  if (restoreBtn) restoreBtn.hidden = !state.canRestoreCleared;
  if (syncBtn) {
    syncBtn.disabled = !isCompleted || !apiOnline || !selectedProjectId;
  }
}

function renderProjects(): void {
  if (!projectSelect) return;
  projectSelect.innerHTML = "";
  if (projects.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = apiOnline ? "暂无项目，可点击下方创建" : "尚未连接 Studio";
    projectSelect.append(option);
    return;
  }
  for (const project of projects) {
    const option = document.createElement("option");
    option.value = project.id;
    option.textContent = project.name;
    projectSelect.append(option);
  }
  if (!selectedProjectId || !projects.some((p) => p.id === selectedProjectId)) {
    selectedProjectId = projects[0]?.id ?? null;
  }
  if (selectedProjectId) {
    projectSelect.value = selectedProjectId;
  }
}

async function restoreSelectedProject(): Promise<void> {
  const stored = await browser.storage.local.get(STORAGE_SELECTED_PROJECT_KEY);
  const projectId = stored[STORAGE_SELECTED_PROJECT_KEY] as string | undefined;
  if (projectId) {
    selectedProjectId = projectId;
  }
}

async function persistProjectSelection(projectId: string): Promise<void> {
  selectedProjectId = projectId;
  await browser.storage.local.set({ [STORAGE_SELECTED_PROJECT_KEY]: projectId });
  const message = { type: MSG_SET_PROJECT, projectId } as const;
  await browser.runtime.sendMessage(message);
}

async function refreshSession(): Promise<void> {
  try {
    const message: GetSessionMessage = { type: MSG_GET_SESSION };
    const state = (await browser.runtime.sendMessage(message)) as SessionState;
    if (!selectedProjectId && state.projectId !== "pending") {
      selectedProjectId = state.projectId;
    }
    renderSession(state);
  } catch {
    // background 未就绪
  }
}

async function checkRecordingPage(): Promise<void> {
  if (!recordingPageEl) return;
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    const url = tab?.url ?? "";
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      recordingPageEl.textContent = "请切换到要录制的网页标签（不能是扩展页或空白页）";
      return;
    }
    if (!tab?.id) {
      recordingPageEl.textContent = "无法获取当前标签页";
      return;
    }
    const pong = (await browser.tabs.sendMessage(tab.id, { type: MSG_PING_CONTENT })) as {
      ok?: boolean;
    };
    if (pong?.ok) {
      recordingPageEl.textContent = currentSession?.status === "recording"
        ? `正在录制 ${new URL(url).hostname}`
        : `当前页已就绪，点击「开始录制」后操作（${new URL(url).hostname}）`;
      return;
    }
    recordingPageEl.textContent = "当前页未加载录制脚本，请点击下方「刷新当前页」后再操作";
  } catch {
    recordingPageEl.textContent = "当前页未加载录制脚本，请点击下方「刷新当前页」后再操作";
  }
}

async function loadProjects(): Promise<void> {
  const base = getApiBase();
  await browser.storage.local.set({ [API_BASE_KEY]: base });
  apiOnline = await checkKnowledgeApi(base);
  if (!apiOnline) {
    projects = [];
    renderProjects();
    if (refreshProjectsBtn) refreshProjectsBtn.textContent = "重新连接";
    setStatus("未连接织流 Studio，请先打开应用，然后点击“重新连接”");
    return;
  }

  projects = await listKnowledgeProjects(base);
  if (refreshProjectsBtn) refreshProjectsBtn.textContent = "刷新项目列表";
  if (projects.length === 0) {
    const created = await createKnowledgeProject(base, "扩展录制项目");
    projects = [created];
    setStatus("已自动创建默认项目");
  } else {
    setStatus("已连接织流 Studio");
  }
  renderProjects();
  if (selectedProjectId) {
    await persistProjectSelection(selectedProjectId);
  }
  await refreshSession();
}

function downloadJson(filename: string, json: string): void {
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

type SessionActionResult =
  | SessionState
  | ({ ok: false; error: string } & Partial<SessionState>);

async function runSessionAction(message: ExtensionMessage): Promise<SessionState | null> {
  const response = (await browser.runtime.sendMessage(message)) as SessionActionResult;
  if ("ok" in response && response.ok === false) {
    setStatus(response.error);
    return null;
  }
  const state = response as SessionState;
  renderSession(state);
  return state;
}

async function recordCurrentPageNavigation(): Promise<void> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  const url = tab?.url ?? "";
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    return;
  }
  await browser.runtime.sendMessage({
    type: MSG_RECORD_EVENT,
    event: {
      id: crypto.randomUUID(),
      type: "navigate",
      timestamp: Date.now(),
      url,
      payload: { url },
    },
  });
  await refreshSession();
}

projectSelect?.addEventListener("change", () => {
  const projectId = projectSelect.value;
  if (!projectId) return;
  void persistProjectSelection(projectId).then(() => refreshSession());
});

refreshProjectsBtn?.addEventListener("click", () => {
  void loadProjects();
});

startBtn?.addEventListener("click", () => {
  void (async () => {
    const state = await runSessionAction({ type: MSG_START_SESSION });
    if (!state) return;
    if (taskNameEl) taskNameEl.value = "";
    await recordCurrentPageNavigation();
    setStatus("录制已开始；只会保留完成前、未暂停时的操作");
  })();
});

pauseBtn?.addEventListener("click", () => {
  void runSessionAction({ type: MSG_PAUSE_SESSION }).then((state) => {
    if (state) setStatus("录制已暂停，当前操作不会被记录");
  });
});

resumeBtn?.addEventListener("click", () => {
  void runSessionAction({ type: MSG_RESUME_SESSION }).then((state) => {
    if (state) setStatus("已继续录制");
  });
});

completeBtn?.addEventListener("click", () => {
  void runSessionAction({ type: MSG_COMPLETE_SESSION }).then((state) => {
    if (state) {
      setStatus("录制已完成，请检查步骤并输入任务名称");
      taskNameEl?.focus();
    }
  });
});

reloadPageBtn?.addEventListener("click", () => {
  void (async () => {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      setStatus("无法刷新：未找到当前标签页");
      return;
    }
    await browser.tabs.reload(tab.id);
    setStatus("已刷新当前页，请稍等加载完成后再操作");
    window.setTimeout(() => void checkRecordingPage(), 1500);
  })();
});

exportBtn?.addEventListener("click", () => {
  void (async () => {
    setStatus("正在生成 Flow JSON…");
    const message: ExportFlowMessage = { type: MSG_EXPORT_FLOW };
    const response = (await browser.runtime.sendMessage(message)) as ExportFlowResponse & {
      ok?: boolean;
      error?: string;
    };

    if (!response?.ok || !response.json) {
      setStatus(response?.error ?? "导出失败");
      return;
    }

    downloadJson(response.filename, response.json);
    setStatus("已触发下载");
  })();
});

clearBtn?.addEventListener("click", () => {
  void (async () => {
    if (!window.confirm("确定清空当前录制吗？清空后可恢复一次。")) return;
    const state = await runSessionAction({ type: MSG_CLEAR_SESSION, confirmed: true });
    if (!state) return;
    if (taskNameEl) taskNameEl.value = "";
    setStatus("已清空当前录制；可点击“恢复刚才的录制”撤销一次");
  })();
});

restoreBtn?.addEventListener("click", () => {
  void runSessionAction({ type: MSG_RESTORE_CLEARED_SESSION }).then((state) => {
    if (state) setStatus("已恢复刚才的录制；本次恢复机会已使用");
  });
});

syncBtn?.addEventListener("click", () => {
  void (async () => {
    if (!selectedProjectId) {
      setStatus("请先选择目标项目");
      return;
    }
    const namedState = await runSessionAction({
      type: MSG_SET_TASK_NAME,
      name: taskNameEl?.value ?? "",
    });
    if (!namedState) return;
    setStatus("正在保存到 Studio…");
    const message: SyncKnowledgeMessage = {
      type: MSG_SYNC_KNOWLEDGE,
      projectId: selectedProjectId,
      apiBase: getApiBase(),
      changeMessage: "扩展侧栏同步",
    };
    const response = (await browser.runtime.sendMessage(message)) as SyncKnowledgeResponse;
    if (!response.ok) {
      setStatus(response.error);
      return;
    }
    setStatus(`已同步：${response.name}（${response.flowId.slice(0, 8)}…）`);
  })();
});

void (async () => {
  await restoreSelectedProject();
  await loadProjects();
  await checkRecordingPage();
})();
const timer = window.setInterval(() => {
  void refreshSession();
  void checkRecordingPage();
}, 1000);
window.addEventListener("unload", () => window.clearInterval(timer));
