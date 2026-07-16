import type { NormalizedStep, Target } from "@flowweave/flow-dsl";
import type { FlowStepRow } from "@flowweave/ui";

function formatTargetStrategies(target: Target): string | undefined {
  const parts: string[] = [];
  for (const strategy of target.strategies) {
    switch (strategy.kind) {
      case "testId":
        parts.push(`testId=${strategy.testId}`);
        break;
      case "role":
        parts.push(
          strategy.name ? `role=${strategy.role} name="${strategy.name}"` : `role=${strategy.role}`,
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

function formatTarget(step: NormalizedStep): string | undefined {
  switch (step.type) {
    case "click":
    case "fill":
    case "select":
    case "setChecked":
    case "upload":
      return formatTargetStrategies(step.target);
    case "press":
      return step.target ? formatTargetStrategies(step.target) : undefined;
    case "scroll":
      return step.target ? formatTargetStrategies(step.target) : undefined;
    case "wait":
      return step.target ? formatTargetStrategies(step.target) : undefined;
    case "navigate":
      return undefined;
  }
}

const SENSITIVE_TARGET_PATTERN = /(?:password|passwd|passcode|(?:^|[_-])pwd(?:$|[_-])|密码|口令)/i;

function isSensitiveFillTarget(target: Target): boolean {
  const hints = target.hints;
  const hintValues = [hints?.inputType, hints?.nameAttr, hints?.placeholder, hints?.labelText];
  if (hintValues.some((value) => value && SENSITIVE_TARGET_PATTERN.test(value))) {
    return true;
  }

  return target.strategies.some((strategy) => {
    switch (strategy.kind) {
      case "css":
        return SENSITIVE_TARGET_PATTERN.test(strategy.selector);
      case "xpath":
        return SENSITIVE_TARGET_PATTERN.test(strategy.expression);
      case "testId":
        return SENSITIVE_TARGET_PATTERN.test(strategy.testId);
      case "role":
        return Boolean(strategy.name && SENSITIVE_TARGET_PATTERN.test(strategy.name));
      case "text":
        return SENSITIVE_TARGET_PATTERN.test(strategy.text);
    }
  });
}

function formatSummary(step: NormalizedStep): string {
  switch (step.type) {
    case "navigate":
      return step.url;
    case "fill":
      if (isSensitiveFillTarget(step.target)) {
        return "填写敏感信息（已隐藏）";
      }
      return `填写「${step.value}」`;
    case "click": {
      const role = step.target.strategies.find((s) => s.kind === "role");
      if (role?.kind === "role" && role.name) {
        return `点击「${role.name}」`;
      }
      const text = step.target.strategies.find((s) => s.kind === "text");
      if (text?.kind === "text") {
        return `点击「${text.text}」`;
      }
      return "点击";
    }
    case "select":
      return `选择「${step.values.join("、")}」`;
    case "setChecked":
      return step.checked ? "勾选" : "取消勾选";
    case "press":
      return `按键「${step.key}」`;
    case "scroll":
      return step.target ? `滚动容器到 (${step.x}, ${step.y})` : `滚动到 (${step.x}, ${step.y})`;
    case "upload":
      return `上传 ${step.files.length} 个文件`;
    case "wait":
      if (step.ms !== undefined) {
        return `等待 ${step.ms}ms`;
      }
      if (step.condition) {
        return `等待条件 ${step.condition}`;
      }
      return "等待";
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
