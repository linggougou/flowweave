import type { FlowDocument, NormalizedStep } from "@flowweave/flow-dsl";
import { extractTemplateVariables, interpolateTemplateString } from "@flowweave/shared";
const leadingVariablePattern = /^\s*\{\{\s*[^{}]+\s*\}\}/;

type StepTarget = Extract<NormalizedStep, { type: "click" }>["target"];

export type FragilityAnalysisContext = {
  baseUrl?: string;
  variables?: Record<string, unknown>;
};

export type FragilityIssue = {
  stepId: string;
  stepIndex: number;
  code:
    | "CSS_ONLY"
    | "NO_STRATEGIES"
    | "CSS_NTH_OF_TYPE"
    | "TEXT_ONLY"
    | "WAIT_MAY_BE_UNSTABLE"
    | "MISSING_ENVIRONMENT"
    | "MISSING_VARIABLE";
  message: string;
  severity: "warning" | "error";
};

function isAbsoluteUrl(value: string): boolean {
  return /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(value);
}

function interpolateVariables(
  value: string,
  variables?: FragilityAnalysisContext["variables"],
): string {
  return interpolateTemplateString(value, variables);
}

function extractVariableNames(value: unknown): string[] {
  return extractTemplateVariables(value);
}

function collectAvailableVariables(
  flow: FlowDocument,
  context: FragilityAnalysisContext,
): Set<string> {
  const available = new Set<string>();

  flow.variables.forEach((variableDef) => {
    if (variableDef.defaultValue !== undefined) {
      available.add(variableDef.name);
    }
  });

  Object.entries(context.variables ?? {}).forEach(([name, value]) => {
    if (value !== undefined) {
      available.add(name);
    }
  });

  return available;
}

function hasExplicitBaseUrlContext(context: FragilityAnalysisContext): boolean {
  return Object.prototype.hasOwnProperty.call(context, "baseUrl");
}

function requiresBaseUrl(value: string): boolean {
  return !isAbsoluteUrl(value) && !leadingVariablePattern.test(value);
}

function extractTargetVariableNames(target: StepTarget | undefined): string[] {
  if (!target) {
    return [];
  }

  return target.strategies.flatMap((strategy) => {
    switch (strategy.kind) {
      case "role":
        return [...extractVariableNames(strategy.role), ...extractVariableNames(strategy.name)];
      case "testId":
        return extractVariableNames(strategy.testId);
      case "css":
        return extractVariableNames(strategy.selector);
      case "xpath":
        return extractVariableNames(strategy.expression);
      case "text":
        return extractVariableNames(strategy.text);
      default:
        return [];
    }
  });
}

function extractExecutableVariableNames(step: NormalizedStep): string[] {
  switch (step.type) {
    case "navigate":
      return extractVariableNames(step.url);
    case "click":
      return extractTargetVariableNames(step.target);
    case "fill":
      return [...extractTargetVariableNames(step.target), ...extractVariableNames(step.value)];
    case "select":
      return [...extractTargetVariableNames(step.target), ...step.values.flatMap(extractVariableNames)];
    case "setChecked":
      return extractTargetVariableNames(step.target);
    case "press":
      return [...extractTargetVariableNames(step.target), ...extractVariableNames(step.key)];
    case "upload":
      return [...extractTargetVariableNames(step.target), ...step.files.flatMap(extractVariableNames)];
    case "wait":
      return [
        ...extractTargetVariableNames(step.target),
        ...extractVariableNames(step.urlIncludes),
      ];
    default:
      return [];
  }
}

function hasNthOfTypeSelector(step: Extract<NormalizedStep, { type: "click" | "fill" }>): boolean {
  return step.target.strategies.some(
    (strategy) =>
      strategy.kind === "css" && /:nth-of-type\(\s*\d+\s*\)/.test(strategy.selector),
  );
}

function hasOnlyTextStrategies(step: Extract<NormalizedStep, { type: "click" | "fill" }>): boolean {
  return step.target.strategies.every((strategy) => strategy.kind === "text");
}

function inspectStep(step: NormalizedStep, stepIndex: number): FragilityIssue[] {
  const issues: FragilityIssue[] = [];

  if (step.type === "click" || step.type === "fill") {
    const strategies = step.target.strategies;
    if (strategies.length === 0) {
      issues.push({
        stepId: step.id,
        stepIndex,
        code: "NO_STRATEGIES",
        message: "交互步骤缺少定位策略",
        severity: "error",
      });
      return issues;
    }
    const onlyCss = strategies.every((s) => s.kind === "css");
    if (onlyCss) {
      issues.push({
        stepId: step.id,
        stepIndex,
        code: "CSS_ONLY",
        message: "仅使用 CSS 选择器，页面变更后易失效，建议补充 role/testId",
        severity: "warning",
      });
    }
    if (hasNthOfTypeSelector(step)) {
      issues.push({
        stepId: step.id,
        stepIndex,
        code: "CSS_NTH_OF_TYPE",
        message: "CSS 选择器依赖 nth-of-type，DOM 结构微调后容易漂移，建议补充语义化定位",
        severity: "warning",
      });
    }
    if (hasOnlyTextStrategies(step)) {
      issues.push({
        stepId: step.id,
        stepIndex,
        code: "TEXT_ONLY",
        message: "仅依赖文本定位，文案或多语言变更后容易失效，建议补充 role/testId/name",
        severity: "warning",
      });
    }
  }

  if (step.type === "wait" && step.condition != null) {
    issues.push({
      stepId: step.id,
      stepIndex,
      code: "WAIT_MAY_BE_UNSTABLE",
      message: "wait 仅依赖通用 condition，真实页面异步波动时可能不稳定，建议改用更明确的业务信号",
      severity: "warning",
    });
  }

  return issues;
}

function inspectContextualStep(
  step: NormalizedStep,
  stepIndex: number,
  context: FragilityAnalysisContext,
  availableVariables: Set<string>,
): FragilityIssue[] {
  const issues: FragilityIssue[] = [];

  const normalizedBaseUrl = context.baseUrl?.trim();
  if (step.type === "navigate" && hasExplicitBaseUrlContext(context) && !normalizedBaseUrl) {
    const resolvedUrl = interpolateVariables(step.url, context.variables);
    if (requiresBaseUrl(resolvedUrl)) {
      issues.push({
        stepId: step.id,
        stepIndex,
        code: "MISSING_ENVIRONMENT",
        message: "流程包含相对地址，但当前没有可用 baseUrl，真实页面回放会直接失败",
        severity: "error",
      });
    }
  }

  if (context.variables !== undefined) {
    const missingVariables = Array.from(new Set(extractExecutableVariableNames(step))).filter(
      (variableName) => variableName && !availableVariables.has(variableName),
    );

    if (missingVariables.length > 0) {
      issues.push({
        stepId: step.id,
        stepIndex,
        code: "MISSING_VARIABLE",
        message: `步骤引用了缺失变量：${missingVariables.join("、")}`,
        severity: "error",
      });
    }
  }

  return issues;
}

/** 对 Flow 做脆弱性体检 */
export function analyzeFlowFragility(
  flow: FlowDocument,
  context: FragilityAnalysisContext = {},
): FragilityIssue[] {
  const issues: FragilityIssue[] = [];
  const availableVariables = collectAvailableVariables(flow, context);
  flow.steps.forEach((step, stepIndex) => {
    issues.push(...inspectStep(step, stepIndex));
    issues.push(...inspectContextualStep(step, stepIndex, context, availableVariables));
  });
  return issues;
}
