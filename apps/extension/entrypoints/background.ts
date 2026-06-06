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
const API_BASE_STORAGE_KEY = "flowweave:api-base";

type StoredSession = {
  meta: RecorderSessionMeta;
  events: RecordedEvent[];
};

type BackgroundMessageHandlerDeps = {
  loadSession: () => Promise<StoredSession>;
  saveSession: (session: StoredSession) => Promise<void>;
  parseRecordedEvent: typeof parseRecordedEvent;
  buildFlowFromEvents: typeof buildFlowFromEvents;
  saveFlowToKnowledge: typeof saveFlowToKnowledge;
  getStoredApiBase: () => Promise<string | undefined>;
  defaultKnowledgeApiBase: string;
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

async function getStoredApiBase(): Promise<string | undefined> {
  const stored = await browser.storage.local.get(API_BASE_STORAGE_KEY);
  return stored[API_BASE_STORAGE_KEY] as string | undefined;
}

function toSessionState(session: StoredSession): SessionState {
  return {
    eventCount: session.events.length,
    sessionId: session.meta.sessionId,
    projectId: session.meta.projectId,
    startedAt: session.meta.startedAt,
  };
}

function createBackgroundMessageHandlerDeps(): BackgroundMessageHandlerDeps {
  return {
    loadSession,
    saveSession,
    parseRecordedEvent,
    buildFlowFromEvents,
    saveFlowToKnowledge,
    getStoredApiBase,
    defaultKnowledgeApiBase: DEFAULT_KNOWLEDGE_API_BASE,
  };
}

export function createBackgroundMessageHandler(
  overrides: Partial<BackgroundMessageHandlerDeps> = {},
): (message: ExtensionMessage) => Promise<unknown> {
  const deps: BackgroundMessageHandlerDeps = {
    ...createBackgroundMessageHandlerDeps(),
    ...overrides,
  };

  return async (message: ExtensionMessage): Promise<unknown> => {
    if (message.type === MSG_RECORD_EVENT) {
      const event = deps.parseRecordedEvent(message.event);
      const session = await deps.loadSession();
      session.events.push(event);
      await deps.saveSession(session);
      return { ok: true, eventCount: session.events.length };
    }

    if (message.type === MSG_GET_SESSION) {
      const session = await deps.loadSession();
      return toSessionState(session);
    }

    if (message.type === MSG_EXPORT_FLOW) {
      const session = await deps.loadSession();
      const flow = deps.buildFlowFromEvents(session.events, {
        ...session.meta,
        flowId: `flow-${session.meta.sessionId}`,
        name: "录制流程",
      });
      const response: ExportFlowResponse = {
        ok: true,
        json: JSON.stringify(flow, null, 2),
        filename: `flow-${session.meta.sessionId.slice(0, 8)}.json`,
      };
      return response;
    }

    if (message.type === MSG_SET_PROJECT) {
      const session = await deps.loadSession();
      session.meta.projectId = message.projectId;
      await deps.saveSession(session);
      return { ok: true, projectId: message.projectId };
    }

    if (message.type === MSG_CLEAR_SESSION) {
      const projectId = await getDefaultProjectId();
      const session: StoredSession = {
        meta: createSessionMeta(projectId),
        events: [],
      };
      await deps.saveSession(session);
      return toSessionState(session);
    }

    if (message.type === MSG_SYNC_KNOWLEDGE) {
      const session = await deps.loadSession();
      if (session.events.length === 0) {
        return { ok: false, error: "暂无录制事件" } satisfies SyncKnowledgeResponse;
      }
      const flow = deps.buildFlowFromEvents(session.events, {
        ...session.meta,
        projectId: message.projectId,
        flowId: `flow-${session.meta.sessionId}`,
        name: "录制流程",
      });
      const apiBase =
        message.apiBase ??
        (await deps.getStoredApiBase()) ??
        deps.defaultKnowledgeApiBase;
      const saved = await deps.saveFlowToKnowledge(
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
      return response;
    }

    return { ok: false, error: "未知消息类型" };
  };
}

export default defineBackground(() => {
  const handleMessage = createBackgroundMessageHandler();

  void browser.sidePanel?.setPanelBehavior({ openPanelOnActionClick: true });

  browser.runtime.onMessage.addListener(
    (
      message: ExtensionMessage,
      _sender: unknown,
      sendResponse: (response?: unknown) => void,
    ) => {
      void handleMessage(message)
        .then((response) => {
          sendResponse(response);
        })
        .catch((error) => {
          sendResponse({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          });
        });

      return true;
    },
  );
});
