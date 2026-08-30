import { extractTemplateVariables, getSingleTemplateVariableName } from "@flowweave/shared";
import { canonicalizeJson, sha256Hex } from "./canonical-json.js";
import { parseFlowDocumentV1 } from "./parsers.js";
import {
  flowDocumentV2Schema,
  type FlowDocumentV2,
  type FlowStepV2,
  type InputFieldV2,
} from "./v2-schema.js";
import type { FlowDocument, Target } from "./schema.js";

export type FlowUpgradeIssueCode =
  | "DUPLICATE_VARIABLE_NAME"
  | "DUPLICATE_STEP_ID"
  | "UNKNOWN_VARIABLE_REFERENCE"
  | "MIXED_TEMPLATE"
  | "FORBIDDEN_BINDING_TARGET"
  | "BINDING_TYPE_MISMATCH"
  | "DEFAULT_TYPE_MISMATCH"
  | "SENSITIVE_TYPE_INVALID"
  | "SENSITIVE_REMEMBER_FORBIDDEN"
  | "SENSITIVE_LITERAL"
  | "OPTIONAL_FIELD_WITHOUT_DEFAULT"
  | "LABEL_NORMALIZED"
  | "UNUSED_VARIABLE"
  | "CANDIDATE_INVALID";

export type FlowUpgradeIssue = {
  code: FlowUpgradeIssueCode;
  path: string;
  message: string;
  variableName?: string;
  fieldId?: string;
};

export type FlowUpgradeFieldMapping = {
  variableIndex: number;
  variableName: string;
  fieldId: string;
  sensitive: boolean;
};

export type FlowV1UpgradePreviewOptions = {
  rememberSelections?: Record<string, "never" | "lastValue">;
};

export type FlowV1UpgradePreview = {
  candidate: FlowDocumentV2 | null;
  fieldMappings: FlowUpgradeFieldMapping[];
  warnings: FlowUpgradeIssue[];
  blockingIssues: FlowUpgradeIssue[];
  canonicalJson: string;
  reportFingerprint: string;
};

type MutableStep = Record<string, unknown> & { id: string; type: string };
type Slot = {
  path: string;
  value: string;
  set: (value: string) => void;
  kind: string;
  allowedTypes: readonly ("string" | "number" | "boolean")[];
};

const secretVariablePattern = /^secret_/i;
const passwordTargetPattern = /password|passwd|passcode|pwd|密码|口令/i;
const sensitiveQueryKeys = new Set([
  "token",
  "accesstoken",
  "refreshtoken",
  "idtoken",
  "sessiontoken",
  "bearertoken",
  "apikey",
  "key",
  "secret",
  "clientsecret",
  "password",
  "passwd",
  "auth",
  "authorization",
]);

function isPasswordTarget(target: Target): boolean {
  if (target.hints?.inputType?.toLowerCase() === "password") {
    return true;
  }
  if (
    [target.hints?.nameAttr, target.hints?.placeholder, target.hints?.labelText].some(
      (value) => value !== undefined && passwordTargetPattern.test(value),
    )
  ) {
    return true;
  }
  return target.strategies.some((strategy) => {
    if (strategy.kind === "css") {
      return passwordTargetPattern.test(strategy.selector);
    }
    return (
      strategy.kind === "role" &&
      strategy.name !== undefined &&
      passwordTargetPattern.test(strategy.name)
    );
  });
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function collectAllowedSlots(step: MutableStep, stepIndex: number): Slot[] {
  const slots: Slot[] = [];
  const add = (
    container: Record<string, unknown> | unknown[],
    key: string | number,
    path: string,
    kind: string,
    allowedTypes: Slot["allowedTypes"],
  ) => {
    const value = container[key as never];
    if (typeof value === "string") {
      slots.push({
        value,
        path: `steps[${stepIndex}].${path}`,
        kind,
        allowedTypes,
        set: (next) => {
          container[key as never] = next as never;
        },
      });
    }
  };

  if (step.type === "navigate") {
    add(step, "url", "url", "navigate.url", ["string"]);
  } else if (step.type === "fill") {
    add(step, "value", "value", "fill.value", ["string", "number"]);
  } else if (step.type === "select" && Array.isArray(step.values)) {
    step.values.forEach((_value, index) =>
      add(step.values as unknown[], index, `values[${index}]`, "select.values[0]", ["string"]),
    );
  } else if (step.type === "wait" && step.condition === "urlIncludes") {
    add(step, "urlIncludes", "urlIncludes", "wait.urlIncludes", ["string"]);
  }

  const target = step.target;
  if (target && typeof target === "object" && !Array.isArray(target)) {
    const strategies = (target as { strategies?: unknown }).strategies;
    if (Array.isArray(strategies)) {
      strategies.forEach((strategy, index) => {
        if (!strategy || typeof strategy !== "object" || Array.isArray(strategy)) {
          return;
        }
        const record = strategy as Record<string, unknown>;
        if (record.kind === "role") {
          add(record, "name", `target.strategies[${index}].name`, "target", ["string"]);
        } else if (record.kind === "text") {
          add(record, "text", `target.strategies[${index}].text`, "target", ["string"]);
        }
      });
    }
  }
  return slots;
}

function normalizeQueryKey(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, " ")).trim().toLowerCase().replace(/[._-]/g, "");
  } catch {
    return value.trim().toLowerCase().replace(/[._-]/g, "");
  }
}

