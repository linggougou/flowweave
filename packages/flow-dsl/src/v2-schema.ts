import { z } from "zod";
import { FLOW_SCHEMA_VERSION_V2 } from "@flowweave/shared";

const templateReferencePattern = /\{\{\s*([^{}]+?)\s*\}\}/g;
const completeTemplateReferencePattern = /^\{\{([^{}]+)\}\}$/;
const generatedIdSchema = z
  .string()
  .min(9)
  .max(128)
  .regex(/^[A-Za-z][A-Za-z0-9._:-]*$/);
const legacyOpaqueIdSchema = z.string().min(1).max(512);

export type FlowV2ValidationCode =
  | "FLOW_V2_STRUCTURE_INVALID"
  | "FLOW_DUPLICATE_ID"
  | "FLOW_DUPLICATE_LABEL"
  | "FLOW_FIELD_REFERENCE_UNKNOWN"
  | "FLOW_FIELD_REFERENCE_FUTURE"
  | "FLOW_BINDING_TARGET_FORBIDDEN"
  | "FLOW_BINDING_MIXED_TEMPLATE_FORBIDDEN"
  | "FLOW_BINDING_TYPE_MISMATCH"
  | "FLOW_SENSITIVE_POLICY_INVALID"
  | "FLOW_SELECTION_CONTEXT_INVALID";

function addIssue(
  ctx: z.RefinementCtx,
  path: (string | number)[],
  code: FlowV2ValidationCode,
  message: string,
): void {
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path,
    message,
    params: { flowCode: code },
  });
}

const locatorStrategyV2Schema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("role"), role: z.string(), name: z.string().optional() }).strict(),
  z.object({ kind: z.literal("testId"), testId: z.string() }).strict(),
  z.object({ kind: z.literal("css"), selector: z.string() }).strict(),
  z.object({ kind: z.literal("xpath"), expression: z.string() }).strict(),
  z.object({ kind: z.literal("text"), text: z.string(), exact: z.boolean().optional() }).strict(),
]);

const targetHintsV2Schema = z
  .object({
    tagName: z.string().optional(),
    inputType: z.string().optional(),
    nameAttr: z.string().optional(),
    placeholder: z.string().optional(),
    labelText: z.string().optional(),
    textSample: z.string().optional(),
    scopeText: z.string().optional(),
    scopeKind: z.enum(["row", "listitem", "dialog", "tabpanel", "section", "card"]).optional(),
  })
  .strict();

const targetV2Schema = z
  .object({
    strategies: z.array(locatorStrategyV2Schema).min(1),
    hints: targetHintsV2Schema.optional(),
  })
  .strict();

const inputFieldV2Schema = z
  .object({
    fieldId: generatedIdSchema.regex(/^field_/),
    label: z.string().trim().min(1).max(80),
    description: z.string().trim().max(500).optional(),
    placeholder: z.string().trim().min(1).max(200).optional(),
    type: z.enum(["string", "number", "boolean"]),
    required: z.boolean(),
    sensitive: z.boolean(),
    remember: z.enum(["never", "lastValue"]),
    defaultValue: z.union([z.string(), z.number().finite(), z.boolean()]).optional(),
  })
  .strict()
  .superRefine((field, ctx) => {
    if (field.defaultValue !== undefined && typeof field.defaultValue !== field.type) {
      addIssue(
        ctx,
        ["defaultValue"],
        "FLOW_BINDING_TYPE_MISMATCH",
        `defaultValue 类型必须与 ${field.type} 完全一致`,
      );
    }
    if (!field.sensitive) {
      return;
    }
    if (field.type !== "string") {
      addIssue(
        ctx,
        ["type"],
        "FLOW_SENSITIVE_POLICY_INVALID",
        "敏感字段第一版必须使用 string 类型",
      );
    }
    if (field.remember !== "never") {
      addIssue(
        ctx,
        ["remember"],
        "FLOW_SENSITIVE_POLICY_INVALID",
        "敏感字段 remember 必须为 never",
      );
    }
    if (field.defaultValue !== undefined) {
      addIssue(ctx, ["defaultValue"], "FLOW_SENSITIVE_POLICY_INVALID", "敏感字段禁止 defaultValue");
    }
  });

