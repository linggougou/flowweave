import type { FlowDocument } from "@flowweave/flow-dsl";
import { analyzeFlowFragility } from "@flowweave/page-intelligence";

import type {
  RunFlowVariableValue,
  StudioFlowRunInput,
  StudioRunPreflightIssue,
} from "./studio-api-types.js";

export type VariableInputs = Record<string, string>;

type FlowVariableDefinition = FlowDocument["variables"][number];

export type RunDraftState = {
  selectedEnvironmentName: string;
  baseUrlDraft: string;
  storageStatePathDraft: string;
  variableInputs: VariableInputs;
};

function stringifyDefaultVariableValue(
  value: FlowVariableDefinition["defaultValue"],
): string {
  if (value === undefined) {
    return "";
  }
  return String(value);
}

export function toVariableInputString(value: RunFlowVariableValue): string {
  return String(value);
}

export function buildInitialVariableInputs(
  flow: FlowDocument | null,
  previous: VariableInputs = {},
): VariableInputs {
  if (!flow) {
    return {};
  }

  const next: VariableInputs = {};
  for (const variable of flow.variables) {
    next[variable.name] =
      previous[variable.name] ?? stringifyDefaultVariableValue(variable.defaultValue);
  }
  return next;
}

export function buildVariableInputsForFlow(
  flow: FlowDocument | null,
  options: {
    previous?: VariableInputs;
    previousFlowId?: string | null;
  } = {},
): VariableInputs {
  if (!flow) {
    return {};
  }

  if (options.previousFlowId === flow.id) {
    return buildInitialVariableInputs(flow, options.previous);
  }

  return buildInitialVariableInputs(flow);
}

export function shouldRestoreRecentRunInput(
  flow: FlowDocument | null,
  selectedFlowId: string | null,
): flow is FlowDocument {
  return flow !== null && selectedFlowId !== null && flow.id === selectedFlowId;
}

export function parseVariableInput(
  variable: FlowVariableDefinition,
  rawValue: string,
): RunFlowVariableValue | undefined {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    if (variable.required) {
      throw new Error(`变量 ${variable.name} 不能为空`);
    }
    return undefined;
  }

  switch (variable.type) {
    case "string":
      return rawValue;
    case "number": {
      const numericValue = Number(trimmed);
      if (Number.isNaN(numericValue)) {
        throw new Error(`变量 ${variable.name} 必须是数字`);
      }
      return numericValue;
    }
    case "boolean":
      if (trimmed !== "true" && trimmed !== "false") {
        throw new Error(`变量 ${variable.name} 必须是 true 或 false`);
      }
      return trimmed === "true";
  }
}

export function buildFragilityVariableContext(
  flow: FlowDocument | null,
  variableInputs: VariableInputs,
): Record<string, string> | undefined {
  if (!flow) {
    return undefined;
  }

  const entries = flow.variables.flatMap((variable) => {
    const rawValue = variableInputs[variable.name];
    if (!rawValue || rawValue.trim().length === 0) {
      return [];
    }
    return [[variable.name, rawValue] as const];
  });

  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

export function buildRunDraftState(
  flow: FlowDocument | null,
  recentInput?: StudioFlowRunInput | null,
): RunDraftState {
  const variableInputs = buildInitialVariableInputs(flow);
  if (flow && recentInput?.variables) {
    for (const variable of flow.variables) {
      const restored = recentInput.variables[variable.name];
      if (restored !== undefined) {
        variableInputs[variable.name] = toVariableInputString(
          restored as RunFlowVariableValue,
        );
      }
    }
  }

  return {
    selectedEnvironmentName: recentInput?.environmentName ?? "",
    baseUrlDraft: recentInput?.baseUrl ?? "",
    storageStatePathDraft: recentInput?.storageStatePath ?? "",
    variableInputs,
  };
}

export function collectRunPreflightIssues(
  flow: FlowDocument | null,
  input: {
    baseUrl: string;
    storageStatePath: string;
    variables: VariableInputs;
  },
): StudioRunPreflightIssue[] {
  if (!flow) {
    return [];
  }

  const issues: StudioRunPreflightIssue[] = [];
  const baseUrl = input.baseUrl.trim();
  const fragilityContext = {
    baseUrl,
    variables: buildFragilityVariableContext(flow, input.variables),
  };

  const needsBaseUrl = analyzeFlowFragility(flow, fragilityContext).some(
    (issue) => issue.code === "MISSING_ENVIRONMENT",
  );
  if (needsBaseUrl && !baseUrl) {
    issues.push({
      code: "MISSING_BASE_URL",
      field: "baseUrl",
      message: "当前 Flow 含相对地址步骤，运行前必须填写 Base URL。",
    });
  }

  for (const variable of flow.variables) {
    if (!variable.required) {
      continue;
    }
    const rawValue = input.variables[variable.name] ?? "";
    if (rawValue.trim().length > 0) {
      continue;
    }
    issues.push({
      code: "MISSING_REQUIRED_VARIABLE",
      field: variable.name,
      message: `变量 ${variable.name} 为必填项，请先补充运行值。`,
    });
  }

  return issues;
}
