import { z } from "zod";

export const recordedEventTypeSchema = z.enum([
  "click",
  "fill",
  "navigate",
  "select",
  "scroll",
  "keypress",
]);

export type RecordedEventType = z.infer<typeof recordedEventTypeSchema>;

export const recordedEventSchema = z.object({
  id: z.string().min(1),
  type: recordedEventTypeSchema,
  timestamp: z.number().int().nonnegative(),
  url: z.string().url(),
  frameId: z.string().optional(),
  payload: z.record(z.string(), z.unknown()),
});

export type RecordedEvent = z.infer<typeof recordedEventSchema>;

export const recorderSessionMetaSchema = z.object({
  sessionId: z.string().min(1),
  projectId: z.string().min(1),
  startedAt: z.string().datetime(),
});

export type RecorderSessionMeta = z.infer<typeof recorderSessionMetaSchema>;

export function parseRecordedEvent(input: unknown): RecordedEvent {
  return recordedEventSchema.parse(input);
}