const inputStepV2Schema = z
  .object({
    id: generatedIdSchema.regex(/^input_/),
    type: z.literal("input"),
    name: z.string().trim().min(1).max(80),
    description: z.string().trim().max(500).optional(),
    fields: z.array(inputFieldV2Schema).min(1).max(50),
  })
  .strict();

const selectionContextSchema = z.object({ searchStepId: legacyOpaqueIdSchema }).strict();

const stepBaseShape = {
  id: legacyOpaqueIdSchema,
  label: z.string().optional(),
};

const waitConditionSchema = z.enum([
  "networkidle",
  "visible",
  "hidden",
  "attached",
  "detached",
  "urlIncludes",
]);

const browserStepV2Schema = z.discriminatedUnion("type", [
  z
    .object({
      ...stepBaseShape,
      type: z.literal("navigate"),
      url: z.string().min(1),
      waitUntil: z.enum(["load", "domcontentloaded", "networkidle"]).optional(),
    })
    .strict(),
  z
    .object({
      ...stepBaseShape,
      type: z.literal("click"),
      target: targetV2Schema,
      button: z.enum(["left", "right", "middle"]).optional(),
      selectionContext: selectionContextSchema.optional(),
    })
    .strict(),
  z
    .object({
      ...stepBaseShape,
      type: z.literal("fill"),
      target: targetV2Schema,
      value: z.string(),
      clear: z.boolean().optional(),
    })
    .strict(),
  z
    .object({
      ...stepBaseShape,
      type: z.literal("select"),
      target: targetV2Schema,
      values: z.array(z.string()).min(1),
    })
    .strict(),
  z
    .object({
      ...stepBaseShape,
      type: z.literal("setChecked"),
      target: targetV2Schema,
      checked: z.union([z.boolean(), z.string()]),
    })
    .strict(),
  z
    .object({
      ...stepBaseShape,
      type: z.literal("press"),
      target: targetV2Schema.optional(),
      key: z.string().min(1),
      selectionContext: selectionContextSchema.optional(),
    })
    .strict(),
  z
    .object({
      ...stepBaseShape,
      type: z.literal("scroll"),
      target: targetV2Schema.optional(),
      x: z.number().nonnegative(),
      y: z.number().nonnegative(),
    })
    .strict(),
  z
    .object({
      ...stepBaseShape,
      type: z.literal("upload"),
      target: targetV2Schema,
      files: z.array(z.string().min(1)).min(1),
    })
    .strict(),
  z
    .object({
      ...stepBaseShape,
      type: z.literal("wait"),
      ms: z.number().int().positive().optional(),
      condition: waitConditionSchema.optional(),
      target: targetV2Schema.optional(),
      urlIncludes: z.string().min(1).optional(),
    })
    .strict(),
]);

const stepV2Schema = z.union([inputStepV2Schema, browserStepV2Schema]);

const flowMetaV2Schema = z
  .object({
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    source: z.enum(["recorded", "manual", "ai"]),
  })
  .strict();

const flowDocumentV2BaseSchema = z
  .object({
    schemaVersion: z.literal(FLOW_SCHEMA_VERSION_V2),
    id: legacyOpaqueIdSchema,
    projectId: legacyOpaqueIdSchema,
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(2000).optional(),
    steps: z.array(stepV2Schema).min(1).max(1000),
    meta: flowMetaV2Schema,
  })
  .strict();

export type FlowDocumentV2 = z.infer<typeof flowDocumentV2BaseSchema>;
export type FlowStepV2 = FlowDocumentV2["steps"][number];
export type InputStepV2 = Extract<FlowStepV2, { type: "input" }>;
export type InputFieldV2 = InputStepV2["fields"][number];

