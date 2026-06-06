import type { NormalizedStep } from "@flowweave/flow-dsl";

function targetOf(step: NormalizedStep) {
  switch (step.type) {
    case "click":
    case "fill":
    case "select":
    case "setChecked":
    case "upload":
      return step.target;
    default:
      return undefined;
  }
}

function cssOf(step: NormalizedStep): string | undefined {
  return targetOf(step)?.strategies.find((s) => s.kind === "css")?.selector;
}

function isLayoutNoiseClick(step: NormalizedStep): boolean {
  if (step.type !== "click") {
    return false;
  }
  const css = cssOf(step);
  if (!css) {
    return false;
  }
  const onlyBareLayout = /^body\s*>\s*div\s*>\s*div:nth-of-type\(\d+\)$/.test(css.trim());
  if (!onlyBareLayout) {
    return false;
  }
  const hasRole = step.target.strategies.some((s) => s.kind === "role");
  const hasText = step.target.strategies.some((s) => s.kind === "text");
  return !hasRole && !hasText;
}

function targetSignature(step: NormalizedStep): string | undefined {
  return targetOf(step)?.strategies.map((s) => JSON.stringify(s)).join("|");
}

function labelSignature(step: NormalizedStep): string | undefined {
  const hints = targetOf(step)?.hints;
  return hints?.labelText ?? hints?.textSample ?? undefined;
}

function roleNameSignature(step: NormalizedStep): string | undefined {
  const roleStrategy = targetOf(step)?.strategies.find((strategy) => strategy.kind === "role");
  if (!roleStrategy || roleStrategy.kind !== "role") {
    return undefined;
  }
  return `${roleStrategy.role}:${roleStrategy.name ?? ""}`;
}

function sameStringArray(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function isEquivalentConsecutiveStep(previous: NormalizedStep, current: NormalizedStep): boolean {
  if (previous.type !== current.type) {
    return false;
  }

  switch (current.type) {
    case "navigate":
      return previous.type === "navigate" && previous.url === current.url;
    case "select":
      return (
        previous.type === "select" &&
        targetSignature(previous) === targetSignature(current) &&
        sameStringArray(previous.values, current.values)
      );
    case "setChecked":
      return (
        previous.type === "setChecked" &&
        targetSignature(previous) === targetSignature(current) &&
        previous.checked === current.checked
      );
    case "upload":
      return (
        previous.type === "upload" &&
        targetSignature(previous) === targetSignature(current) &&
        sameStringArray(previous.files, current.files)
      );
    default:
      return false;
  }
}

function pushStep(result: NormalizedStep[], step: NormalizedStep): void {
  const previous = result.at(-1);
  if (previous && isEquivalentConsecutiveStep(previous, step)) {
    result[result.length - 1] = step;
    return;
  }
  result.push(step);
}

function isLabelForControlClick(clickStep: NormalizedStep, targetStep: NormalizedStep): boolean {
  const clickCss = cssOf(clickStep);
  const targetCss = cssOf(targetStep);
  if (!clickCss || !targetCss) {
    return false;
  }

  const match = clickCss.match(/^label\[for="([^"]+)"\]$/);
  return Boolean(match && targetCss === `#${match[1]}`);
}

function pointsToSameTarget(clickStep: NormalizedStep, nextStep: NormalizedStep): boolean {
  if (targetSignature(clickStep) && targetSignature(clickStep) === targetSignature(nextStep)) {
    return true;
  }

  if (isLabelForControlClick(clickStep, nextStep)) {
    return true;
  }

  const clickLabel = labelSignature(clickStep);
  const nextLabel = labelSignature(nextStep);
  if (clickLabel && nextLabel && clickLabel === nextLabel) {
    return true;
  }

  const clickRoleName = roleNameSignature(clickStep);
  const nextRoleName = roleNameSignature(nextStep);
  return Boolean(clickRoleName && nextRoleName && clickRoleName === nextRoleName);
}

/** 合并同一输入框的连续 fill，保留最后一次输入值 */
export function mergeConsecutiveFillSteps(steps: NormalizedStep[]): NormalizedStep[] {
  const result: NormalizedStep[] = [];
  for (const step of steps) {
    const prev = result.at(-1);
    if (
      step.type === "fill" &&
      prev?.type === "fill" &&
      targetSignature(step) === targetSignature(prev)
    ) {
      result[result.length - 1] = step;
      continue;
    }
    result.push(step);
  }
  return result;
}

/** 去掉紧邻 fill 前、指向同一输入框的多余 click，以及点到空白布局容器的噪声 click */
export function filterNoisyInteractionSteps(steps: NormalizedStep[]): NormalizedStep[] {
  const result: NormalizedStep[] = [];

  for (let i = 0; i < steps.length; i += 1) {
    const current = steps[i];
    const next = steps[i + 1];

    if (current && isLayoutNoiseClick(current)) {
      continue;
    }

    if (
      current?.type === "click" &&
      next &&
      (next.type === "fill" || next.type === "select" || next.type === "setChecked") &&
      pointsToSameTarget(current, next)
    ) {
      continue;
    }

    if (current) {
      pushStep(result, current);
    }
  }

  return result;
}
