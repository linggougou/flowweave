import { z } from "zod";
import { getSingleTemplateVariableName } from "./template-variables.js";

export const recordedEventTypeSchema = z.enum([
  "click",
  "fill",
  "navigate",
  "select",
  "scroll",
  "keypress",
]);

export type RecordedEventType = z.infer<typeof recordedEventTypeSchema>;

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string" && item.length > 0);
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isReplayableUploadInput(value: string): boolean {
  return (
    getSingleTemplateVariableName(value) !== null ||
    /^(?:file:\/\/|\/|\.{1,2}\/|[A-Za-z]:[\\/]|\\\\)/.test(value)
  );
}

export const recordedEventSchema = z.object({
  id: z.string().min(1),
  type: recordedEventTypeSchema,
  timestamp: z.number().int().nonnegative(),
  url: z.string().url(),
  frameId: z.string().optional(),
  payload: z.record(z.string(), z.unknown()),
}).superRefine((event, ctx) => {
  const key = event.payload.key;
  if (event.type === "keypress" && (typeof key !== "string" || key.trim().length === 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["payload", "key"],
      message: "keypress 事件必须提供 key",
    });
  }

  if (event.type === "scroll") {
    if (!isNonNegativeNumber(event.payload.x)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["payload", "x"],
        message: "scroll 事件必须提供非负数 x",
      });
    }

    if (!isNonNegativeNumber(event.payload.y)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["payload", "y"],
        message: "scroll 事件必须提供非负数 y",
      });
    }
  }

  if (event.payload.inputType !== "file") {
    return;
  }

  const files = event.payload.files;
  let parsedFiles: string[] | undefined;
  if (files !== undefined) {
    if (!isStringArray(files)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["payload", "files"],
        message: "upload 事件的 files 必须是非空字符串数组",
      });
    } else if (!files.every(isReplayableUploadInput)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["payload", "files"],
        message: "upload 事件的 files 必须是可回放的文件路径或变量占位符，不能使用裸文件名",
      });
    } else {
      parsedFiles = files;
    }
  }

  const fileNames = event.payload.fileNames;
  if (fileNames !== undefined) {
    if (!isStringArray(fileNames)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["payload", "fileNames"],
        message: "upload 事件的 fileNames 必须是非空字符串数组",
      });
    } else if (parsedFiles && fileNames.length !== parsedFiles.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["payload", "fileNames"],
        message: "upload 事件的 fileNames 数量必须与 files 一致",
      });
    }
  }
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
