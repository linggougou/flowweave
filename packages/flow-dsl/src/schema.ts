import { z } from "zod";
import { FLOW_SCHEMA_VERSION } from "@flowweave/shared";

export const locatorStrategySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("role"), role: z.string(), name: z.string().optional() }),
  z.object({ kind: z.literal("testId"), testId: z.string() }),
  z.object({ kind: z.literal("css"), selector: z.string() }),
  z.object({ kind: z.literal("xpath"), expression: z.string() }),
  z.object({ kind: z.literal("text"), text: z.string(), exact: z.boolean().optional() }),
]);

export const targetSchema = z.object({
  strategies: z.array(locatorStrategySchema).min(1),
});

export const variableDefSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["string", "number", "boolean"]),
  required: z.boolean().default(true),
  defaultValue: z.union([z.string(), z.number(), z.boolean()]).optional(),
});

const stepBaseSchema = z.object({
  id: z.string().min(1),
  label: z.string().optional(),
});

export const normalizedStepSchema = z.discriminatedUnion("type", [
  stepBaseSchema.extend({
    type: z.literal("navigate"),
    url: z.string().url(),
    waitUntil: z.enum(["load", "domcontentloaded", "networkidle"]).optional(),
  }),
  stepBaseSchema.extend({
    type: z.literal("click"),
    target: targetSchema,
    button: z.enum(["left", "right", "middle"]).optional(),
  }),
  stepBaseSchema.extend({
    type: z.literal("fill"),
    target: targetSchema,
    value: z.string(),
    clear: z.boolean().optional(),
  }),
  stepBaseSchema.extend({
    type: z.literal("wait"),
    ms: z.number().int().positive().optional(),
    condition: z.enum(["networkidle", "visible"]).optional(),
  }),
]);

export const flowDocumentSchema = z.object({
  schemaVersion: z.literal(FLOW_SCHEMA_VERSION),
  id: z.string().min(1),
  projectId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  variables: z.array(variableDefSchema).default([]),
  steps: z.array(normalizedStepSchema).min(1),
  meta: z.object({
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    source: z.enum(["recorded", "manual", "ai"]),
  }),
});

export type FlowDocument = z.infer<typeof flowDocumentSchema>;
export type NormalizedStep = z.infer<typeof normalizedStepSchema>;
export type Target = z.infer<typeof targetSchema>;
