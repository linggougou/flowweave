import {
  MSG_EXPORT_FLOW,
  MSG_GET_SESSION,
  type ExportFlowMessage,
  type ExportFlowResponse,
  type GetSessionMessage,
  type SessionState,
} from "../../lib/messages.js";

const countEl = document.getElementById("event-count");
const metaEl = document.getElementById("session-meta");
const exportBtn = document.getElementById("export-btn") as HTMLButtonElement | null;
const statusEl = document.getElementById("status");

function setStatus(text: string): void {
  if (statusEl) statusEl.textContent = text;
}

function renderSession(state: SessionState): void {
  if (countEl) countEl.textContent = String(state.eventCount);
  if (metaEl) {
    metaEl.textContent = `会话 ${state.sessionId.slice(0, 8)}… · 项目 ${state.projectId}`;
  }
  if (exportBtn) exportBtn.disabled = state.eventCount === 0;
}

async function refreshSession(): Promise<void> {
  const message: GetSessionMessage = { type: MSG_GET_SESSION };
  const state = (await browser.runtime.sendMessage(message)) as SessionState;
  renderSession(state);
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

void refreshSession();
const timer = window.setInterval(() => void refreshSession(), 1000);
window.addEventListener("unload", () => window.clearInterval(timer));
