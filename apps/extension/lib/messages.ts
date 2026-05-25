import type { RecordedEvent } from "@flowweave/shared";

export const MSG_RECORD_EVENT = "flowweave:record-event" as const;
export const MSG_GET_SESSION = "flowweave:get-session" as const;
export const MSG_EXPORT_FLOW = "flowweave:export-flow" as const;

export type RecordEventMessage = {
  type: typeof MSG_RECORD_EVENT;
  event: RecordedEvent;
};

export type GetSessionMessage = {
  type: typeof MSG_GET_SESSION;
};

export type ExportFlowMessage = {
  type: typeof MSG_EXPORT_FLOW;
};

export type ExtensionMessage = RecordEventMessage | GetSessionMessage | ExportFlowMessage;

export type SessionState = {
  eventCount: number;
  sessionId: string;
  projectId: string;
  startedAt: string;
};

export type ExportFlowResponse = {
  ok: true;
  json: string;
  filename: string;
};
