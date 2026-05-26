import { parseRecordedEvent, type RecordedEvent, type RecorderSessionMeta } from "@flowweave/shared";
import { buildFlowFromEvents } from "../lib/flow-export.js";
import { DEFAULT_KNOWLEDGE_API_BASE, saveFlowToKnowledge } from "../lib/knowledge-client.js";
import {
  MSG_CLEAR_SESSION,
  MSG_EXPORT_FLOW,
  MSG_GET_SESSION,
  MSG_RECORD_EVENT,
  MSG_SET_PROJECT,
  MSG_SYNC_KNOWLEDGE,
  type ExportFlowResponse,
  type ExtensionMessage,
  type SessionState,
  type SyncKnowledgeResponse,
} from "../lib/messages.js";
import { STORAGE_SELECTED_PROJECT_KEY } from "../lib/storage-keys.js";

const STORAGE_KEY = "flowweave:recording-session";

type StoredSession = {
  meta: RecorderSessionMeta;
  events: RecordedEvent[];
};

function createSessionMeta(projectId = "pending"): RecorderSessionMeta {
  return {
    sessionId: crypto.randomUUID(),
    projectId,
    startedAt: new Date().toISOString(),
  };
}

async function getDefaultProjectId(): Promise<string> {
  const stored = await browser.storage.local.get(STORAGE_SELECTED_PROJECT_KEY);
  const projectId = stored[STORAGE_SELECTED_PROJECT_KEY] as string | undefined;
  return projectId ?? "pending";
}

async function loadSession(): Promise<StoredSession> {
  const stored = await browser.storage.session.get(STORAGE_KEY);
  const raw = stored[STORAGE_KEY] as StoredSession | undefined;
  if (raw?.meta && Array.isArray(raw.events)) {
    return raw;
  }
  const projectId = await getDefaultProjectId();
  const session: StoredSession = { meta: createSessionMeta(projectId), events: [] };
  await browser.storage.session.set({ [STORAGE_KEY]: session });
  return session;
}

async function saveSession(session: StoredSession): Promise<void> {
  await browser.storage.session.set({ [STORAGE_KEY]: session });
}

function toSessionState(session: StoredSession): SessionState {
  return {
    eventCount: session.events.length,
    sessionId: session.meta.sessionId,
    projectId: session.meta.projectId,
    startedAt: session.meta.startedAt,
  };
}

export default defineBackground(() => {
  void browser.sidePanel?.setPanelBehavior({ openPanelOnActionClick: true });

  browser.runtime.onMessage.addListener(
    (
      message: ExtensionMessage,
      _sender: unknown,
      sendResponse: (response?: unknown) => void,
    ) => {
    void (async () => {
      try {
        if (message.type === MSG_RECORD_EVENT) {
          const event = parseRecordedEvent(message.event);
          const session = await loadSession();
          session.events.push(event);
          await saveSession(session);
          sendResponse({ ok: true, eventCount: session.events.length });
          return;
        }

        if (message.type === MSG_GET_SESSION) {
          const session = await loadSession();
          sendResponse(toSessionState(session));
          return;
        }

        if (message.type === MSG_EXPORT_FLOW) {
          const session = await loadSession();
          const flow = buildFlowFromEvents(session.events, {
            ...session.meta,
            flowId: `flow-${session.meta.sessionId}`,
            name: "录制流程",
          });
          const json = JSON.stringify(flow, null, 2);
          const response: ExportFlowResponse = {
            ok: true,
            json,
            filename: `flow-${session.meta.sessionId.slice(0, 8)}.json`,
          };
          sendResponse(response);
          return;
        }

        if (message.type === MSG_SET_PROJECT) {
          const session = await loadSession();
          session.meta.projectId = message.projectId;
          await saveSession(session);
          sendResponse({ ok: true, projectId: message.projectId });
          return;
        }

        if (message.type === MSG_CLEAR_SESSION) {
          const projectId = await getDefaultProjectId();
          const session: StoredSession = {
            meta: createSessionMeta(projectId),
            events: [],
          };
          await saveSession(session);
          sendResponse(toSessionState(session));
          return;
        }

        if (message.type === MSG_SYNC_KNOWLEDGE) {
          const session = await loadSession();
          if (session.events.length === 0) {
            sendResponse({ ok: false, error: "暂无录制事件" } satisfies SyncKnowledgeResponse);
            return;
          }
          const flow = buildFlowFromEvents(session.events, {
            ...session.meta,
            projectId: message.projectId,
            flowId: `flow-${session.meta.sessionId}`,
            name: "录制流程",
          });
          const storedApi = await browser.storage.local.get("flowweave:api-base");
          const apiBase =
            message.apiBase ??
            (storedApi["flowweave:api-base"] as string | undefined) ??
            DEFAULT_KNOWLEDGE_API_BASE;
          const saved = await saveFlowToKnowledge(
            String(apiBase),
            message.projectId,
            flow,
            message.changeMessage ?? "扩展侧栏同步",
          );
          const response: SyncKnowledgeResponse = {
            ok: true,
            flowId: saved.flowId,
            name: saved.name,
            projectId: saved.projectId,
          };
          sendResponse(response);
          return;
        }

        sendResponse({ ok: false, error: "未知消息类型" });
      } catch (error) {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    })();

    return true;
    },
  );
});
