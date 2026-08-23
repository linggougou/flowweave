import type { FlowDocument, NormalizedStep } from "@flowweave/flow-dsl";

export type HighRiskActionKind = "submit" | "delete" | "send" | "save";

export type HighRiskAction = {
  kind: HighRiskActionKind;
  label: string;
  /** 使用 Flow 的零基步骤索引，便于与 runtime 事件直接对应。 */
  stepIndexes: number[];
};

export type RunConfirmationSummary = {
  flowId: string;
  taskName: string;
  domains: string[];
  environmentName: string;
  stepCount: number;
  highRiskActions: HighRiskAction[];
  requiresConfirmation: boolean;
};

const riskDescriptors: ReadonlyArray<{
  kind: HighRiskActionKind;
  label: string;
  pattern: RegExp;
}> = [
  { kind: "submit", label: "提交", pattern: /(?:提交|确认|submit|confirm)/i },
  { kind: "delete", label: "删除", pattern: /(?:删除|移除|作废|delete|remove|destroy)/i },
  { kind: "send", label: "发送", pattern: /(?:发送|发布|send|publish)/i },
  { kind: "save", label: "保存", pattern: /(?:保存|save)/i },
];

function getStepRiskText(step: NormalizedStep): string {
  const values: string[] = [];
  if (step.label) {
    values.push(step.label);
  }
  if ("target" in step && step.target) {
    const hints = step.target.hints;
    values.push(
      hints?.labelText ?? "",
      hints?.textSample ?? "",
      hints?.placeholder ?? "",
      ...step.target.strategies.flatMap((strategy) => {
        if (strategy.kind === "role") {
          return strategy.name ? [strategy.name] : [];
        }
        if (strategy.kind === "text") {
          return [strategy.text];
        }
        if (strategy.kind === "testId") {
          return [strategy.testId];
        }
        return [];
      }),
    );
  }
  return values.filter(Boolean).join(" ");
}

export function classifyHighRiskActions(steps: FlowDocument["steps"]): HighRiskAction[] {
  const grouped = new Map<HighRiskActionKind, HighRiskAction>();
  steps.forEach((step, stepIndex) => {
    const text = getStepRiskText(step);
    if (!text) {
      return;
    }
    for (const descriptor of riskDescriptors) {
      if (!descriptor.pattern.test(text)) {
        continue;
      }
      const current = grouped.get(descriptor.kind);
      if (current) {
        current.stepIndexes.push(stepIndex);
      } else {
        grouped.set(descriptor.kind, {
          kind: descriptor.kind,
          label: descriptor.label,
          stepIndexes: [stepIndex],
        });
      }
      break;
    }
  });
  return [...grouped.values()];
}

function collectDomains(flow: FlowDocument, baseUrl?: string): string[] {
  const domains = new Set<string>();
  const urls = [
    baseUrl,
    ...flow.steps.flatMap((step) => (step.type === "navigate" ? [step.url] : [])),
  ];
  for (const value of urls) {
    if (!value) {
      continue;
    }
    try {
      const parsed = baseUrl ? new URL(value, baseUrl) : new URL(value);
      if (parsed.hostname) {
        domains.add(parsed.hostname);
      }
    } catch {
      // 相对 URL 且没有 baseUrl 时无法确认目标域名，保持摘要为空而不猜测。
    }
  }
  return [...domains];
}

export function buildRunConfirmationSummary(
  flow: FlowDocument,
  options: { environmentName?: string; baseUrl?: string } = {},
): RunConfirmationSummary {
  const highRiskActions = classifyHighRiskActions(flow.steps);
  return {
    flowId: flow.id,
    taskName: flow.name,
    domains: collectDomains(flow, options.baseUrl),
    environmentName: options.environmentName?.trim() || "默认环境",
    stepCount: flow.steps.length,
    highRiskActions,
    requiresConfirmation: highRiskActions.length > 0,
  };
}