export type FlowBindingV2 = {
  stepId: string;
  stepIndex: number;
  path: string;
  fieldId: string;
  inputNodeId: string;
  fieldType: InputFieldV2["type"];
  sensitive: boolean;
};

type AllowedSlot = {
  value: string;
  path: (string | number)[];
  displayPath: string;
  types: readonly InputFieldV2["type"][];
  kind:
    | "fill.value"
    | "select.values[0]"
    | "setChecked.checked"
    | "navigate.url"
    | "wait.urlIncludes"
    | "target";
};

function displayPath(path: (string | number)[]): string {
  return path.reduce<string>((result, item) => {
    if (typeof item === "number") {
      return `${result}[${item}]`;
    }
    return result ? `${result}.${item}` : item;
  }, "");
}

function collectAllowedSlots(step: FlowStepV2, stepIndex: number): AllowedSlot[] {
  if (step.type === "input") {
    return [];
  }
  const base = ["steps", stepIndex] as (string | number)[];
  const slots: AllowedSlot[] = [];
  const add = (
    value: string | boolean | undefined,
    suffix: (string | number)[],
    types: readonly InputFieldV2["type"][],
    kind: AllowedSlot["kind"],
  ) => {
    if (typeof value !== "string") {
      return;
    }
    const path = [...base, ...suffix];
    slots.push({ value, path, displayPath: displayPath(path), types, kind });
  };

  if (step.type === "navigate") {
    add(step.url, ["url"], ["string"], "navigate.url");
  } else if (step.type === "fill") {
    add(step.value, ["value"], ["string", "number"], "fill.value");
  } else if (step.type === "select") {
    step.values.forEach((value, index) =>
      add(value, ["values", index], ["string"], "select.values[0]"),
    );
  } else if (step.type === "setChecked") {
    add(step.checked, ["checked"], ["boolean"], "setChecked.checked");
  } else if (step.type === "wait" && step.condition === "urlIncludes") {
    add(step.urlIncludes, ["urlIncludes"], ["string"], "wait.urlIncludes");
  }

  if ("target" in step && step.target) {
    step.target.strategies.forEach((strategy, strategyIndex) => {
      if (strategy.kind === "role") {
        add(strategy.name, ["target", "strategies", strategyIndex, "name"], ["string"], "target");
      } else if (strategy.kind === "text") {
        add(strategy.text, ["target", "strategies", strategyIndex, "text"], ["string"], "target");
      }
    });
  }
  return slots;
}

function walkStrings(
  value: unknown,
  path: (string | number)[],
  visit: (text: string, path: (string | number)[]) => void,
): void {
  if (typeof value === "string") {
    visit(value, path);
  } else if (Array.isArray(value)) {
    value.forEach((item, index) => walkStrings(item, [...path, index], visit));
  } else if (value !== null && typeof value === "object") {
    Object.entries(value).forEach(([key, item]) => walkStrings(item, [...path, key], visit));
  }
}

function hasTemplateReference(value: string): boolean {
  templateReferencePattern.lastIndex = 0;
  return templateReferencePattern.test(value);
}

