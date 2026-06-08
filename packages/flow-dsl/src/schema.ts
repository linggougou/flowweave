import { z } from "zod";
import { FLOW_SCHEMA_VERSION } from "@flowweave/shared";

export const locatorStrategySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("role"), role: z.string(), name: z.string().optional() }),
  z.object({ kind: z.literal("testId"), testId: z.string() }),
  z.object({ kind: z.literal("css"), selector: z.string() }),
  z.object({ kind: z.literal("xpath"), expression: z.string() }),
  z.object({ kind: z.literal("text"), text: z.string(), exact: z.boolean().optional() }),
]);

export const targetHintsSchema = z.object({
  tagName: z.string().optional(),
  inputType: z.string().optional(),
  nameAttr: z.string().optional(),
  placeholder: z.string().optional(),
  labelText: z.string().optional(),
  textSample: z.string().optional(),
  scopeText: z.string().optional(),
  scopeKind: z.enum(["row", "listitem", "dialog", "tabpanel", "section", "card"]).optional(),
});

export const targetSchema = z.object({
  strategies: z.array(locatorStrategySchema).min(1),
  hints: targetHintsSchema.optional(),
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

const waitTargetConditions = ["visible", "hidden", "attached", "detached"] as const;
const waitConditionSchema = z.enum([
  "networkidle",
  "visible",
  "hidden",
  "attached",
  "detached",
  "urlIncludes",
]);

const waitStepSchema = stepBaseSchema.extend({
  type: z.literal("wait"),
  ms: z.number().int().positive().optional(),
  condition: waitConditionSchema.optional(),
  target: targetSchema.optional(),
  urlIncludes: z.string().min(1).optional(),
});

const normalizedStepBaseSchema = z.discriminatedUnion("type", [
  stepBaseSchema.extend({
    type: z.literal("navigate"),
    url: z.string().min(1),
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
    type: z.literal("select"),
    target: targetSchema,
    values: z.array(z.string()).min(1),
  }),
  stepBaseSchema.extend({
    type: z.literal("setChecked"),
    target: targetSchema,
    checked: z.boolean(),
  }),
  stepBaseSchema.extend({
    type: z.literal("press"),
    target: targetSchema.optional(),
    key: z.string().min(1),
  }),
  stepBaseSchema.extend({
    type: z.literal("scroll"),
    target: targetSchema.optional(),
    x: z.number().nonnegative(),
    y: z.number().nonnegative(),
  }),
  stepBaseSchema.extend({
    type: z.literal("upload"),
    target: targetSchema,
    files: z.array(z.string().min(1)).min(1),
  }),
  waitStepSchema,
]);

export const normalizedStepSchema = normalizedStepBaseSchema.superRefine((step, ctx) => {
  if (step.type !== "wait") {
    return;
  }

  if (step.ms === undefined && step.condition === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["condition"],
      message: "wait 步骤必须至少提供 ms 或 condition",
    });
  }

  if (
    step.condition !== undefined &&
    waitTargetConditions.includes(step.condition as (typeof waitTargetConditions)[number]) &&
    step.target === undefined
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["target"],
      message: `wait condition=${step.condition} 时必须提供 target`,
    });
  }

  if (step.condition === "urlIncludes" && step.urlIncludes === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["urlIncludes"],
      message: "wait condition=urlIncludes 时必须提供 urlIncludes",
    });
  }
});

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

type FlowDocumentBase = z.infer<typeof flowDocumentSchema>;
export type NormalizedStep = z.infer<typeof normalizedStepBaseSchema>;
export type FlowDocument = Omit<FlowDocumentBase, "steps"> & {
  steps: NormalizedStep[];
};
export type Target = z.infer<typeof targetSchema>;
