import {
  checkKnowledgeApi,
  createKnowledgeProject,
  DEFAULT_KNOWLEDGE_API_BASE,
  listKnowledgeProjects,
  type KnowledgeProject,
} from "../../lib/knowledge-client.js";
import {
  MSG_CLEAR_SESSION,
  MSG_EXPORT_FLOW,
  MSG_GET_SESSION,
  MSG_SET_PROJECT,
  MSG_SYNC_KNOWLEDGE,
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

let projects: KnowledgeProject[] = [];
let apiOnline = false;
let selectedProjectId: string | null = null;

function setStatus(text: string): void {
  if (statusEl) statusEl.textContent = text;
}

function getApiBase(): string {
  return DEFAULT_KNOWLEDGE_API_BASE;
}

function renderSession(state: SessionState): void {
  if (countEl) countEl.textContent = String(state.eventCount);
  if (metaEl) {
    metaEl.textContent = `会话 ${state.sessionId.slice(0, 8)}… · 项目 ${state.projectId}`;
  }
  const canAct = state.eventCount > 0;
  if (exportBtn) exportBtn.disabled = !canAct;
  if (syncBtn) {
    syncBtn.disabled = !canAct || !apiOnline || !selectedProjectId;
  }
}

function renderProjects(): void {
  if (!projectSelect) return;
  projectSelect.innerHTML = "";
  if (projects.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = apiOnline ? "暂无项目，可点击下方创建" : "API 未连接";
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
  const message: GetSessionMessage = { type: MSG_GET_SESSION };
  const state = (await browser.runtime.sendMessage(message)) as SessionState;
  if (!selectedProjectId && state.projectId !== "pending") {
    selectedProjectId = state.projectId;
  }
  renderSession(state);
}

async function loadProjects(): Promise<void> {
  const base = getApiBase();
  await browser.storage.local.set({ [API_BASE_KEY]: base });
  apiOnline = await checkKnowledgeApi(base);
  if (!apiOnline) {
    projects = [];
    renderProjects();
    setStatus("未连接本地 API，请先运行 pnpm dev:web");
    return;
  }

  projects = await listKnowledgeProjects(base);
  if (projects.length === 0) {
    const created = await createKnowledgeProject(base, "扩展录制项目");
    projects = [created];
    setStatus("已自动创建默认项目");
  } else {
    setStatus("已连接本地知识库");
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

projectSelect?.addEventListener("change", () => {
  const projectId = projectSelect.value;
  if (!projectId) return;
  void persistProjectSelection(projectId).then(() => refreshSession());
});

refreshProjectsBtn?.addEventListener("click", () => {
  void loadProjects();
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
    const state = (await browser.runtime.sendMessage({ type: MSG_CLEAR_SESSION })) as SessionState;
    renderSession(state);
    setStatus("已清空当前录制会话");
  })();
});

syncBtn?.addEventListener("click", () => {
  void (async () => {
    if (!selectedProjectId) {
      setStatus("请先选择目标项目");
      return;
    }
    setStatus("正在同步到知识库…");
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
})();
const timer = window.setInterval(() => void refreshSession(), 1000);
window.addEventListener("unload", () => window.clearInterval(timer));