function validateFlowDocumentV2(flow: FlowDocumentV2, ctx: z.RefinementCtx): void {
  const stepIds = new Map<string, number>();
  const fields = new Map<
    string,
    { field: InputFieldV2; inputNodeId: string; stepIndex: number; path: (string | number)[] }
  >();
  const bindings: FlowBindingV2[] = [];

  flow.steps.forEach((step, stepIndex) => {
    const previousStepIndex = stepIds.get(step.id);
    if (previousStepIndex !== undefined) {
      addIssue(
        ctx,
        ["steps", stepIndex, "id"],
        "FLOW_DUPLICATE_ID",
        `步骤 id 重复，首次出现在 steps[${previousStepIndex}]`,
      );
    } else {
      stepIds.set(step.id, stepIndex);
    }
    if (step.type !== "input") {
      if (step.type === "wait") {
        if (step.ms === undefined && step.condition === undefined) {
          addIssue(
            ctx,
            ["steps", stepIndex, "condition"],
            "FLOW_V2_STRUCTURE_INVALID",
            "wait 步骤必须至少提供 ms 或 condition",
          );
        }
        if (
          step.condition !== undefined &&
          ["visible", "hidden", "attached", "detached"].includes(step.condition) &&
          step.target === undefined
        ) {
          addIssue(
            ctx,
            ["steps", stepIndex, "target"],
            "FLOW_V2_STRUCTURE_INVALID",
            "目标等待条件必须提供 target",
          );
        }
        if (step.condition === "urlIncludes" && step.urlIncludes === undefined) {
          addIssue(
            ctx,
            ["steps", stepIndex, "urlIncludes"],
            "FLOW_V2_STRUCTURE_INVALID",
            "urlIncludes 条件必须提供匹配片段",
          );
        }
        if (step.condition !== "urlIncludes" && step.urlIncludes !== undefined) {
          addIssue(
            ctx,
            ["steps", stepIndex, "urlIncludes"],
            "FLOW_V2_STRUCTURE_INVALID",
            "urlIncludes 只允许用于同名条件",
          );
        }
      }
      return;
    }
    const labels = new Map<string, number>();
    step.fields.forEach((field, fieldIndex) => {
      const fieldPath = ["steps", stepIndex, "fields", fieldIndex] as (string | number)[];
      const previous = fields.get(field.fieldId);
      if (previous) {
        addIssue(
          ctx,
          [...fieldPath, "fieldId"],
          "FLOW_DUPLICATE_ID",
          `fieldId 重复，首次出现在 ${displayPath(previous.path)}`,
        );
      } else {
        fields.set(field.fieldId, {
          field,
          inputNodeId: step.id,
          stepIndex,
          path: [...fieldPath, "fieldId"],
        });
      }
      const labelKey = field.label.trim().normalize("NFKC").toLowerCase();
      const previousLabel = labels.get(labelKey);
      if (previousLabel !== undefined) {
        addIssue(
          ctx,
          [...fieldPath, "label"],
          "FLOW_DUPLICATE_LABEL",
          `label 规范化后重复，首次出现在 fields[${previousLabel}]`,
        );
      } else {
        labels.set(labelKey, fieldIndex);
      }
    });
  });

  flow.steps.forEach((step, stepIndex) => {
    const allowedSlots = collectAllowedSlots(step, stepIndex);
    const allowedPaths = new Set(allowedSlots.map((slot) => slot.displayPath));
    walkStrings(step, ["steps", stepIndex], (value, path) => {
      const pathText = displayPath(path);
      if (!allowedPaths.has(pathText) && hasTemplateReference(value)) {
        addIssue(ctx, path, "FLOW_BINDING_TARGET_FORBIDDEN", `字段引用禁止出现在 ${pathText}`);
      }
    });

    allowedSlots.forEach((slot) => {
      if (!hasTemplateReference(slot.value)) {
        return;
      }
      const match = completeTemplateReferencePattern.exec(slot.value);
      if (!match || match[1]?.trim() !== match[1]) {
        addIssue(
          ctx,
          slot.path,
          "FLOW_BINDING_MIXED_TEMPLATE_FORBIDDEN",
          `${slot.displayPath} 只允许完整且唯一的 {{fieldId}} 引用，禁止混合模板`,
        );
        return;
      }
      const fieldId = match[1]!;
      const source = fields.get(fieldId);
      if (!source) {
        addIssue(
          ctx,
          slot.path,
          "FLOW_FIELD_REFERENCE_UNKNOWN",
          `${slot.displayPath} 引用的 fieldId 不存在`,
        );
        return;
      }
      if (source.stepIndex >= stepIndex) {
        addIssue(
          ctx,
          slot.path,
          "FLOW_FIELD_REFERENCE_FUTURE",
          `${slot.displayPath} 引用了消费步骤之后的未来输入节点`,
        );
      }
      if (!slot.types.includes(source.field.type)) {
        addIssue(
          ctx,
          slot.path,
          "FLOW_BINDING_TYPE_MISMATCH",
          `${slot.displayPath} 不接受 ${source.field.type} 类型字段`,
        );
      }
      if (!source.field.required && source.field.defaultValue === undefined) {
        addIssue(
          ctx,
          slot.path,
          "FLOW_BINDING_TYPE_MISMATCH",
          `可选字段 ${fieldId} 被消费时必须提供 defaultValue`,
        );
      }
      if (source.field.sensitive && slot.kind !== "fill.value") {
        addIssue(
          ctx,
          slot.path,
          "FLOW_SENSITIVE_POLICY_INVALID",
          `敏感字段 ${fieldId} 只能绑定到 fill.value`,
        );
      }
      if (step.type === "select" && step.values.length !== 1) {
        addIssue(
          ctx,
          ["steps", stepIndex, "values"],
          "FLOW_BINDING_TYPE_MISMATCH",
          "select 包含字段引用时 values 必须恰好一项",
        );
      }
      bindings.push({
        stepId: step.id,
        stepIndex,
        path: slot.displayPath,
        fieldId,
        inputNodeId: source.inputNodeId,
        fieldType: source.field.type,
        sensitive: source.field.sensitive,
      });
    });
  });

  flow.steps.forEach((step, stepIndex) => {
    if (step.type !== "click" && step.type !== "press") {
      return;
    }
    if (!step.selectionContext) {
      return;
    }
    const path = ["steps", stepIndex, "selectionContext", "searchStepId"] as (string | number)[];
    if (!step.target) {
      addIssue(
        ctx,
        path,
        "FLOW_SELECTION_CONTEXT_INVALID",
        "selectionContext 的选择步骤必须提供 target",
      );
      return;
    }
    const searchIndex = stepIds.get(step.selectionContext.searchStepId);
    if (searchIndex === undefined || searchIndex >= stepIndex) {
      addIssue(
        ctx,
        path,
        "FLOW_SELECTION_CONTEXT_INVALID",
        "selectionContext 必须指向同一 Flow 中更早的搜索步骤",
      );
      return;
    }
    const searchStep = flow.steps[searchIndex];
    if (!searchStep || (searchStep.type !== "fill" && searchStep.type !== "select")) {
      addIssue(
        ctx,
        path,
        "FLOW_SELECTION_CONTEXT_INVALID",
        "selectionContext 的搜索来源必须是 fill 或 select",
      );
      return;
    }
    const searchBindings = bindings.filter((binding) => binding.stepIndex === searchIndex);
    if (
      !searchBindings.some(
        (binding) => binding.fieldType === "string" && binding.sensitive === false,
      )
    ) {
      addIssue(
        ctx,
        path,
        "FLOW_SELECTION_CONTEXT_INVALID",
        "搜索步骤必须消费一个非敏感 string 字段",
      );
    }
  });
}

export const flowDocumentV2Schema: z.ZodType<FlowDocumentV2> =
  flowDocumentV2BaseSchema.superRefine(validateFlowDocumentV2);

export function collectFlowBindingsV2(flow: FlowDocumentV2): FlowBindingV2[] {
  const fields = new Map<string, { field: InputFieldV2; inputNodeId: string }>();
  flow.steps.forEach((step) => {
    if (step.type === "input") {
      step.fields.forEach((field) => fields.set(field.fieldId, { field, inputNodeId: step.id }));
    }
  });
  return flow.steps.flatMap((step, stepIndex) =>
    collectAllowedSlots(step, stepIndex).flatMap((slot) => {
      const match = completeTemplateReferencePattern.exec(slot.value);
      const fieldId = match?.[1];
      const source = fieldId ? fields.get(fieldId) : undefined;
      return fieldId && source
        ? [
            {
              stepId: step.id,
              stepIndex,
              path: slot.displayPath,
              fieldId,
              inputNodeId: source.inputNodeId,
              fieldType: source.field.type,
              sensitive: source.field.sensitive,
            },
          ]
        : [];
    }),
  );
}
