import type { FlowDocument, NormalizedStep } from "@flowweave/flow-dsl";

export type FragilityIssue = {
  stepId: string;
  stepIndex: number;
  code: "CSS_ONLY" | "NO_STRATEGIES";
  message: string;
  severity: "warning" | "error";
};

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
