import { buildDiagnosticRepairSuggestions } from "./repair-suggestions.js";
import {
  getStudioActionStateResetDescriptor,
  getStudioRuntimeCauseDescriptor,
  formatStudioRuntimeRecoverySummary,
  isRuntimeErrorDiagnostic,
  isTargetResolutionDiagnostic,
  type ExecutionStepLog,
  type StudioDiagnosticCandidateSummary,
  type StudioDiagnosticStrategyAttempt,
} from "./studio-api-types.js";

export type FailureInsightCategory =
  | "ambiguous-target"
  | "disambiguated-target"
  | "hidden-target"
  | "missing-target"
  | "page-state"
  | "fallback-success"
  | "page-snapshot"
  | "execution-error"
  | "action-state-reset"
  | "runtime-cause";

export type FailureInsightArtifact = {
  kind: "diagnostic" | "page-snapshot" | "screenshot";
  label: string;
  path: string;
};

export type FailureInsight = {
  category: FailureInsightCategory;
  categoryLabel: string;
  title: string;
  summary: string;
  pageSummary?: string;
  recommendedAction?: string;
  artifacts: FailureInsightArtifact[];
};

function includesKeyword(value: string | undefined, keywords: string[]): boolean {
  const normalized = value?.toLowerCase() ?? "";
  return keywords.some((keyword) => normalized.includes(keyword));
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function resolveRelevantCandidates(
  attempt: StudioDiagnosticStrategyAttempt,
): StudioDiagnosticCandidateSummary[] {
  const candidates = attempt.candidateSummaries ?? [];
  if (candidates.length === 0) {
    return [];
  }

  const topScore = Math.max(...candidates.map((candidate) => candidate.score));
  return candidates.filter((candidate) => candidate.score === topScore);
}

function resolveCandidateHintLabels(attempt: StudioDiagnosticStrategyAttempt): string[] {
  const candidates = resolveRelevantCandidates(attempt);
  if (candidates.length === 0) {
    return [];
  }

  const sharedHints = uniqueStrings(candidates[0]?.matchedHints ?? []).filter((hint) =>
    candidates.every((candidate) => candidate.matchedHints.includes(hint)),
  );
  if (sharedHints.length > 0) {
    return sharedHints;
  }

  return uniqueStrings(candidates.flatMap((candidate) => candidate.matchedHints));
}

function hasDisambiguationMetadata(attempt: StudioDiagnosticStrategyAttempt): boolean {
  return (
    attempt.selectedIndex !== undefined ||
    Boolean(attempt.ambiguityReason?.trim()) ||
    (attempt.candidateSummaries?.length ?? 0) > 0
  );
}

function resolveSelectedCandidate(
  attempt: StudioDiagnosticStrategyAttempt,
): StudioDiagnosticCandidateSummary | undefined {
  if (attempt.selectedIndex === undefined) {
    return undefined;
  }

  return attempt.candidateSummaries?.find((candidate) => candidate.index === attempt.selectedIndex);
}

function resolveCandidateCount(attempt: StudioDiagnosticStrategyAttempt): number {
  return (
    attempt.candidateSummaries?.filter((candidate) => candidate.visible).length ||
    attempt.candidateSummaries?.length ||
    attempt.visibleCount ||
    attempt.matchedCount
  );
}

function resolveSuccessfulHintLabels(attempt: StudioDiagnosticStrategyAttempt): string[] {
  const selectedCandidate = resolveSelectedCandidate(attempt);
  if (selectedCandidate) {
    return uniqueStrings(selectedCandidate.matchedHints);
  }

  return resolveCandidateHintLabels(attempt);
}

function describeAmbiguousAttempt(attempt: StudioDiagnosticStrategyAttempt): string | undefined {
  const ambiguityReason = attempt.ambiguityReason?.trim();
  const helpfulHints = resolveCandidateHintLabels(attempt);
  const candidateCount = resolveCandidateCount(attempt);
  const sentences = [
    `${attempt.label} 同时命中 ${attempt.matchedCount} 个候选，当前定位范围过宽。`,
    ambiguityReason ? `runtime 反馈：${ambiguityReason}。` : undefined,
    helpfulHints.length > 0 ? `已命中的收窄线索：${helpfulHints.join("、")}。` : undefined,
    candidateCount > 1
      ? `仍不足：这些线索最多只能把范围缩到 ${candidateCount} 个高分候选。`
      : "仍不足：当前产物还没有给出足够稳定的唯一线索。",
  ];

  return sentences.filter((sentence): sentence is string => Boolean(sentence)).join("");
}

function describeSuccessfulDisambiguation(attempt: StudioDiagnosticStrategyAttempt): string {
  const helpfulHints = resolveSuccessfulHintLabels(attempt);
  const candidateCount = resolveCandidateCount(attempt);
  const selectedLabel =
    attempt.selectedIndex !== undefined ? `候选 #${attempt.selectedIndex + 1}` : "当前候选";
  const sentences = [
    `${attempt.label} 在 ${attempt.matchedCount} 个候选里选中了${selectedLabel}。`,
    attempt.ambiguityReason?.trim() ? `runtime 反馈：${attempt.ambiguityReason}。` : undefined,
    helpfulHints.length > 0 ? `这次命中的收窄线索：${helpfulHints.join("、")}。` : undefined,
    candidateCount > 1
      ? `仍不足：当前页面上仍有 ${candidateCount} 个相似候选，缺少更稳定的唯一标识。`
      : "仍不足：当前产物还没有记录到足够稳定的唯一线索。",
  ];

  return sentences.filter((sentence): sentence is string => Boolean(sentence)).join("");
}

function resolveSuccessfulDisambiguation(
  step: ExecutionStepLog,
): StudioDiagnosticStrategyAttempt | null {
  const diagnostic = isTargetResolutionDiagnostic(step.diagnostic) ? step.diagnostic : undefined;
  if (!diagnostic || step.status !== "passed") {
    return null;
  }

  if (diagnostic.strategyAttempts.some((attempt) => !attempt.success)) {
    return null;
  }

  return (
    diagnostic.strategyAttempts.find(
      (attempt) => attempt.success && hasDisambiguationMetadata(attempt),
    ) ?? null
  );
}

function resolveFallbackSuccess(
  step: ExecutionStepLog,
): { failedAttempts: StudioDiagnosticStrategyAttempt[]; successLabel: string } | null {
  const diagnostic = step.diagnostic;
  if (!isTargetResolutionDiagnostic(diagnostic)) {
    return null;
  }

  const attempts = diagnostic.strategyAttempts;
  const failedAttempts = attempts.filter((attempt) => !attempt.success);
  const successAttempt = attempts.find((attempt) => attempt.success);

  if (step.status !== "passed" || failedAttempts.length === 0 || !successAttempt) {
    return null;
  }

  return {
    failedAttempts,
    successLabel: successAttempt.label,
  };
}

function buildArtifacts(step: ExecutionStepLog): FailureInsightArtifact[] {
  const artifacts: FailureInsightArtifact[] = [];

  if (step.diagnosticPath) {
    artifacts.push({
      kind: "diagnostic",
      label: "诊断 JSON",
      path: step.diagnosticPath,
    });
  }
  if (step.pageSnapshotPath) {
    artifacts.push({
      kind: "page-snapshot",
      label: "页面快照",
      path: step.pageSnapshotPath,
    });
  }
  if (step.screenshotPath) {
    artifacts.push({
      kind: "screenshot",
      label: "步骤截图",
      path: step.screenshotPath,
    });
  }

  return artifacts;
}

export function formatPageSnapshotSummary(
  step: Pick<ExecutionStepLog, "pageSnapshot" | "pageSnapshotPath">,
): string | undefined {
  const snapshot = step.pageSnapshot;
  if (snapshot) {
    const title = snapshot.title?.trim() || snapshot.url;
    return `${title} · 表单 ${snapshot.formCount} · 按钮 ${snapshot.buttonCount} · 链接 ${snapshot.linkCount}`;
  }
  if (step.pageSnapshotPath) {
    return "已记录页面快照文件，可直接打开 JSON 查看当前页面结构。";
  }
  return undefined;
}

function resolveRuntimeErrorSummary(step: ExecutionStepLog): string {
  const diagnostic = step.diagnostic;
  if (!isRuntimeErrorDiagnostic(diagnostic)) {
    return (
      step.message ??
      "当前步骤失败，但没有更具体的策略诊断，建议先结合页面快照和 artifact 缩小范围。"
    );
  }

  const resetDescriptor = getStudioActionStateResetDescriptor(diagnostic.cause);
  const runtimeDescriptor = getStudioRuntimeCauseDescriptor(diagnostic.runtimeCauseCategory);
  const title = diagnostic.title?.trim();
  const pageLabel =
    title && diagnostic.url
      ? `${title}（${diagnostic.url}）`
      : title ?? diagnostic.url;
  const pageContext = pageLabel ? ` 当前页：${pageLabel}。` : "";
  const recoveryContext = ` ${formatStudioRuntimeRecoverySummary(diagnostic)}`;

  if (resetDescriptor) {
    return `${resetDescriptor.label}：${diagnostic.message}。${resetDescriptor.explanation}。${recoveryContext}${pageContext}`;
  }

  if (runtimeDescriptor) {
    return `${runtimeDescriptor.label}：${diagnostic.message}。${runtimeDescriptor.explanation}。${recoveryContext}${pageContext}`;
  }

  const errorCode = diagnostic.errorCode ? `（${diagnostic.errorCode}）` : "";
  return `${diagnostic.stepType} 步骤执行失败${errorCode}：${diagnostic.message}。${recoveryContext}${pageContext}`;
}

function resolveInsightCategory(step: ExecutionStepLog): {
  category: FailureInsightCategory;
  categoryLabel: string;
  summary: string;
} {
  const targetDiagnostic = isTargetResolutionDiagnostic(step.diagnostic)
    ? step.diagnostic
    : undefined;
  const attempts = targetDiagnostic?.strategyAttempts ?? [];
  const failedAttempts = attempts.filter((attempt) => !attempt.success);
  const fallbackSuccess = resolveFallbackSuccess(step);
  const successfulDisambiguation = resolveSuccessfulDisambiguation(step);

  if (fallbackSuccess) {
    return {
      category: "fallback-success",
      categoryLabel: "备用策略已命中",
      summary: `主策略已有 ${fallbackSuccess.failedAttempts.length} 次失败，但 ${fallbackSuccess.successLabel} 最终命中，本次执行已通过，建议后续补强首选定位避免回放漂移。`,
    };
  }

  if (successfulDisambiguation) {
    return {
      category: "disambiguated-target",
      categoryLabel: "已完成候选收窄",
      summary: describeSuccessfulDisambiguation(successfulDisambiguation),
    };
  }

  const broadAttempt = failedAttempts.find(
    (attempt) =>
      attempt.matchedCount > 1 ||
      (attempt.visibleCount !== undefined && attempt.visibleCount > 1) ||
      Boolean(attempt.ambiguityReason?.trim()) ||
      includesKeyword(`${attempt.ambiguityReason ?? ""} ${attempt.error ?? ""}`, [
        "strict mode violation",
        "resolved to",
        "tie",
        "tied",
        "same score",
        "并列",
        "无法唯一确认",
      ]),
  );
  if (broadAttempt) {
    return {
      category: "ambiguous-target",
      categoryLabel: "目标不唯一",
      summary:
        describeAmbiguousAttempt(broadAttempt) ??
        `${broadAttempt.label} 同时命中 ${broadAttempt.matchedCount} 个候选，当前定位范围过宽，建议先收敛到唯一目标。`,
    };
  }

  const hiddenAttempt = failedAttempts.find(
    (attempt) => attempt.matchedCount > 0 && (attempt.visibleCount ?? 0) === 0,
  );
  if (hiddenAttempt) {
    return {
      category: "hidden-target",
      categoryLabel: "目标不可见",
      summary: `${hiddenAttempt.label} 命中 ${hiddenAttempt.matchedCount} 个候选，但当前都不可见，页面状态还没进入可操作阶段。`,
    };
  }

  const missingAttempt = failedAttempts.find((attempt) => attempt.matchedCount === 0);
  if (missingAttempt) {
    return {
      category: "missing-target",
      categoryLabel: "当前页未找到目标",
      summary: `${missingAttempt.label} 没有命中任何候选，优先核对文案、name、label 或 testId 是否发生变化。`,
    };
  }

  if (isRuntimeErrorDiagnostic(step.diagnostic)) {
    const resetDescriptor = getStudioActionStateResetDescriptor(step.diagnostic.cause);
    if (resetDescriptor) {
      return {
        category: "action-state-reset",
        categoryLabel: resetDescriptor.label,
        summary: resolveRuntimeErrorSummary(step),
      };
    }

    const runtimeDescriptor = getStudioRuntimeCauseDescriptor(
      step.diagnostic.runtimeCauseCategory,
    );
    if (runtimeDescriptor) {
      return {
        category: "runtime-cause",
        categoryLabel: runtimeDescriptor.label,
        summary: resolveRuntimeErrorSummary(step),
      };
    }

    return {
      category: "execution-error",
      categoryLabel: "执行报错",
      summary: resolveRuntimeErrorSummary(step),
    };
  }

  if (!step.diagnostic && step.pageSnapshot) {
    return {
      category: "page-snapshot",
      categoryLabel: "页面快照可用",
      summary: "没有可直接读取的策略诊断，但已保留页面快照，可先核对页面结构与数量信号。",
    };
  }

  if (step.diagnostic || step.message) {
    return {
      category: "execution-error",
      categoryLabel: "执行报错",
      summary:
        step.message ??
        "当前步骤失败，但没有更具体的策略诊断，建议先结合页面快照和 artifact 缩小范围。",
    };
  }

  return {
    category: "page-state",
    categoryLabel: "页面状态待核对",
    summary: "已记录当前步骤的辅助产物，建议先对照页面状态确认是否处在正确上下文。",
  };
}

function resolveInsightTitle(
  step: ExecutionStepLog,
  repairSuggestion?: { title: string },
): string {
  if (resolveFallbackSuccess(step)) {
    return "备用策略兜底成功";
  }

  if (isRuntimeErrorDiagnostic(step.diagnostic)) {
    const resetDescriptor = getStudioActionStateResetDescriptor(step.diagnostic.cause);
    if (resetDescriptor && repairSuggestion) {
      return repairSuggestion.title;
    }

    const runtimeDescriptor = getStudioRuntimeCauseDescriptor(
      step.diagnostic.runtimeCauseCategory,
    );
    if (runtimeDescriptor && repairSuggestion) {
      return repairSuggestion.title;
    }

    return "先查看当前错误反馈";
  }

  if (isTargetResolutionDiagnostic(step.diagnostic)) {
    if (repairSuggestion) {
      return repairSuggestion.title;
    }
  }
  if (step.pageSnapshot) {
    return "先核对页面当前状态";
  }
  if (step.message || step.diagnostic?.message) {
    return "先查看当前错误反馈";
  }
  return "先对照当前诊断产物";
}

export function buildFailureInsight(step: ExecutionStepLog): FailureInsight | null {
  if (
    !step.message &&
    !step.diagnostic &&
    !step.pageSnapshot &&
    !step.diagnosticPath &&
    !step.pageSnapshotPath &&
    !step.screenshotPath
  ) {
    return null;
  }

  const resetDescriptor = isRuntimeErrorDiagnostic(step.diagnostic)
    ? getStudioActionStateResetDescriptor(step.diagnostic.cause)
    : undefined;
  const runtimeDescriptor = isRuntimeErrorDiagnostic(step.diagnostic)
    ? getStudioRuntimeCauseDescriptor(step.diagnostic.runtimeCauseCategory)
    : undefined;
  const repairSuggestion =
    isTargetResolutionDiagnostic(step.diagnostic) || resetDescriptor || runtimeDescriptor
    ? buildDiagnosticRepairSuggestions(step)[0]
    : undefined;
  const { category, categoryLabel, summary } = resolveInsightCategory(step);

  return {
    category,
    categoryLabel,
    title: resolveInsightTitle(step, repairSuggestion),
    summary,
    pageSummary: formatPageSnapshotSummary(step),
    recommendedAction: repairSuggestion?.action,
    artifacts: buildArtifacts(step),
  };
}
