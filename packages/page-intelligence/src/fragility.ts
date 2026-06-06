import type { FlowDocument, NormalizedStep } from "@flowweave/flow-dsl";

export type FragilityIssue = {
  stepId: string;
  stepIndex: number;
  code:
    | "CSS_ONLY"
    | "NO_STRATEGIES"
    | "CSS_NTH_OF_TYPE"
    | "TEXT_ONLY"
    | "WAIT_MAY_BE_UNSTABLE";
  message: string;
  severity: "warning" | "error";
};

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

/** 对 Flow 做脆弱性体检 */
export function analyzeFlowFragility(flow: FlowDocument): FragilityIssue[] {
  const issues: FragilityIssue[] = [];
  flow.steps.forEach((step, stepIndex) => {
    issues.push(...inspectStep(step, stepIndex));
  });
  return issues;
}
