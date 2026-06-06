import type { FragilityIssue } from "@flowweave/page-intelligence";

import type {
  ExecutionStepLog,
  StudioDiagnosticStrategyAttempt,
  StudioDiagnosticTargetHints,
} from "./studio-api-types.js";

export type RepairSuggestion = {
  id: string;
  source: "fragility" | "strategy" | "target-hint" | "fallback";
  severity: "error" | "warning";
  title: string;
  action: string;
  reason: string;
  code?: FragilityIssue["code"];
  stepNumbers?: number[];
};

type RankedRepairSuggestion = RepairSuggestion & {
  priority: number;
};

type FragilitySummary = {
  code: FragilityIssue["code"];
  severity: FragilityIssue["severity"];
  message: string;
  stepNumbers: number[];
};

function formatScopeKind(
  scopeKind?: StudioDiagnosticTargetHints["scopeKind"],
): string | undefined {
  switch (scopeKind) {
    case "row":
      return "列表行";
    case "listitem":
      return "列表项";
    case "dialog":
      return "弹层";
    case "tabpanel":
      return "页签面板";
    case "section":
      return "区域";
    case "card":
      return "卡片";
    default:
      return undefined;
  }
}

function severityRank(severity: RepairSuggestion["severity"]): number {
  return severity === "error" ? 0 : 1;
}

function compareSuggestions(
  left: RankedRepairSuggestion,
  right: RankedRepairSuggestion,
): number {
  return (
    severityRank(left.severity) - severityRank(right.severity) ||
    left.priority - right.priority ||
    left.title.localeCompare(right.title, "zh-Hans-CN")
  );
}

function sortStepNumbers(stepNumbers: number[]): number[] {
  return [...stepNumbers].sort((left, right) => left - right);
}

function dedupeSuggestions(items: RankedRepairSuggestion[]): RepairSuggestion[] {
  const byId = new Map<string, RankedRepairSuggestion>();

  for (const item of items) {
    const existing = byId.get(item.id);
    if (!existing || compareSuggestions(item, existing) < 0) {
      byId.set(item.id, item);
    }
  }

  return Array.from(byId.values())
    .sort(compareSuggestions)
    .map(({ priority: _priority, ...item }) => item);
}

function summarizeWarnings(warnings: FragilityIssue[]): FragilitySummary[] {
  const groups = new Map<string, FragilitySummary>();

  for (const item of warnings) {
    const key = `${item.severity}:${item.code}:${item.message}`;
    const summary = groups.get(key) ?? {
      code: item.code,
      severity: item.severity,
      message: item.message,
      stepNumbers: [],
    };
    summary.stepNumbers.push(item.stepIndex + 1);
    groups.set(key, summary);
  }

  return Array.from(groups.values()).map((summary) => ({
    ...summary,
    stepNumbers: sortStepNumbers(summary.stepNumbers),
  }));
}

function describeTargetHints(targetHints?: StudioDiagnosticTargetHints): string | undefined {
  if (!targetHints) {
    return undefined;
  }

  const scopeKindLabel = formatScopeKind(targetHints.scopeKind);
  const scopeText = targetHints.scopeText?.trim();
  const parts = [
    targetHints.labelText ? `关联文案“${targetHints.labelText}”` : undefined,
    targetHints.placeholder ? `占位提示“${targetHints.placeholder}”` : undefined,
    targetHints.nameAttr ? `name=${targetHints.nameAttr}` : undefined,
    targetHints.textSample ? `文本样本“${targetHints.textSample}”` : undefined,
    scopeText
      ? scopeKindLabel
        ? `作用域线索 ${scopeKindLabel}“${scopeText}”`
        : `作用域线索“${scopeText}”`
      : scopeKindLabel
        ? `作用域类型 ${scopeKindLabel}`
        : undefined,
  ].filter((item): item is string => Boolean(item));

  if (parts.length === 0) {
    return undefined;
  }

  return parts.join("，");
}

function includesKeyword(value: string | undefined, keywords: string[]): boolean {
  const normalized = value?.toLowerCase() ?? "";
  return keywords.some((keyword) => normalized.includes(keyword));
}

