import type { ReactNode } from "react";
import { buildFailureInsight } from "./shared/failure-insights.js";
import { buildDiagnosticRepairSuggestions } from "./shared/repair-suggestions.js";
import type {
  ExecutionStepLog,
  StudioDiagnosticCandidateSummary,
  StudioDiagnosticStrategyAttempt,
  StudioStepDiagnostic,
  StudioDiagnosticTargetHints,
  StudioTargetResolutionDiagnostic,
} from "./shared/studio-api-types.js";
import {
  formatStudioRuntimeRecoverySummary,
  formatStudioDiagnosticCause,
  getStudioActionStateResetDescriptor,
  getStudioRuntimeCauseDescriptor,
  isRuntimeErrorDiagnostic,
  isTargetResolutionDiagnostic,
} from "./shared/studio-api-types.js";

type DiagnosticInspectorProps = {
  steps: ExecutionStepLog[];
  selectedStepIndex: number | null;
  onSelectStepIndex: (stepIndex: number) => void;
  onPreviewScreenshot?: (step: ExecutionStepLog) => void;
};

function formatCount(value?: number): string {
  return value === undefined ? "—" : String(value);
}

function formatStatus(status: ExecutionStepLog["status"]): string {
  switch (status) {
    case "failed":
      return "失败";
    case "passed":
      return "通过";
    case "running":
      return "执行中";
    case "pending":
      return "待执行";
    case "skipped":
      return "跳过";
  }
}

function countStrategyAttempts(
  step: ExecutionStepLog,
): {
  successCount: number;
  failureCount: number;
  visibleCandidateCount: number;
} {
  const attempts = isTargetResolutionDiagnostic(step.diagnostic)
    ? step.diagnostic.strategyAttempts
    : [];
  return {
    successCount: attempts.filter((attempt) => attempt.success).length,
    failureCount: attempts.filter((attempt) => !attempt.success).length,
    visibleCandidateCount: attempts.reduce(
      (total, attempt) => total + (attempt.visibleCount ?? 0),
      0,
    ),
  };
}

function resolveDiagnosticStepType(
  step: ExecutionStepLog,
  diagnostic?: StudioStepDiagnostic,
): string {
  return diagnostic?.stepType ?? step.stepType ?? "—";
}

function resolveDiagnosticMessage(
  step: ExecutionStepLog,
  diagnostic?: StudioStepDiagnostic,
): string {
  return diagnostic?.message ?? step.message ?? "—";
}

function includesKeyword(value: string | undefined, keywords: string[]): boolean {
  const normalized = value?.toLowerCase() ?? "";
  return keywords.some((keyword) => normalized.includes(keyword));
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function formatScopeKind(
  scopeKind?: StudioDiagnosticTargetHints["scopeKind"],
): string {
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
      return "—";
  }
}

function buildAmbiguityClues(step: ExecutionStepLog): string[] {
  const diagnostic = isTargetResolutionDiagnostic(step.diagnostic)
    ? step.diagnostic
    : undefined;
  const attempts = diagnostic?.strategyAttempts ?? [];
  const ambiguousAttempt = attempts.find(
    (attempt) =>
      !attempt.success &&
      (attempt.matchedCount > 1 ||
        (attempt.visibleCount !== undefined && attempt.visibleCount > 1) ||
        Boolean(attempt.ambiguityReason?.trim()) ||
        includesKeyword(attempt.error, [
          "strict mode violation",
          "resolved to",
          "tie",
          "tied",
          "same score",
          "并列",
          "候选评分",
          "无法唯一确认",
        ])),
  );

  if (!ambiguousAttempt) {
    return [];
  }

  const clues = [
    `当前策略 ${ambiguousAttempt.label} 一次命中 ${ambiguousAttempt.matchedCount} 个候选${
      ambiguousAttempt.visibleCount !== undefined
        ? `，其中可见 ${ambiguousAttempt.visibleCount} 个`
        : ""
    }。`,
  ];
  const scopeText = diagnostic?.targetHints?.scopeText?.trim();
  const scopeKind = diagnostic?.targetHints?.scopeKind;
  const scopeKindLabel = scopeKind ? formatScopeKind(scopeKind) : undefined;

  if (scopeText) {
    clues.push(
      `记录到的作用域线索：${scopeKindLabel ? `${scopeKindLabel}“${scopeText}”` : `“${scopeText}”`}。`,
    );
  } else if (scopeKindLabel) {
    clues.push(`当前只记录到作用域类型“${scopeKindLabel}”，还缺少能区分目标的标题或编号。`);
  } else {
    clues.push(
      "当前没有记录到列表行、弹层标题或卡片摘要这类作用域线索，所以同名目标之间仍然无法区分。",
    );
  }

  if (ambiguousAttempt.ambiguityReason?.trim()) {
    clues.push(`runtime 反馈：${ambiguousAttempt.ambiguityReason}。`);
    clues.push("这些线索已经帮助收窄范围，但仍不足以唯一确认目标。");
  } else if (
    includesKeyword(ambiguousAttempt.error, [
      "tie",
      "tied",
      "same score",
      "并列",
      "候选评分",
      "无法唯一确认",
    ])
  ) {
    clues.push("runtime 已判定候选并列，继续重放仍可能点到错误目标。");
  } else {
    clues.push("当前定位范围仍然过宽，重复按钮之间仍然容易点错对象。");
  }

  return clues;
}

