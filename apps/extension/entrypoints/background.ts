import { parseRecordedEvent, type RecorderSessionMeta } from "@flowweave/shared";
import { createPortableFlowDocument } from "@flowweave/flow-dsl";
import { buildFlowFromEvents } from "../lib/flow-export.js";
import { DEFAULT_KNOWLEDGE_API_BASE, saveFlowToKnowledge } from "../lib/knowledge-client.js";
import {
  MSG_CLEAR_SESSION,
  MSG_COMPLETE_SESSION,
  MSG_EXPORT_FLOW,
  MSG_GET_SESSION,
  MSG_PAUSE_SESSION,
  MSG_RECORD_EVENT,
  MSG_RESTORE_CLEARED_SESSION,
  MSG_RESUME_SESSION,
  MSG_SET_PROJECT,
  MSG_SET_TASK_NAME,
  MSG_START_SESSION,
  MSG_SYNC_KNOWLEDGE,
  TASK_NAME_MAX_LENGTH,
  type ExportFlowResponse,
  type ExtensionMessage,
  type SessionState,
  type SyncKnowledgeResponse,
} from "../lib/messages.js";
import {
  buildSessionPreview,
  collectTargetSites,
  normalizeStoredSession,
  type StoredSession,
} from "../lib/recording-session.js";
import { STORAGE_SELECTED_PROJECT_KEY } from "../lib/storage-keys.js";

const STORAGE_KEY = "flowweave:recording-session";
const CLEARED_STORAGE_KEY = "flowweave:cleared-recording-session";
const API_BASE_STORAGE_KEY = "flowweave:api-base";