function hasAmbiguityTieSignal(attempt: StudioDiagnosticStrategyAttempt): boolean {
  return includesKeyword(attempt.error, [
    "tie",
    "tied",
    "same score",
    "equal score",
    "并列",
    "同分",
    "平分",
    "候选评分",
    "无法唯一确认",
  ]);
}

function isLikelyCustomEditableTarget(targetHints?: StudioDiagnosticTargetHints): boolean {
  const tagName = targetHints?.tagName?.toLowerCase();
  if (!tagName) {
    return false;
  }

  if (["input", "textarea", "select", "button", "label"].includes(tagName)) {
    return false;
  }

  return Boolean(targetHints?.labelText || targetHints?.textSample);
}

function buildFragilitySuggestion(summary: FragilitySummary): RankedRepairSuggestion | null {
  const base = {
    id: `fragility:${summary.code}:${summary.message}`,
    source: "fragility" as const,
    severity: summary.severity,
    code: summary.code,
    stepNumbers: summary.stepNumbers,
  };

  switch (summary.code) {
    case "MISSING_ENVIRONMENT":
      return {
        ...base,
        priority: 0,
        title: "先补运行环境",
        action: "为当前执行选择带 Base URL 的环境，或在运行面板手动填写 Base URL 后再重跑。",
        reason: summary.message,
      };
    case "MISSING_VARIABLE":
      return {
        ...base,
        priority: 1,
        title: "补齐缺失变量",
        action: "回到运行面板补齐变量输入，并确认变量名与 Flow 占位符完全一致。",
        reason: summary.message,
      };
    case "NO_STRATEGIES":
      return {
        ...base,
        priority: 2,
        title: "重新录制或补齐定位策略",
        action: "至少补上一条可执行的 role、testId、css 或 text 策略，再重新回放当前步骤。",
        reason: summary.message,
      };
    case "CSS_ONLY":
      return {
        ...base,
        priority: 3,
        title: "为目标补充语义化定位",
        action: "优先补 role/testId，其次补 label 或 name，避免只依赖 CSS 选择器。",
        reason: summary.message,
      };
    case "CSS_NTH_OF_TYPE":
      return {
        ...base,
        priority: 4,
        title: "移除 nth-of-type 依赖",
        action: "把 nth-of-type 选择器替换为更稳定的 role、testId 或具名属性定位。",
        reason: summary.message,
      };
    case "TEXT_ONLY":
      return {
        ...base,
        priority: 5,
        title: "别只依赖文本定位",
        action: "补充 role/testId/name 之类的稳定信号，避免文案改动后整步失效。",
        reason: summary.message,
      };
    case "WAIT_MAY_BE_UNSTABLE":
      return {
        ...base,
        priority: 6,
        title: "把通用等待改成业务信号",
        action: "优先等待明确的按钮、请求完成态或页面状态，而不是泛化 wait 条件。",
        reason: summary.message,
      };
    default:
      return null;
  }
}

function buildAttemptReason(
  attempt: StudioDiagnosticStrategyAttempt,
  extra?: string,
): string {
  const parts = [`策略 ${attempt.label}`];

  if (attempt.matchedCount > 0) {
    parts.push(`匹配 ${attempt.matchedCount} 个`);
  } else {
    parts.push("没有命中任何元素");
  }

  if (attempt.visibleCount !== undefined) {
    parts.push(`可见 ${attempt.visibleCount} 个`);
  }

  if (extra) {
    parts.push(extra);
  }

  return parts.join("，") + "。";
}