function formatCandidateScopeKind(
  scopeKind?: StudioDiagnosticCandidateSummary["scopeKind"],
): string | undefined {
  return scopeKind ? formatScopeKind(scopeKind) : undefined;
}

function resolveAttemptCandidates(
  attempt: StudioDiagnosticStrategyAttempt,
): StudioDiagnosticCandidateSummary[] {
  return attempt.candidateSummaries ?? [];
}

function resolveCandidateFocusHints(attempt: StudioDiagnosticStrategyAttempt): string[] {
  const candidates = resolveAttemptCandidates(attempt);
  if (candidates.length === 0) {
    return [];
  }

  if (attempt.selectedIndex !== undefined) {
    const selectedCandidate = candidates.find(
      (candidate) => candidate.index === attempt.selectedIndex,
    );
    return uniqueStrings(selectedCandidate?.matchedHints ?? []);
  }

  const topScore = Math.max(...candidates.map((candidate) => candidate.score));
  const topCandidates = candidates.filter((candidate) => candidate.score === topScore);
  const sharedHints = uniqueStrings(topCandidates[0]?.matchedHints ?? []).filter((hint) =>
    topCandidates.every((candidate) => candidate.matchedHints.includes(hint)),
  );
  if (sharedHints.length > 0) {
    return sharedHints;
  }

  return uniqueStrings(topCandidates.flatMap((candidate) => candidate.matchedHints));
}

function resolveCandidateRemainingGap(attempt: StudioDiagnosticStrategyAttempt): string {
  const candidates = resolveAttemptCandidates(attempt);
  const visibleCandidateCount = candidates.filter((candidate) => candidate.visible).length;
  const candidateCount = visibleCandidateCount || candidates.length || attempt.visibleCount || 0;

  if (attempt.ambiguityReason?.trim()) {
    const focusHints = resolveCandidateFocusHints(attempt);
    const hintSummary =
      focusHints.length > 0 ? `当前这些线索都已命中 ${focusHints.join("、")}，` : "";
    return `${hintSummary}但仍只能把范围缩到 ${candidateCount || attempt.matchedCount} 个候选。`;
  }

  if (attempt.selectedIndex !== undefined && candidateCount > 1) {
    return `runtime 已选中候选 #${attempt.selectedIndex + 1}，但页面上仍有 ${candidateCount} 个相似候选，后续页面改版后仍可能漂移。`;
  }

  if (candidateCount > 1) {
    return `当前页面上仍有 ${candidateCount} 个相似候选。`;
  }

  return "当前产物没有记录到更多可区分的候选差异。";
}

function formatCandidateSummary(candidate: StudioDiagnosticCandidateSummary): string {
  const parts = [
    `候选 #${candidate.index + 1}`,
    `${candidate.score} 分`,
    candidate.visible ? "可见" : "不可见",
  ];

  const scopeKindLabel = formatCandidateScopeKind(candidate.scopeKind);
  if (candidate.scopeText) {
    parts.push(
      scopeKindLabel ? `${scopeKindLabel}“${candidate.scopeText}”` : `scope=${candidate.scopeText}`,
    );
  }
  if (candidate.labelText) {
    parts.push(`label=${candidate.labelText}`);
  }
  if (candidate.placeholder) {
    parts.push(`placeholder=${candidate.placeholder}`);
  }
  if (candidate.nameAttr) {
    parts.push(`name=${candidate.nameAttr}`);
  }
  if (candidate.textSample) {
    parts.push(`text=${candidate.textSample}`);
  }
  if (candidate.matchedHints.length > 0) {
    parts.push(`命中 ${candidate.matchedHints.join("、")}`);
  }

  return parts.join(" · ");
}

