import { parseRecordedEvent, type RecordedEvent, type RecorderSessionMeta } from "@flowweave/shared";
import { buildFlowFromEvents } from "../lib/flow-export.js";
import {
  MSG_EXPORT_FLOW,
  MSG_GET_SESSION,
  MSG_RECORD_EVENT,
  type ExportFlowResponse,
  type ExtensionMessage,
  type SessionState,
} from "../lib/messages.js";

const STORAGE_KEY = "flowweave:recording-session";

type StoredSession = {
  meta: RecorderSessionMeta;
  events: RecordedEvent[];
};

function createSessionMeta(): RecorderSessionMeta {
  return {
    sessionId: crypto.randomUUID(),
    projectId: "default",
    startedAt: new Date().toISOString(),
  };
}

async function loadSession(): Promise<StoredSession> {
  const stored = await browser.storage.session.get(STORAGE_KEY);
  const raw = stored[STORAGE_KEY] as StoredSession | undefined;
  if (raw?.meta && Array.isArray(raw.events)) {
    return raw;
  }
  const session: StoredSession = { meta: createSessionMeta(), events: [] };
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