function buildScopedRetargetSuggestion(
  step: ExecutionStepLog,
  attempt: StudioDiagnosticStrategyAttempt,
  targetHints?: StudioDiagnosticTargetHints,
): RankedRepairSuggestion | null {
  const scopeText = targetHints?.scopeText?.trim();
  if (!scopeText) {
    return null;
  }

  const scopeKindLabel = formatScopeKind(targetHints?.scopeKind) ?? "区域";
  return {
    id: `strategy:scope-retarget:${step.stepId}`,
    source: "strategy",
    severity: "error",
    priority: 0,
    title: `重新录制到正确${scopeKindLabel}`,
    action: `回到包含“${scopeText}”的${scopeKindLabel}重新录制这一步，再直接点击该${scopeKindLabel}里的目标，尽量保留标题、编号或主键文案这类上下文。`,
    reason: hasAmbiguityTieSignal(attempt)
      ? `${buildAttemptReason(attempt, "runtime 判断候选并列")}当前记录的作用域线索是 ${scopeKindLabel}“${scopeText}”，但还不足以唯一确认目标。`
      : `${buildAttemptReason(attempt, "当前目标仍可能落到错误位置")}当前记录的作用域线索是 ${scopeKindLabel}“${scopeText}”。`,
  };
}

function buildMissingScopeSuggestion(
  step: ExecutionStepLog,
  attempt: StudioDiagnosticStrategyAttempt,
  targetHints?: StudioDiagnosticTargetHints,
): RankedRepairSuggestion {
  const scopeKindLabel = formatScopeKind(targetHints?.scopeKind);
  const reasonSuffix = scopeKindLabel
    ? `当前只记录到作用域类型 ${scopeKindLabel}，但还缺少可区分的标题或编号。`
    : "当前没有记录到列表行、弹层标题或卡片摘要这类作用域线索。";

  return {
    id: `strategy:scope-missing:${step.stepId}`,
    source: "strategy",
    severity: "warning",
    priority: 2,
    title: "补上作用域线索后再重录",
    action:
      "如果这是列表行、卡片或弹层内的操作，重新录制时先进入对应上下文，再点击目标本身，让 Flow 带回更可区分的标题、编号或主键文案。",
    reason: `${buildAttemptReason(attempt, "页面上存在多个同名候选")}${reasonSuffix}`,
  };
}

export function buildFragilityRepairSuggestions(
  warnings: FragilityIssue[],
): RepairSuggestion[] {
  return dedupeSuggestions(
    summarizeWarnings(warnings)
      .map(buildFragilitySuggestion)
      .filter((item): item is RankedRepairSuggestion => item !== null),
  );
}