function collectSensitiveUrlVariableNames(value: string, target: Set<string>): void {
  const parameterSections = [
    value.includes("?") ? (value.slice(value.indexOf("?") + 1).split("#", 1)[0] ?? "") : "",
    value.includes("#") ? value.slice(value.indexOf("#") + 1).replace(/^.*?\?/, "") : "",
  ];
  parameterSections.forEach((section) => {
    section.split("&").forEach((part) => {
      const separator = part.indexOf("=");
      if (separator <= 0 || !sensitiveQueryKeys.has(normalizeQueryKey(part.slice(0, separator)))) {
        return;
      }
      const rawValue = part.slice(separator + 1);
      let decodedValue = rawValue;
      try {
        decodedValue = decodeURIComponent(rawValue.replace(/\+/g, " "));
      } catch {
        // 保留原始值继续做只读模板识别。
      }
      extractTemplateVariables(decodedValue).forEach((name) => target.add(name));
    });
  });
}

function walkStrings(
  value: unknown,
  path: string,
  visit: (value: string, path: string) => void,
): void {
  if (typeof value === "string") {
    visit(value, path);
  } else if (Array.isArray(value)) {
    value.forEach((item, index) => walkStrings(item, `${path}[${index}]`, visit));
  } else if (value !== null && typeof value === "object") {
    Object.entries(value).forEach(([key, item]) => walkStrings(item, `${path}.${key}`, visit));
  }
}

function normalizeLabel(raw: string, used: Set<string>): { label: string; changed: boolean } {
  const trimmed = raw.trim();
  let label = trimmed.slice(0, 80) || "未命名字段";
  let key = label.normalize("NFKC").toLowerCase();
  let suffix = 2;
  while (used.has(key)) {
    const marker = `（${suffix}）`;
    label = `${trimmed.slice(0, Math.max(1, 80 - marker.length))}${marker}`;
    key = label.normalize("NFKC").toLowerCase();
    suffix += 1;
  }
  used.add(key);
  return { label, changed: label !== raw };
}

function exactDefaultType(variable: FlowDocument["variables"][number]): boolean {
  return variable.defaultValue === undefined || typeof variable.defaultValue === variable.type;
}

function addUniqueIssue(target: FlowUpgradeIssue[], issue: FlowUpgradeIssue): void {
  if (!target.some((existing) => existing.code === issue.code && existing.path === issue.path)) {
    target.push(issue);
  }
}