function buildCandidateDetails(
  diagnostic?: StudioTargetResolutionDiagnostic,
): Array<{
  attempt: StudioDiagnosticStrategyAttempt;
  helpfulHints: string[];
  remainingGap: string;
  candidateSummaries: StudioDiagnosticCandidateSummary[];
}> {
  if (!diagnostic) {
    return [];
  }

  return diagnostic.strategyAttempts
    .filter(
      (attempt) =>
        attempt.selectedIndex !== undefined ||
        Boolean(attempt.ambiguityReason?.trim()) ||
        (attempt.candidateSummaries?.length ?? 0) > 0,
    )
    .map((attempt) => ({
      attempt,
      helpfulHints: resolveCandidateFocusHints(attempt),
      remainingGap: resolveCandidateRemainingGap(attempt),
      candidateSummaries: resolveAttemptCandidates(attempt),
    }));
}

export function DiagnosticInspector({
  steps,
  selectedStepIndex,
  onSelectStepIndex,
  onPreviewScreenshot,
}: DiagnosticInspectorProps): ReactNode {
  const diagnosticSteps = steps.filter(
    (step) => step.hasDiagnostic || step.hasPageSnapshot || step.diagnostic || step.pageSnapshot,
  );

  if (diagnosticSteps.length === 0) {
    return null;
  }

  const activeStep =
    diagnosticSteps.find((step) => step.stepIndex === selectedStepIndex) ??
    diagnosticSteps.find((step) => step.hasDiagnostic || step.diagnostic) ??
    diagnosticSteps[0]!;
  const diagnostic = activeStep.diagnostic;
  const targetDiagnostic = isTargetResolutionDiagnostic(diagnostic) ? diagnostic : undefined;
  const runtimeErrorDiagnostic = isRuntimeErrorDiagnostic(diagnostic)
    ? diagnostic
    : undefined;
  const actionStateResetDescriptor = runtimeErrorDiagnostic
    ? getStudioActionStateResetDescriptor(runtimeErrorDiagnostic.cause)
    : undefined;
  const runtimeCauseDescriptor = runtimeErrorDiagnostic
    ? getStudioRuntimeCauseDescriptor(runtimeErrorDiagnostic.runtimeCauseCategory)
    : undefined;
  const insight = buildFailureInsight(activeStep);
  const summary = targetDiagnostic ? countStrategyAttempts(activeStep) : null;
  const repairSuggestions = targetDiagnostic || actionStateResetDescriptor || runtimeCauseDescriptor
    ? buildDiagnosticRepairSuggestions(activeStep)
    : [];
  const ambiguityClues = targetDiagnostic ? buildAmbiguityClues(activeStep) : [];
  const candidateDetails = buildCandidateDetails(targetDiagnostic);

  return (
    <section className="flow-preview">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "flex-start",
        }}
        >
        <div>
          <h3 style={{ marginBottom: 4 }}>诊断工作台</h3>
          <p className="flow-content-meta">
            聚焦失败原因、定位线索与页面快照，帮助快速定位回放异常
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {diagnosticSteps.map((step) => (
            <button
              key={`${step.stepId}-${step.stepIndex}`}
              type="button"
              className={step.stepIndex === activeStep.stepIndex ? "tab-btn active" : "tab-btn"}
              onClick={() => onSelectStepIndex(step.stepIndex)}
            >
              步骤 {step.stepIndex + 1}
            </button>
          ))}
        </div>
      </div>

      <p className="execution-history-meta" style={{ marginTop: 12 }}>
        {activeStep.label} · {formatStatus(activeStep.status)} · ID <code>{activeStep.stepId}</code>
      </p>

      {activeStep.message ? (
        <p className="error" role="alert">
          {activeStep.message}
        </p>
      ) : null}

      {insight ? (
        <div
          style={{
            display: "grid",
            gap: 12,
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            marginBottom: 16,
          }}
        >
          <div className="flow-preview" style={{ margin: 0 }}>
            <strong>失败类别</strong>
            <div style={{ marginTop: 8 }}>{insight.categoryLabel}</div>
            <p className="flow-content-meta" style={{ marginTop: 8 }}>
              {insight.title}
            </p>
          </div>
          <div className="flow-preview" style={{ margin: 0 }}>
            <strong>优先排查</strong>
            <p className="flow-content-meta" style={{ marginTop: 8 }}>
              {insight.summary}
            </p>
            {insight.recommendedAction ? (
              <p className="flow-content-meta" style={{ marginTop: 8 }}>
                下一步：{insight.recommendedAction}
              </p>
            ) : null}
          </div>
          <div className="flow-preview" style={{ margin: 0 }}>
            <strong>页面快照摘要</strong>
            <p className="flow-content-meta" style={{ marginTop: 8 }}>
              {insight.pageSummary ?? "当前步骤没有页面快照摘要。"}
            </p>
          </div>
        </div>
      ) : null}

      {runtimeErrorDiagnostic ? (
        <div
          style={{
            display: "grid",
            gap: 12,
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            marginBottom: 16,
          }}
        >
          <div className="flow-preview" style={{ margin: 0 }}>
            <strong>根因分类</strong>
            <div style={{ marginTop: 8 }}>
              {runtimeCauseDescriptor
                ? `${runtimeCauseDescriptor.label}（${runtimeCauseDescriptor.category}）`
                : runtimeErrorDiagnostic.runtimeCauseCategory ?? "—"}
            </div>
          </div>
          <div className="flow-preview" style={{ margin: 0 }}>
            <strong>恢复状态</strong>
            <div style={{ marginTop: 8 }}>
              {runtimeErrorDiagnostic.recoveryTried ? "已尝试恢复" : "未触发恢复"}
            </div>
            <p className="flow-content-meta" style={{ marginTop: 8 }}>
              {formatStudioRuntimeRecoverySummary(runtimeErrorDiagnostic)}
            </p>
          </div>
          <div className="flow-preview" style={{ margin: 0 }}>
            <strong>恢复次数</strong>
            <div style={{ marginTop: 8 }}>
              {runtimeErrorDiagnostic.recoveredAttemptCount ?? 0}
            </div>
          </div>
        </div>
      ) : null}

      {ambiguityClues.length > 0 ? (
        <div className="flow-preview" style={{ margin: "0 0 16px" }}>
          <strong>歧义线索</strong>
          <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
            {ambiguityClues.map((clue, index) => (
              <p key={`${activeStep.stepId}-ambiguity-${index}`} className="flow-content-meta" style={{ margin: 0 }}>
                {clue}
              </p>
            ))}
          </div>
        </div>
      ) : null}

      {summary ? (
        <div
          style={{
            display: "grid",
            gap: 12,
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            marginBottom: 16,
          }}
        >
          <div className="flow-preview" style={{ margin: 0 }}>
            <strong>成功策略</strong>
            <div>{summary.successCount}</div>
          </div>
          <div className="flow-preview" style={{ margin: 0 }}>
            <strong>失败策略</strong>
            <div>{summary.failureCount}</div>
          </div>
          <div className="flow-preview" style={{ margin: 0 }}>
            <strong>可见候选</strong>
            <div>{summary.visibleCandidateCount}</div>
          </div>
        </div>
      ) : null}

      {repairSuggestions.length > 0 ? (
        <div className="flow-preview" style={{ margin: "0 0 16px" }}>
          <strong>修复建议</strong>
          <ul style={{ margin: "12px 0 0", paddingLeft: 20, display: "grid", gap: 12 }}>
            {repairSuggestions.map((suggestion) => (
              <li key={suggestion.id}>
                <strong>{suggestion.title}</strong>
                <p className="flow-content-meta" style={{ margin: "4px 0 0" }}>
                  下一步：{suggestion.action}
                </p>
                <p className="flow-content-meta" style={{ margin: "4px 0 0" }}>
                  依据：{suggestion.reason}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {candidateDetails.length > 0 ? (
        <div className="flow-preview" style={{ margin: "0 0 16px" }}>
          <strong>候选细节</strong>
          <div
            style={{
              display: "grid",
              gap: 12,
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              marginTop: 12,
            }}
          >
            {candidateDetails.map(({ attempt, helpfulHints, remainingGap, candidateSummaries }, index) => (
              <div className="flow-preview" style={{ margin: 0 }} key={`${attempt.label}-${index}`}>
                <strong>{attempt.label}</strong>
                <p className="flow-content-meta" style={{ margin: "8px 0 0" }}>
                  选中候选：{attempt.selectedIndex !== undefined ? `#${attempt.selectedIndex + 1}` : "—"}
                </p>
                <p className="flow-content-meta" style={{ margin: "4px 0 0" }}>
                  歧义原因：{attempt.ambiguityReason?.trim() || "—"}
                </p>
                <p className="flow-content-meta" style={{ margin: "4px 0 0" }}>
                  帮助收窄：
                  {helpfulHints.length > 0
                    ? helpfulHints.join("、")
                    : "当前产物没有记录到命中的收窄线索。"}
                </p>
                <p className="flow-content-meta" style={{ margin: "4px 0 0" }}>
                  仍不足：{remainingGap}
                </p>
                {candidateSummaries.length > 0 ? (
                  <>
                    <strong style={{ display: "block", marginTop: 12 }}>候选摘要列表</strong>
                    <ul style={{ margin: "8px 0 0", paddingLeft: 20, display: "grid", gap: 8 }}>
                      {candidateSummaries.map((candidate) => (
                        <li key={`${attempt.label}-candidate-${candidate.index}`}>
                          <span className="flow-content-meta">{formatCandidateSummary(candidate)}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {insight && insight.artifacts.length > 0 ? (
        <div className="flow-preview" style={{ margin: "0 0 16px" }}>
          <strong>产物入口</strong>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
            {insight.artifacts.map((artifact) => (
              artifact.kind === "screenshot" && onPreviewScreenshot ? (
                <button
                  type="button"
                  key={artifact.kind}
                  onClick={() => onPreviewScreenshot(activeStep)}
                >
                  {artifact.label}
                </button>
              ) : (
                <span key={artifact.kind} className="flow-content-meta">
                  {artifact.label}已结构化展示
                </span>
              )
            ))}
          </div>
        </div>
      ) : null}

      {diagnostic ? (
        <>
          <table className="fw-step-log-table">
            <tbody>
              <tr>
                <th>诊断类型</th>
                <td>{runtimeErrorDiagnostic ? "运行时错误" : "目标定位"}</td>
              </tr>
              <tr>
                <th>步骤类型</th>
                <td>{resolveDiagnosticStepType(activeStep, diagnostic)}</td>
              </tr>
              <tr>
                <th>错误码</th>
                <td>{diagnostic.errorCode ?? "—"}</td>
              </tr>
              <tr>
                <th>诊断消息</th>
                <td>{resolveDiagnosticMessage(activeStep, diagnostic)}</td>
              </tr>
              {diagnostic.cause ? (
                <tr>
                  <th>原因</th>
                  <td>{formatStudioDiagnosticCause(diagnostic.cause) ?? "—"}</td>
                </tr>
              ) : null}
              {runtimeErrorDiagnostic ? (
                <tr>
                  <th>根因分类</th>
                  <td>
                    {runtimeCauseDescriptor
                      ? `${runtimeCauseDescriptor.label}（${runtimeCauseDescriptor.category}）`
                      : runtimeErrorDiagnostic.runtimeCauseCategory ?? "—"}
                  </td>
                </tr>
              ) : null}
              {runtimeErrorDiagnostic ? (
                <tr>
                  <th>恢复状态</th>
                  <td>{runtimeErrorDiagnostic.recoveryTried ? "已尝试恢复" : "未触发恢复"}</td>
                </tr>
              ) : null}
              {runtimeErrorDiagnostic ? (
                <tr>
                  <th>恢复次数</th>
                  <td>{runtimeErrorDiagnostic.recoveredAttemptCount ?? 0}</td>
                </tr>
              ) : null}
              <tr>
                <th>URL</th>
                <td>{diagnostic.url ?? "—"}</td>
              </tr>
              <tr>
                <th>标题</th>
                <td>{diagnostic.title?.trim() || "—"}</td>
              </tr>
              {targetDiagnostic ? (
                <tr>
                  <th>策略尝试数</th>
                  <td>{targetDiagnostic.strategyAttempts.length}</td>
                </tr>
              ) : null}
            </tbody>
          </table>

          {targetDiagnostic ? (
            <>
              <h4 style={{ margin: "16px 0 8px" }}>定位策略尝试</h4>
              <table className="fw-step-log-table">
                <thead>
                  <tr>
                    <th>策略</th>
                    <th>匹配数</th>
                    <th>可见数</th>
                    <th>选中候选</th>
                    <th>结果</th>
                    <th>歧义原因</th>
                    <th>错误</th>
                  </tr>
                </thead>
                <tbody>
                  {targetDiagnostic.strategyAttempts.map((attempt, index) => (
                    <tr key={`${attempt.label}-${index}`}>
                      <td>{attempt.label}</td>
                      <td>{attempt.matchedCount}</td>
                      <td>{formatCount(attempt.visibleCount)}</td>
                      <td>
                        {attempt.selectedIndex !== undefined ? `#${attempt.selectedIndex + 1}` : "—"}
                      </td>
                      <td>{attempt.success ? "成功" : "失败"}</td>
                      <td>{attempt.ambiguityReason?.trim() || "—"}</td>
                      <td>{attempt.error ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {targetDiagnostic.targetHints ? (
                <>
                  <h4 style={{ margin: "16px 0 8px" }}>目标提示</h4>
                  <table className="fw-step-log-table">
                    <tbody>
                      <tr>
                        <th>标签</th>
                        <td>{targetDiagnostic.targetHints.tagName ?? "—"}</td>
                      </tr>
                      <tr>
                        <th>输入类型</th>
                        <td>{targetDiagnostic.targetHints.inputType ?? "—"}</td>
                      </tr>
                      <tr>
                        <th>name 属性</th>
                        <td>{targetDiagnostic.targetHints.nameAttr ?? "—"}</td>
                      </tr>
                      <tr>
                        <th>占位提示</th>
                        <td>{targetDiagnostic.targetHints.placeholder ?? "—"}</td>
                      </tr>
                      <tr>
                        <th>关联文案</th>
                        <td>{targetDiagnostic.targetHints.labelText ?? "—"}</td>
                      </tr>
                      <tr>
                        <th>文本样本</th>
                        <td>{targetDiagnostic.targetHints.textSample ?? "—"}</td>
                      </tr>
                      <tr>
                        <th>作用域类型</th>
                        <td>
                          {targetDiagnostic.targetHints.scopeKind
                            ? formatScopeKind(targetDiagnostic.targetHints.scopeKind)
                            : "—"}
                        </td>
                      </tr>
                      <tr>
                        <th>作用域文本</th>
                        <td>{targetDiagnostic.targetHints.scopeText ?? "—"}</td>
                      </tr>
                    </tbody>
                  </table>
                </>
              ) : null}
            </>
          ) : null}
        </>
      ) : activeStep.hasDiagnostic ? (
        <p className="execution-history-empty">
          已检测到诊断产物，但当前无法安全解析结构化内容。
        </p>
      ) : null}

      {activeStep.pageSnapshot ? (
        <details style={{ marginTop: 12 }} open>
          <summary>页面摘要详情</summary>
          <table className="fw-step-log-table" style={{ marginTop: 12 }}>
            <tbody>
              <tr>
                <th>页面 URL</th>
                <td>{activeStep.pageSnapshot.url}</td>
              </tr>
              <tr>
                <th>页面标题</th>
                <td>{activeStep.pageSnapshot.title || "—"}</td>
              </tr>
              <tr>
                <th>表单数</th>
                <td>{activeStep.pageSnapshot.formCount}</td>
              </tr>
              <tr>
                <th>按钮数</th>
                <td>{activeStep.pageSnapshot.buttonCount}</td>
              </tr>
              <tr>
                <th>链接数</th>
                <td>{activeStep.pageSnapshot.linkCount}</td>
              </tr>
              <tr>
                <th>采集时间</th>
                <td>{activeStep.pageSnapshot.capturedAt}</td>
              </tr>
            </tbody>
          </table>
        </details>
      ) : null}
    </section>
  );
}