type BackgroundMessageHandlerDeps = {
  loadSession: () => Promise<StoredSession>;
  saveSession: (session: StoredSession) => Promise<void>;
  loadClearedSession: () => Promise<StoredSession | undefined>;
  saveClearedSession: (session: StoredSession | undefined) => Promise<void>;
  parseRecordedEvent: typeof parseRecordedEvent;
  buildFlowFromEvents: typeof buildFlowFromEvents;
  createPortableFlowDocument: typeof createPortableFlowDocument;
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

function createIdleSession(projectId = "pending"): StoredSession {
  return {
    meta: createSessionMeta(projectId),
    events: [],
    status: "idle",
  };
}

async function getDefaultProjectId(): Promise<string> {
  const stored = await browser.storage.local.get(STORAGE_SELECTED_PROJECT_KEY);
  const projectId = stored[STORAGE_SELECTED_PROJECT_KEY] as string | undefined;
  return projectId ?? "pending";
}

async function loadSession(): Promise<StoredSession> {
  const stored = await browser.storage.session.get(STORAGE_KEY);
  const projectId = await getDefaultProjectId();
  const normalized = normalizeStoredSession(
    stored[STORAGE_KEY],
    () => createIdleSession(projectId),
  );
  if (normalized.migrated) {
    await saveSession(normalized.session);
  }
  return normalized.session;
}

async function saveSession(session: StoredSession): Promise<void> {
  await browser.storage.session.set({ [STORAGE_KEY]: session });
}

async function loadClearedSession(): Promise<StoredSession | undefined> {
  const stored = await browser.storage.session.get(CLEARED_STORAGE_KEY);
  const raw = stored[CLEARED_STORAGE_KEY];
  if (!raw) {
    return undefined;
  }
  return normalizeStoredSession(raw, () => createIdleSession()).session;
}

async function saveClearedSession(session: StoredSession | undefined): Promise<void> {
  if (!session) {
    await browser.storage.session.remove(CLEARED_STORAGE_KEY);
    return;
  }
  await browser.storage.session.set({ [CLEARED_STORAGE_KEY]: session });
}

async function getStoredApiBase(): Promise<string | undefined> {
  const stored = await browser.storage.local.get(API_BASE_STORAGE_KEY);
  return stored[API_BASE_STORAGE_KEY] as string | undefined;
}

function toSessionState(session: StoredSession, canRestoreCleared: boolean): SessionState {
  return {
    status: session.status,
    eventCount: session.events.length,
    sessionId: session.meta.sessionId,
    projectId: session.meta.projectId,
    startedAt: session.meta.startedAt,
    ...(session.taskName ? { taskName: session.taskName } : {}),
    targetSites: collectTargetSites(session.events),
    preview: buildSessionPreview(session.events),
    canRestoreCleared,
  };
}

function createBackgroundMessageHandlerDeps(): BackgroundMessageHandlerDeps {
  return {
    loadSession,
    saveSession,
    loadClearedSession,
    saveClearedSession,
    parseRecordedEvent,
    buildFlowFromEvents,
    createPortableFlowDocument,
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

  const readState = async (session: StoredSession): Promise<SessionState> =>
    toSessionState(session, Boolean(await deps.loadClearedSession()));

  return async (message: ExtensionMessage): Promise<unknown> => {
    if (message.type === MSG_RECORD_EVENT) {
      const session = await deps.loadSession();
      if (session.status !== "recording") {
        return {
          ok: false,
          ignored: true,
          status: session.status,
          eventCount: session.events.length,
        };
      }
      const event = deps.parseRecordedEvent(message.event);
      session.events.push(event);
      await deps.saveSession(session);
      return { ok: true, status: session.status, eventCount: session.events.length };
    }

    if (message.type === MSG_GET_SESSION) {
      const session = await deps.loadSession();
      return readState(session);
    }

    if (message.type === MSG_START_SESSION) {
      const previous = await deps.loadSession();
      if (previous.status !== "idle") {
        return { ok: false, error: "请先完成或清空当前录制" };
      }
      const session: StoredSession = {
        meta: createSessionMeta(previous.meta.projectId),
        events: [],
        status: "recording",
      };
      await deps.saveClearedSession(undefined);
      await deps.saveSession(session);
      return readState(session);
    }

    if (message.type === MSG_PAUSE_SESSION) {
      const session = await deps.loadSession();
      if (session.status !== "recording") {
        return { ok: false, error: "当前录制不能暂停" };
      }
      session.status = "paused";
      await deps.saveSession(session);
      return readState(session);
    }

    if (message.type === MSG_RESUME_SESSION) {
      const session = await deps.loadSession();
      if (session.status !== "paused") {
        return { ok: false, error: "当前录制不能继续" };
      }
      session.status = "recording";
      await deps.saveSession(session);
      return readState(session);
    }

    if (message.type === MSG_COMPLETE_SESSION) {
      const session = await deps.loadSession();
      if (session.status !== "recording" && session.status !== "paused") {
        return { ok: false, error: "当前没有可完成的录制" };
      }
      if (session.events.length === 0) {
        return { ok: false, error: "暂无录制事件" };
      }
      session.status = "completed";
      await deps.saveSession(session);
      return readState(session);
    }

    if (message.type === MSG_SET_TASK_NAME) {
      const session = await deps.loadSession();
      if (session.status !== "completed") {
        return { ok: false, error: "请先完成录制" };
      }
      const taskName = message.name.trim();
      if (!taskName) {
        return { ok: false, error: "请输入任务名称" };
      }
      if (taskName.length > TASK_NAME_MAX_LENGTH) {
        return { ok: false, error: `任务名称不能超过 ${TASK_NAME_MAX_LENGTH} 个字符` };
      }
      session.taskName = taskName;
      await deps.saveSession(session);
      return { ok: true, taskName, ...(await readState(session)) };
    }

    if (message.type === MSG_EXPORT_FLOW) {
      try {
        const session = await deps.loadSession();
        const flow = deps.buildFlowFromEvents(session.events, {
          ...session.meta,
          flowId: `flow-${session.meta.sessionId}`,
          name: session.taskName ?? "录制流程",
        });
        const portable = deps.createPortableFlowDocument(flow);
        const response: ExportFlowResponse = {
          ok: true,
          json: JSON.stringify(portable.document, null, 2),
          filename: `flow-${session.meta.sessionId.slice(0, 8)}.json`,
          warnings: portable.warnings,
          summary: {
            warningCount: portable.warnings.length,
            businessTextReviewRequired: true,
          },
        };
        return response;
      } catch (error: unknown) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : "导出 Flow 失败",
        } satisfies ExportFlowResponse;
      }
    }

    if (message.type === MSG_SET_PROJECT) {
      const session = await deps.loadSession();
      session.meta.projectId = message.projectId;
      await deps.saveSession(session);
      return { ok: true, projectId: message.projectId };
    }

    if (message.type === MSG_CLEAR_SESSION) {
      if (!message.confirmed) {
        return { ok: false, error: "清空前需要确认" };
      }
      const previous = await deps.loadSession();
      await deps.saveClearedSession(previous.events.length > 0 ? previous : undefined);
      const session = createIdleSession(previous.meta.projectId);
      await deps.saveSession(session);
      return readState(session);
    }

    if (message.type === MSG_RESTORE_CLEARED_SESSION) {
      const cleared = await deps.loadClearedSession();
      if (!cleared) {
        return { ok: false, error: "没有可恢复的录制" };
      }
      await deps.saveSession(cleared);
      await deps.saveClearedSession(undefined);
      return { ok: true, ...toSessionState(cleared, false) };
    }

    if (message.type === MSG_SYNC_KNOWLEDGE) {
      const session = await deps.loadSession();
      if (session.status !== "completed") {
        return { ok: false, error: "请先完成录制" } satisfies SyncKnowledgeResponse;
      }
      if (session.events.length === 0) {
        return { ok: false, error: "暂无录制事件" } satisfies SyncKnowledgeResponse;
      }
      if (!session.taskName) {
        return { ok: false, error: "请先输入任务名称" } satisfies SyncKnowledgeResponse;
      }
      const flow = deps.buildFlowFromEvents(session.events, {
        ...session.meta,
        projectId: message.projectId,
        flowId: `flow-${session.meta.sessionId}`,
        name: session.taskName,
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
  let messageQueue: Promise<void> = Promise.resolve();

  void browser.sidePanel?.setPanelBehavior({ openPanelOnActionClick: true });

  browser.runtime.onMessage.addListener(
    (
      message: ExtensionMessage,
      _sender: unknown,
      sendResponse: (response?: unknown) => void,
    ) => {
      const responseTask = messageQueue.then(() => handleMessage(message));
      messageQueue = responseTask.then(
        () => undefined,
        () => undefined,
      );
      void responseTask
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