export function previewFlowV1Upgrade(
  input: FlowDocument,
  options: FlowV1UpgradePreviewOptions = {},
): FlowV1UpgradePreview {
  const flow = parseFlowDocumentV1(input);
  const blockingIssues: FlowUpgradeIssue[] = [];
  const warnings: FlowUpgradeIssue[] = [];
  const sensitiveNames = new Set<string>(
    flow.variables
      .filter((variable) => secretVariablePattern.test(variable.name))
      .map((variable) => variable.name),
  );
  const variableCounts = new Map<string, number>();
  flow.variables.forEach((variable, index) => {
    const count = (variableCounts.get(variable.name) ?? 0) + 1;
    variableCounts.set(variable.name, count);
    if (count > 1) {
      addUniqueIssue(blockingIssues, {
        code: "DUPLICATE_VARIABLE_NAME",
        path: `variables[${index}].name`,
        message: "变量名重复，无法建立唯一字段映射",
        variableName: variable.name,
      });
    }
    if (!exactDefaultType(variable)) {
      addUniqueIssue(blockingIssues, {
        code: "DEFAULT_TYPE_MISMATCH",
        path: `variables[${index}].defaultValue`,
        message: "defaultValue 类型与变量声明不一致",
        variableName: variable.name,
      });
    }
  });

  const stepIds = new Set<string>();
  flow.steps.forEach((step, stepIndex) => {
    if (stepIds.has(step.id)) {
      addUniqueIssue(blockingIssues, {
        code: "DUPLICATE_STEP_ID",
        path: `steps[${stepIndex}].id`,
        message: "既有 stepId 重复，迁移不能静默改写资产身份",
      });
    }
    stepIds.add(step.id);
    if (step.type === "fill" && isPasswordTarget(step.target)) {
      const name = getSingleTemplateVariableName(step.value);
      if (name) {
        sensitiveNames.add(name);
      } else if (extractTemplateVariables(step.value).length === 0 && step.value.length > 0) {
        addUniqueIssue(blockingIssues, {
          code: "SENSITIVE_LITERAL",
          path: `steps[${stepIndex}].value`,
          message: "密码输入包含字面值，必须先安全变量化",
        });
      }
    }
    if (step.type === "upload") {
      step.files.forEach((file) => {
        const name = getSingleTemplateVariableName(file);
        if (name) {
          sensitiveNames.add(name);
        }
      });
    }
    if (step.type === "navigate") {
      collectSensitiveUrlVariableNames(step.url, sensitiveNames);
    }
    if (step.type === "wait" && step.condition === "urlIncludes" && step.urlIncludes) {
      collectSensitiveUrlVariableNames(step.urlIncludes, sensitiveNames);
    }
  });

  const fieldMappings = flow.variables.map((variable, index) => ({
    variableIndex: index,
    variableName: variable.name,
    fieldId: `field_${sha256Hex(`${flow.id}${index}${variable.name}`).slice(0, 20)}`,
    sensitive: sensitiveNames.has(variable.name),
  }));
  const mappingByName = new Map(fieldMappings.map((mapping) => [mapping.variableName, mapping]));
  const usageCounts = new Map<string, number>();
  const clonedSteps = deepClone(flow.steps) as unknown as MutableStep[];

  clonedSteps.forEach((step, stepIndex) => {
    const slots = collectAllowedSlots(step, stepIndex);
    const allowedPaths = new Set(slots.map((slot) => slot.path));
    walkStrings(step, `steps[${stepIndex}]`, (value, path) => {
      if (allowedPaths.has(path) || extractTemplateVariables(value).length === 0) {
        return;
      }
      addUniqueIssue(blockingIssues, {
        code: "FORBIDDEN_BINDING_TARGET",
        path,
        message: "字段引用位于 v2 禁止绑定槽位",
      });
    });

    slots.forEach((slot) => {
      const references = extractTemplateVariables(slot.value);
      if (references.length === 0) {
        return;
      }
      const exact = getSingleTemplateVariableName(slot.value);
      if (!exact || references.length !== 1) {
        addUniqueIssue(blockingIssues, {
          code: "MIXED_TEMPLATE",
          path: slot.path,
          message: "v2 只允许完整且唯一的字段引用，禁止混合模板",
        });
        return;
      }
      const mapping = mappingByName.get(exact);
      if (!mapping || (variableCounts.get(exact) ?? 0) !== 1) {
        addUniqueIssue(blockingIssues, {
          code: "UNKNOWN_VARIABLE_REFERENCE",
          path: slot.path,
          message: "引用无法唯一解析到已声明变量",
          variableName: exact,
        });
        return;
      }
      if (mapping.sensitive && slot.kind !== "fill.value") {
        addUniqueIssue(blockingIssues, {
          code: "FORBIDDEN_BINDING_TARGET",
          path: slot.path,
          message: "敏感字段只能迁移到 fill.value",
          fieldId: mapping.fieldId,
        });
        return;
      }
      const variable = flow.variables[mapping.variableIndex];
      if (variable && !slot.allowedTypes.includes(variable.type)) {
        addUniqueIssue(blockingIssues, {
          code: "BINDING_TYPE_MISMATCH",
          path: slot.path,
          message: "变量类型与 v2 绑定槽位不兼容",
          fieldId: mapping.fieldId,
        });
        return;
      }
      usageCounts.set(exact, (usageCounts.get(exact) ?? 0) + 1);
      slot.set(`{{${mapping.fieldId}}}`);
    });
  });

  const labels = new Set<string>();
  const fields: InputFieldV2[] = flow.variables.map((variable, index) => {
    const mapping = fieldMappings[index]!;
    const normalized = normalizeLabel(variable.name, labels);
    if (normalized.changed) {
      warnings.push({
        code: "LABEL_NORMALIZED",
        path: `variables[${index}].name`,
        message: "字段 label 已按长度或同节点唯一性规则确定性规范化",
        variableName: variable.name,
        fieldId: mapping.fieldId,
      });
    }
    const remember = options.rememberSelections?.[mapping.fieldId] ?? "never";
    if (mapping.sensitive && variable.type !== "string") {
      addUniqueIssue(blockingIssues, {
        code: "SENSITIVE_TYPE_INVALID",
        path: `variables[${index}].type`,
        message: "敏感迁移字段第一版必须为 string",
        fieldId: mapping.fieldId,
      });
    }
    if (mapping.sensitive && remember === "lastValue") {
      addUniqueIssue(blockingIssues, {
        code: "SENSITIVE_REMEMBER_FORBIDDEN",
        path: `variables[${index}]`,
        message: "敏感迁移字段不能选择 lastValue",
        fieldId: mapping.fieldId,
      });
    }
    if (
      !variable.required &&
      variable.defaultValue === undefined &&
      (usageCounts.get(variable.name) ?? 0) > 0
    ) {
      addUniqueIssue(blockingIssues, {
        code: "OPTIONAL_FIELD_WITHOUT_DEFAULT",
        path: `variables[${index}]`,
        message: "被消费的可选字段必须提供类型匹配的 defaultValue",
        fieldId: mapping.fieldId,
      });
    }
    if ((usageCounts.get(variable.name) ?? 0) === 0) {
      warnings.push({
        code: "UNUSED_VARIABLE",
        path: `variables[${index}]`,
        message: "变量未被任何步骤消费",
        variableName: variable.name,
        fieldId: mapping.fieldId,
      });
    }
    const field: InputFieldV2 = {
      fieldId: mapping.fieldId,
      label: normalized.label,
      type: variable.type,
      required: variable.required,
      sensitive: mapping.sensitive,
      remember: mapping.sensitive ? "never" : remember,
    };
    if (!mapping.sensitive && variable.defaultValue !== undefined && exactDefaultType(variable)) {
      field.defaultValue = variable.defaultValue;
    }
    return field;
  });

  let candidate: FlowDocumentV2 | null = null;
  if (blockingIssues.length === 0) {
    const steps: FlowStepV2[] = clonedSteps as unknown as FlowStepV2[];
    if (fields.length > 0) {
      steps.unshift({
        id: `input_${sha256Hex(`${flow.id}:input`).slice(0, 20)}`,
        type: "input",
        name: "运行前输入",
        fields,
      });
    }
    const rawCandidate = {
      schemaVersion: 2 as const,
      id: flow.id,
      projectId: flow.projectId,
      name: flow.name,
      ...(flow.description === undefined ? {} : { description: flow.description }),
      steps,
      meta: deepClone(flow.meta),
    };
    const result = flowDocumentV2Schema.safeParse(rawCandidate);
    if (result.success) {
      candidate = result.data;
    } else {
      blockingIssues.push({
        code: "CANDIDATE_INVALID",
        path: result.error.issues[0]?.path.join(".") ?? "document",
        message: result.error.issues[0]?.message ?? "迁移候选未通过 v2 合同",
      });
    }
  }

  const canonicalJson = candidate
    ? canonicalizeJson(candidate)
    : canonicalizeJson({
        flowId: flow.id,
        projectId: flow.projectId,
        fieldMappings,
        warnings,
        blockingIssues,
      });
  return {
    candidate,
    fieldMappings,
    warnings,
    blockingIssues,
    canonicalJson,
    reportFingerprint: sha256Hex(canonicalJson),
  };
}