export function buildDiagnosticRepairSuggestions(
  step: ExecutionStepLog,
): RepairSuggestion[] {
  const ranked: RankedRepairSuggestion[] = [];
  const diagnostic = step.diagnostic;
  const failedAttempts = diagnostic?.strategyAttempts.filter((attempt) => !attempt.success) ?? [];
  const targetHints = diagnostic?.targetHints;
  const targetHintSummary = describeTargetHints(targetHints);

  const broadAttempt = failedAttempts.find(
    (attempt) =>
      attempt.matchedCount > 1 ||
      (attempt.visibleCount !== undefined && attempt.visibleCount > 1) ||
      includesKeyword(attempt.error, ["strict mode violation", "resolved to"]),
  );
  const tieAttempt = failedAttempts.find(hasAmbiguityTieSignal);
  const scopedRetargetSuggestion =
    broadAttempt ? buildScopedRetargetSuggestion(step, tieAttempt ?? broadAttempt, targetHints) : null;
  if (scopedRetargetSuggestion) {
    ranked.push(scopedRetargetSuggestion);
  }
  if (broadAttempt) {
    ranked.push({
      id: `strategy:broad:${step.stepId}`,
      source: "strategy",
      severity: "error",
      priority: scopedRetargetSuggestion ? 1 : 0,
      title: "先收窄目标范围",
      action:
        "给目标补充更稳定的 name、label 或 testId，避免一条策略同时命中多个候选；如果这是列表行、卡片或弹层内的操作，优先重新录制到带标题或编号的上下文。",
      reason: buildAttemptReason(broadAttempt, "页面上的目标还不够唯一"),
    });
  }
  if (broadAttempt && !targetHints?.scopeText?.trim()) {
    ranked.push(buildMissingScopeSuggestion(step, tieAttempt ?? broadAttempt, targetHints));
  }

  const hiddenAttempt = failedAttempts.find(
    (attempt) => attempt.matchedCount > 0 && (attempt.visibleCount ?? 0) === 0,
  );
  if (hiddenAttempt) {
    ranked.push({
      id: `strategy:hidden:${step.stepId}`,
      source: "strategy",
      severity: "error",
      priority: 1,
      title: "先让目标进入可见状态",
      action: "先补展开面板、切换页签或等待加载完成的步骤，再执行当前交互。",
      reason: buildAttemptReason(hiddenAttempt),
    });
  }

  const missingAttempt = failedAttempts.find((attempt) => attempt.matchedCount === 0);
  if (missingAttempt) {
    ranked.push({
      id: `strategy:missing:${step.stepId}`,
      source: "strategy",
      severity: "error",
      priority: 2,
      title: "先核对目标文案与语义定位",
      action:
        "先检查文案、aria-label、placeholder、name 或 testId 是否变化；如果页面结构已改，优先重新录制该步骤。",
      reason: targetHintSummary
        ? `${buildAttemptReason(missingAttempt)}当前留下的线索包括：${targetHintSummary}。`
        : buildAttemptReason(missingAttempt),
    });
  }

  const timeoutAttempt = failedAttempts.find(
    (attempt) =>
      includesKeyword(attempt.error, ["timeout", "waiting for locator"]) &&
      attempt.matchedCount > 0 &&
      (attempt.visibleCount ?? attempt.matchedCount) > 0,
  );
  if (timeoutAttempt) {
    ranked.push({
      id: `strategy:timeout:${step.stepId}`,
      source: "strategy",
      severity: "warning",
      priority: 3,
      title: "补一条更稳的等待或状态切换",
      action: "在当前操作前增加更明确的加载完成、元素可编辑或页面状态确认步骤。",
      reason: buildAttemptReason(timeoutAttempt, "当前更像状态时序问题而不是完全找不到目标"),
    });
  }

  if (targetHints?.inputType === "file") {
    ranked.push({
      id: `hint:upload:${step.stepId}`,
      source: "target-hint",
      severity: "warning",
      priority: 4,
      title: "确认上传步骤仍指向真实文件控件",
      action: "优先重新录制到真实的 input[type=file]，不要只点击外层按钮、图标或自定义上传壳。",
      reason: targetHintSummary
        ? `Target 提示显示当前像上传控件，${targetHintSummary}。`
        : "Target 提示显示当前像上传控件。",
    });
  }

  if (targetHints?.tagName?.toLowerCase() === "select") {
    ranked.push({
      id: `hint:select:${step.stepId}`,
      source: "target-hint",
      severity: "warning",
      priority: 5,
      title: "核对下拉选项值与文案",
      action: "确认录制值仍对应当前 option value，必要时同时核对显示文案与默认选中项。",
      reason: targetHintSummary
        ? `Target 提示显示这是下拉框，${targetHintSummary}。`
        : "Target 提示显示这是下拉框。",
    });
  }

  if (isLikelyCustomEditableTarget(targetHints)) {
    ranked.push({
      id: `hint:editable:${step.stepId}`,
      source: "target-hint",
      severity: "warning",
      priority: 6,
      title: "确认是否命中富文本或自定义输入区域",
      action: "如果页面已切成富文本或自定义编辑器，优先重新录制到真正的可编辑容器，再补充 label 或 testId。",
      reason: targetHintSummary
        ? `Target 提示更像自定义输入区，${targetHintSummary}。`
        : "Target 提示更像自定义输入区。",
    });
  }

  if (ranked.length === 0 && step.message) {
    ranked.push({
      id: `fallback:${step.stepId}`,
      source: "fallback",
      severity: step.status === "failed" ? "error" : "warning",
      priority: 99,
      title: "先对照诊断产物缩小范围",
      action: "先打开 diagnostic JSON 与 page snapshot，对照页面 URL、标题和目标提示，确认异常发生在哪个阶段。",
      reason: step.message,
    });
  }

  return dedupeSuggestions(ranked);
}
