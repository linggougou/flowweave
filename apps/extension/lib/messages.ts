import type { RecordedEvent } from "@flowweave/shared";
import type { FlowPortabilityWarning } from "@flowweave/flow-dsl";

export const MSG_RECORD_EVENT = "flowweave:record-event" as const;
export const MSG_GET_SESSION = "flowweave:get-session" as const;
export const MSG_EXPORT_FLOW = "flowweave:export-flow" as const;
export const MSG_SYNC_KNOWLEDGE = "flowweave:sync-knowledge" as const;
export const MSG_SET_PROJECT = "flowweave:set-project" as const;
export const MSG_CLEAR_SESSION = "flowweave:clear-session" as const;
export const MSG_RESTORE_CLEARED_SESSION = "flowweave:restore-cleared-session" as const;
export const MSG_START_SESSION = "flowweave:start-session" as const;
export const MSG_PAUSE_SESSION = "flowweave:pause-session" as const;
export const MSG_RESUME_SESSION = "flowweave:resume-session" as const;
export const MSG_COMPLETE_SESSION = "flowweave:complete-session" as const;
export const MSG_SET_TASK_NAME = "flowweave:set-task-name" as const;
export const MSG_PING_CONTENT = "flowweave:ping-content" as const;

export const TASK_NAME_MAX_LENGTH = 80;

export type RecordingStatus = "idle" | "recording" | "paused" | "completed";

export type SessionStepPreview = {
  id: string;
  label: string;
};

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

export type SyncKnowledgeMessage = {
  type: typeof MSG_SYNC_KNOWLEDGE;
  projectId: string;
  apiBase?: string;
  changeMessage?: string;
};

export type SetProjectMessage = {
  type: typeof MSG_SET_PROJECT;
  projectId: string;
};

export type ClearSessionMessage = {
  type: typeof MSG_CLEAR_SESSION;
  confirmed: boolean;
};

export type RestoreClearedSessionMessage = {
  type: typeof MSG_RESTORE_CLEARED_SESSION;
};

export type StartSessionMessage = { type: typeof MSG_START_SESSION };
export type PauseSessionMessage = { type: typeof MSG_PAUSE_SESSION };
export type ResumeSessionMessage = { type: typeof MSG_RESUME_SESSION };
export type CompleteSessionMessage = { type: typeof MSG_COMPLETE_SESSION };
export type SetTaskNameMessage = {
  type: typeof MSG_SET_TASK_NAME;
  name: string;
};

export type ExtensionMessage =
  | RecordEventMessage
  | GetSessionMessage
  | ExportFlowMessage
  | SyncKnowledgeMessage
  | SetProjectMessage
  | ClearSessionMessage
  | RestoreClearedSessionMessage
  | StartSessionMessage
  | PauseSessionMessage
  | ResumeSessionMessage
  | CompleteSessionMessage
  | SetTaskNameMessage
  | { type: typeof MSG_PING_CONTENT };

export type SessionState = {
  status: RecordingStatus;
  eventCount: number;
  sessionId: string;
  projectId: string;
  startedAt: string;
  taskName?: string;
  targetSites: string[];
  preview: SessionStepPreview[];
  canRestoreCleared: boolean;
};

export type ExportFlowSummary = {
  warningCount: number;
  businessTextReviewRequired: true;
};

export type ExportFlowResponse =
  | {
      ok: true;
      json: string;
      filename: string;
      warnings: FlowPortabilityWarning[];
      summary: ExportFlowSummary;
    }
  | { ok: false; error: string };

export type SyncKnowledgeResponse =
  | {
      ok: true;
      flowId: string;
      name: string;
      projectId: string;
    }
  | { ok: false; error: string };

export type SetProjectResponse = { ok: true; projectId: string } | { ok: false; error: string };
