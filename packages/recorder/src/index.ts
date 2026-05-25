import type { NormalizedStep } from "@flowweave/flow-dsl";

/** P1：扩展原始事件 → NormalizedStep */
export type RecordedEvent = {
  type: string;
  timestamp: number;
  payload: unknown;
};

export const RECORDER_PHASE = "P1" as const;

export function normalizeRecordedEvent(_event: RecordedEvent): NormalizedStep | null {
  return null;
}
