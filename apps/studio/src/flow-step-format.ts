import type { NormalizedStep } from "@flowweave/flow-dsl";
import type { FlowStepRow } from "@flowweave/ui";

function formatTarget(step: NormalizedStep): string | undefined {
  if (step.type !== "click" && step.type !== "fill") {
    return undefined;
  }

  const parts: string[] = [];
  for (const strategy of step.target.strategies) {
    switch (strategy.kind) {
      case "testId":
        parts.push(`testId=${strategy.testId}`);
        break;
      case "role":
        parts.push(
          strategy.name
            ? `role=${strategy.role} name="${strategy.name}"`
            : `role=${strategy.role}`,
        );
        break;
      case "css":
        parts.push(strategy.selector);
        break;
      case "text":
        parts.push(`text="${strategy.text}"`);
        break;
      case "xpath":
        parts.push(`xpath=${strategy.expression}`);
        break;
      default:
        break;
    }
  }

  return parts.length > 0 ? parts.join(" → ") : undefined;
}

function formatSummary(step: NormalizedStep): string {
  switch (step.type) {
    case "navigate":
      return step.url;
    case "fill":
      return `填写「${step.value}」`;
    case "click": {
      if (step.type === "click") {
        const role = step.target.strategies.find((s) => s.kind === "role");
        if (role?.kind === "role" && role.name) {
          return `点击「${role.name}」`;
        }
        const text = step.target.strategies.find((s) => s.kind === "text");
        if (text?.kind === "text") {
          return `点击「${text.text}」`;
        }
      }
      return "点击";
    }
    case "wait":
      return step.ms !== undefined ? `等待 ${step.ms}ms` : `等待条件 ${step.condition}`;
  }
}

export function flowStepsToRows(steps: NormalizedStep[]): FlowStepRow[] {
  return steps.map((step, stepIndex) => ({
    stepIndex,
    stepId: step.id,
    type: step.type,
    summary: formatSummary(step),
    detail: formatTarget(step),
  }));
}
