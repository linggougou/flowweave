import type { NormalizedStep } from "@flowweave/flow-dsl";

function cssOf(step: NormalizedStep): string | undefined {
  if (step.type !== "click" && step.type !== "fill") {
    return undefined;
  }
  return step.target.strategies.find((s) => s.kind === "css")?.selector;
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
  if (step.type !== "fill" && step.type !== "click") {
    return undefined;
  }
  return step.target.strategies.map((s) => JSON.stringify(s)).join("|");
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
      next?.type === "fill" &&
      cssOf(current) &&
      cssOf(current) === cssOf(next)
    ) {
      continue;
    }

    if (current) {
      result.push(current);
    }
  }

  return result;
}
