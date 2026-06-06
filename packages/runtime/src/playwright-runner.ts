import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { FlowDocument, NormalizedStep, Target } from "@flowweave/flow-dsl";
import { buildPageSnapshotSummary } from "@flowweave/page-intelligence";
import { FlowWeaveError, interpolateTemplateString } from "@flowweave/shared";

type LocatorStrategy = Target["strategies"][number];
import { chromium, type Locator, type Page } from "playwright";
import type {
  DiagnosticCandidateSummary,
  ExecutionOptions,
  ExecutionResult,
  ExecutionVariables,
  RuntimeErrorDiagnostic,
  RuntimePageSnapshot,
  StepDiagnostic,
  StepLog,
  StrategyAttempt,
  TargetResolutionDiagnostic,
} from "./types.js";

export type { ExecutionOptions };

type TargetWaitState = "visible" | "hidden" | "attached" | "detached";

type TargetDiagnosticContext = Pick<
  TargetResolutionDiagnostic,
  "url" | "title" | "strategyAttempts" | "targetHints" | "cause"
>;

type ScopeKind = NonNullable<NonNullable<Target["hints"]>["scopeKind"]>;

type CandidateSnapshot = {
  index: number;
  visible: boolean;
  tagName?: string;
  inputType?: string;
  nameAttr?: string;
  placeholder?: string;
  labelText?: string;
  textSample?: string;
  scopeKind?: ScopeKind;
  scopeText?: string;
};

type CandidateSummary = DiagnosticCandidateSummary;

type CandidateResolution =
  | {
      status: "selected";
      locator: Locator;
      selectedIndex: number;
      candidateSummaries: CandidateSummary[];
    }
  | {
      status: "ambiguous";
      reason: string;
      candidateSummaries: CandidateSummary[];
    };

const MIN_DISAMBIGUATION_SCORE = 4;
const SUGGEST_READY_TIMEOUT_MS = 1_200;
const NAVIGATION_PRESS_KEYS = new Set(["ArrowDown", "ArrowUp"]);

function nowIso(): string {
  return new Date().toISOString();
}

function formatUnknownError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function getErrorCode(error: unknown): FlowWeaveError["code"] | undefined {
  return error instanceof FlowWeaveError ? error.code : undefined;
}

function getErrorCause(error: unknown): string | undefined {
  if (error instanceof FlowWeaveError && error.details && typeof error.details === "object") {
    const details = error.details as { cause?: unknown };
    if (typeof details.cause === "string" && details.cause.length > 0) {
      return details.cause;
    }
  }

  if (!(error instanceof Error) || !("cause" in error)) {
    return undefined;
  }

  const cause = (error as Error & { cause?: unknown }).cause;
  if (typeof cause === "string" && cause.length > 0) {
    return cause;
  }
  if (cause instanceof Error) {
    return cause.message;
  }
  return cause == null ? undefined : String(cause);
}

async function captureDiagnosticPageMeta(
  page: Page,
): Promise<Pick<RuntimeErrorDiagnostic, "url" | "title">> {
  let url: string | undefined;
  let title: string | undefined;

  try {
    url = page.url();
  } catch {
    url = undefined;
  }

  try {
    title = await page.title();
  } catch {
    title = undefined;
  }

  return { url, title };
}

function interpolateString(
  value: string,
  variables?: ExecutionVariables,
): string {
  return interpolateTemplateString(value, variables);
}

function interpolateStepValue<T>(value: T, variables?: ExecutionVariables): T {
  if (typeof value === "string") {
    return interpolateString(value, variables) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => interpolateStepValue(item, variables)) as T;
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value).map(([key, entryValue]) => [
      key,
      interpolateStepValue(entryValue, variables),
    ]);
    return Object.fromEntries(entries) as T;
  }

  return value;
}

function isAbsoluteUrl(value: string): boolean {
  return /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(value);
}

function resolveNavigationUrl(url: string, baseUrl?: string): string {
  if (!baseUrl || isAbsoluteUrl(url)) {
    return url;
  }

  return new URL(url, baseUrl).toString();
}

function resolveStep(step: NormalizedStep, options: ExecutionOptions): NormalizedStep {
  const interpolated = interpolateStepValue(step, options.variables) as NormalizedStep;

  if (interpolated.type !== "navigate") {
    return interpolated;
  }

  return {
    ...interpolated,
    url: resolveNavigationUrl(interpolated.url, options.baseUrl),
  };
}

function formatStrategyLabel(strategy: LocatorStrategy): string {
  switch (strategy.kind) {
    case "css":
      return strategy.selector;
    case "role":
      return `role=${strategy.role}${strategy.name ? ` name="${strategy.name}"` : ""}`;
    case "text":
      return `text="${strategy.text}"`;
    case "testId":
      return `testId=${strategy.testId}`;
    case "xpath":
      return `xpath=${strategy.expression}`;
    default: {
      const _exhaustive: never = strategy;
      return _exhaustive;
    }
  }
}

function formatTargetHints(target: Target): string | null {
  if (!target.hints) {
    return null;
  }

  const entries = Object.entries(target.hints).filter(([, value]) => value);
  if (entries.length === 0) {
    return null;
  }

  return entries.map(([key, value]) => `${key}=${value}`).join("，");
}

function normalizeTextValue(value: string | null | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 0 ? normalized.toLowerCase() : undefined;
}

function truncateText(value: string | undefined, maxLength = 60): string | undefined {
  if (!value) {
    return undefined;
  }

  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}…`;
}

function scoreTextHint(
  candidateValue: string | undefined,
  hintValue: string | undefined,
  exactScore: number,
  containsScore: number,
): number {
  const normalizedCandidate = normalizeTextValue(candidateValue);
  const normalizedHint = normalizeTextValue(hintValue);

  if (!normalizedCandidate || !normalizedHint) {
    return 0;
  }

  if (normalizedCandidate === normalizedHint) {
    return exactScore;
  }

  if (
    normalizedCandidate.includes(normalizedHint) ||
    normalizedHint.includes(normalizedCandidate)
  ) {
    return containsScore;
  }

  return 0;
}

function scoreExactHint(
  candidateValue: string | undefined,
  hintValue: string | undefined,
  score: number,
): number {
  const normalizedCandidate = normalizeTextValue(candidateValue);
  const normalizedHint = normalizeTextValue(hintValue);

  if (!normalizedCandidate || !normalizedHint) {
    return 0;
  }

  return normalizedCandidate === normalizedHint ? score : 0;
}

async function countVisible(locator: Locator, matchedCount: number): Promise<number> {
  if (matchedCount === 0) {
    return 0;
  }

  let visibleCount = 0;
  for (let index = 0; index < matchedCount; index++) {
    if (await locator.nth(index).isVisible().catch(() => false)) {
      visibleCount += 1;
    }
  }

  return visibleCount;
}

async function collectCandidateSnapshot(
  locator: Locator,
  index: number,
  preferredScopeKind?: ScopeKind,
): Promise<CandidateSnapshot> {
  const candidate = locator.nth(index);
  const visible = await candidate.isVisible().catch(() => false);
  const details = await candidate
    .evaluate(
      function (element, scopeKind) {
        const scopeSelectors: Record<string, string> = {
          row: "tr, [role='row']",
          listitem: "li, [role='listitem']",
          dialog: "[role='dialog'], dialog, .el-dialog",
          tabpanel: "[role='tabpanel']",
          section: "section, article, [role='region']",
          card: "[data-card], [class*='card'], article, [role='group']",
        };
        let labelText = (function (text, limit) {
          if (!text) {
            return undefined;
          }

          const normalized = text.replace(/\s+/g, " ").trim();
          if (!normalized) {
            return undefined;
          }

          return normalized.length <= limit
            ? normalized
            : `${normalized.slice(0, limit - 1)}…`;
        })(element.getAttribute("aria-label"), 120);

        if (!labelText) {
          const ariaLabelledBy = element.getAttribute("aria-labelledby");
          if (ariaLabelledBy) {
            labelText = (function (text, limit) {
              if (!text) {
                return undefined;
              }

              const normalized = text.replace(/\s+/g, " ").trim();
              if (!normalized) {
                return undefined;
              }

              return normalized.length <= limit
                ? normalized
                : `${normalized.slice(0, limit - 1)}…`;
            })(
              ariaLabelledBy
                .split(/\s+/)
                .map((id) => document.getElementById(id)?.textContent ?? "")
                .join(" "),
              120,
            );
          }
        }

        if (!labelText && "labels" in element) {
          labelText = (function (text, limit) {
            if (!text) {
              return undefined;
            }

            const normalized = text.replace(/\s+/g, " ").trim();
            if (!normalized) {
              return undefined;
            }

            return normalized.length <= limit
              ? normalized
              : `${normalized.slice(0, limit - 1)}…`;
          })(
            Array.from((element as HTMLInputElement).labels ?? [])
              .map((label) => label.textContent ?? "")
              .join(" "),
            120,
          );
        }

        if (!labelText) {
          labelText = (function (text, limit) {
            if (!text) {
              return undefined;
            }

            const normalized = text.replace(/\s+/g, " ").trim();
            if (!normalized) {
              return undefined;
            }

            return normalized.length <= limit
              ? normalized
              : `${normalized.slice(0, limit - 1)}…`;
          })(element.closest("label")?.textContent, 120);
        }

        const scopeKinds = scopeKind
          ? [scopeKind]
          : (["row", "listitem", "dialog", "tabpanel", "section", "card"] as const);
        for (const candidateScopeKind of scopeKinds) {
          const selector = scopeSelectors[candidateScopeKind];
          if (!selector) {
            continue;
          }
          const container = element.closest(selector);
          const scopeText = (function (text, limit) {
            if (!text) {
              return undefined;
            }

            const normalized = text.replace(/\s+/g, " ").trim();
            if (!normalized) {
              return undefined;
            }

            return normalized.length <= limit
              ? normalized
              : `${normalized.slice(0, limit - 1)}…`;
          })(container?.textContent, 160);
          if (scopeText) {
            return {
              tagName: element.tagName.toLowerCase(),
              inputType:
                "type" in element && typeof (element as HTMLInputElement).type === "string"
                  ? (element as HTMLInputElement).type
                  : undefined,
              nameAttr: (function (text, limit) {
                if (!text) {
                  return undefined;
                }

                const normalized = text.replace(/\s+/g, " ").trim();
                if (!normalized) {
                  return undefined;
                }

                return normalized.length <= limit
                  ? normalized
                  : `${normalized.slice(0, limit - 1)}…`;
              })(element.getAttribute("name"), 120),
              placeholder: (function (text, limit) {
                if (!text) {
                  return undefined;
                }

                const normalized = text.replace(/\s+/g, " ").trim();
                if (!normalized) {
                  return undefined;
                }

                return normalized.length <= limit
                  ? normalized
                  : `${normalized.slice(0, limit - 1)}…`;
              })(element.getAttribute("placeholder"), 120),
              labelText,
              textSample: (function (text, limit) {
                if (!text) {
                  return undefined;
                }

                const normalized = text.replace(/\s+/g, " ").trim();
                if (!normalized) {
                  return undefined;
                }

                return normalized.length <= limit
                  ? normalized
                  : `${normalized.slice(0, limit - 1)}…`;
              })(element.textContent, 120),
              scopeKind: candidateScopeKind,
              scopeText,
            };
          }
        }

        return {
          tagName: element.tagName.toLowerCase(),
          inputType:
            "type" in element && typeof (element as HTMLInputElement).type === "string"
              ? (element as HTMLInputElement).type
              : undefined,
          nameAttr: (function (text, limit) {
            if (!text) {
              return undefined;
            }

            const normalized = text.replace(/\s+/g, " ").trim();
            if (!normalized) {
              return undefined;
            }

            return normalized.length <= limit
              ? normalized
              : `${normalized.slice(0, limit - 1)}…`;
          })(element.getAttribute("name"), 120),
          placeholder: (function (text, limit) {
            if (!text) {
              return undefined;
            }

            const normalized = text.replace(/\s+/g, " ").trim();
            if (!normalized) {
              return undefined;
            }

            return normalized.length <= limit
              ? normalized
              : `${normalized.slice(0, limit - 1)}…`;
          })(element.getAttribute("placeholder"), 120),
          labelText,
          textSample: (function (text, limit) {
            if (!text) {
              return undefined;
            }

            const normalized = text.replace(/\s+/g, " ").trim();
            if (!normalized) {
              return undefined;
            }

            return normalized.length <= limit
              ? normalized
              : `${normalized.slice(0, limit - 1)}…`;
          })(element.textContent, 120),
        };
      },
      preferredScopeKind,
    )
    .catch(() => ({}));

  return {
    index,
    visible,
    ...details,
  };
}

function buildCandidateSummary(
  snapshot: CandidateSnapshot,
  hints: Target["hints"],
): CandidateSummary {
  let score = 0;
  const matchedHints: string[] = [];

  const pushMatch = (label: string, points: number) => {
    if (points <= 0) {
      return;
    }

    score += points;
    matchedHints.push(label);
  };

  pushMatch("scopeText", scoreTextHint(snapshot.scopeText, hints?.scopeText, 24, 16));
  pushMatch("scopeKind", scoreExactHint(snapshot.scopeKind, hints?.scopeKind, 4));
  pushMatch("labelText", scoreTextHint(snapshot.labelText, hints?.labelText, 12, 8));
  pushMatch("placeholder", scoreTextHint(snapshot.placeholder, hints?.placeholder, 10, 6));
  pushMatch("nameAttr", scoreTextHint(snapshot.nameAttr, hints?.nameAttr, 10, 6));
  pushMatch("textSample", scoreTextHint(snapshot.textSample, hints?.textSample, 8, 4));
  pushMatch("tagName", scoreExactHint(snapshot.tagName, hints?.tagName, 2));
  pushMatch("inputType", scoreExactHint(snapshot.inputType, hints?.inputType, 2));

  return {
    ...snapshot,
    score,
    matchedHints,
  };
}

function formatCandidateSummary(candidate: CandidateSummary): string {
  const parts = [
    `#${candidate.index + 1}`,
    `${candidate.score} 分`,
    candidate.visible ? "可见" : "不可见",
  ];

  if (candidate.scopeText) {
    parts.push(`scope=${truncateText(candidate.scopeText)}`);
  }
  if (candidate.labelText) {
    parts.push(`label=${truncateText(candidate.labelText)}`);
  }
  if (candidate.placeholder) {
    parts.push(`placeholder=${truncateText(candidate.placeholder)}`);
  }
  if (candidate.textSample) {
    parts.push(`text=${truncateText(candidate.textSample)}`);
  }
  if (candidate.matchedHints.length > 0) {
    parts.push(`命中 ${candidate.matchedHints.join("/")}`);
  }

  return parts.join("，");
}

async function resolveCandidateLocator(
  locator: Locator,
  target: Target,
  matchedCount: number,
  desiredState: TargetWaitState,
): Promise<CandidateResolution> {
  const candidateSnapshots = await Promise.all(
    Array.from({ length: matchedCount }, (_, index) =>
      collectCandidateSnapshot(locator, index, target.hints?.scopeKind),
    ),
  );
  const candidateSummaries = candidateSnapshots.map((snapshot) =>
    buildCandidateSummary(snapshot, target.hints),
  );

  const candidatePool =
    desiredState === "visible"
      ? candidateSummaries.filter((candidate) => candidate.visible)
      : candidateSummaries;
  if (candidatePool.length === 1) {
    const selectedIndex = candidatePool[0]!.index;
    return {
      status: "selected",
      locator: locator.nth(selectedIndex),
      selectedIndex,
      candidateSummaries,
    };
  }

  const rankedCandidates = [...candidatePool].sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }
    return left.index - right.index;
  });
  const bestCandidate = rankedCandidates[0];

  if (!bestCandidate) {
    return {
      status: "ambiguous",
      reason: "没有可用于消解的候选元素",
      candidateSummaries,
    };
  }

  const tiedTopCandidates = rankedCandidates.filter(
    (candidate) => candidate.score === bestCandidate.score,
  );
  if (bestCandidate.score < MIN_DISAMBIGUATION_SCORE) {
    return {
      status: "ambiguous",
      reason: `最高分 ${bestCandidate.score} 过低，无法唯一确定候选`,
      candidateSummaries,
    };
  }

  if (tiedTopCandidates.length > 1) {
    return {
      status: "ambiguous",
      reason: `最高分 ${bestCandidate.score} 并列，无法唯一确定候选`,
      candidateSummaries,
    };
  }

  return {
    status: "selected",
    locator: locator.nth(bestCandidate.index),
    selectedIndex: bestCandidate.index,
    candidateSummaries,
  };
}

async function buildTargetDiagnosticError(
  page: Page,
  target: Target,
  attempts: StrategyAttempt[],
  prefix: string,
  cause?: unknown,
): Promise<FlowWeaveError> {
  const title = await page.title().catch(() => "未知标题");
  const attemptSummary = attempts
    .map((attempt) => {
      const metrics = [`匹配 ${attempt.matchedCount} 个`];
      if (attempt.visibleCount !== undefined) {
        metrics.push(`可见 ${attempt.visibleCount} 个`);
      }
      if (attempt.selectedIndex !== undefined) {
        metrics.push(`选中候选 #${attempt.selectedIndex + 1}`);
      }
      if (attempt.ambiguityReason) {
        metrics.push(`歧义：${attempt.ambiguityReason}`);
      }
      if (attempt.candidateSummaries?.length) {
        metrics.push(
          `候选：${attempt.candidateSummaries
            .slice(0, 3)
            .map((candidate) => formatCandidateSummary(candidate))
            .join("；")}`,
        );
      }
      if (attempt.error) {
        metrics.push(`错误：${attempt.error}`);
      }
      if (attempt.success) {
        metrics.push("已命中");
      }
      return `${attempt.label}（${metrics.join("，")}）`;
    })
    .join("；");
  const hintSummary = formatTargetHints(target);
  const messageParts = [
    `${prefix}。`,
    `当前页面：${page.url()}（${title}）。`,
    `策略诊断：${attemptSummary || "无可用策略"}。`,
  ];
  if (hintSummary) {
    messageParts.push(`Target 提示：${hintSummary}。`);
  }

  return new FlowWeaveError(
    "RUNTIME_STEP_FAILED",
    messageParts.join(" "),
    {
      url: page.url(),
      title,
      strategyAttempts: attempts,
      targetHints: target.hints,
      cause: formatUnknownError(cause),
    } satisfies TargetDiagnosticContext,
  );
}

function getTargetDiagnosticContext(error: unknown): TargetDiagnosticContext | null {
  if (!(error instanceof FlowWeaveError) || !error.details || typeof error.details !== "object") {
    return null;
  }

  const details = error.details as Partial<TargetDiagnosticContext>;
  if (
    typeof details.url !== "string" ||
    typeof details.title !== "string" ||
    !Array.isArray(details.strategyAttempts)
  ) {
    return null;
  }

  return {
    url: details.url,
    title: details.title,
    strategyAttempts: details.strategyAttempts,
    targetHints: details.targetHints,
    cause: typeof details.cause === "string" ? details.cause : undefined,
  };
}

function strategyToLocator(page: Page, strategy: LocatorStrategy): Locator {
  switch (strategy.kind) {
    case "css":
      return page.locator(strategy.selector);
    case "testId":
      return page.getByTestId(strategy.testId);
    case "role":
      return page.getByRole(strategy.role as Parameters<Page["getByRole"]>[0], {
        name: strategy.name,
      });
    case "xpath":
      return page.locator(`xpath=${strategy.expression}`);
    case "text":
      return page.getByText(strategy.text, { exact: strategy.exact ?? false });
    default: {
      const _exhaustive: never = strategy;
      return _exhaustive;
    }
  }
}

async function waitForPageSettled(page: Page, timeoutMs = 12_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  const remaining = () => Math.max(0, deadline - Date.now());

  const loadingMask = page.locator(
    ".el-loading-mask, .el-loading-parent--relative .el-loading-mask, [class*='loading-mask']",
  );
  if ((await loadingMask.count()) > 0) {
    await loadingMask
      .first()
      .waitFor({ state: "hidden", timeout: remaining() })
      .catch(() => undefined);
  }

  await page
    .waitForFunction(
      () => !document.querySelector("[aria-busy='true'], [data-loading='true']"),
      undefined,
      { timeout: Math.min(remaining(), 8_000) },
    )
    .catch(() => undefined);

  await page
    .waitForLoadState("networkidle", { timeout: Math.min(remaining(), 8_000) })
    .catch(() => undefined);
}

async function isSuggestLikeTarget(locator: Locator): Promise<boolean> {
  return locator
    .evaluate((node) => {
      const role = node.getAttribute("role")?.trim().toLowerCase();
      const autocomplete = node.getAttribute("aria-autocomplete")?.trim().toLowerCase();
      const controls = node.getAttribute("aria-controls")?.trim();
      return (
        role === "combobox" ||
        autocomplete === "list" ||
        autocomplete === "both" ||
        (!!controls && autocomplete !== "none")
      );
    })
    .catch(() => false);
}

async function waitForSuggestTargetReady(
  page: Page,
  locator: Locator,
  timeoutMs = SUGGEST_READY_TIMEOUT_MS,
): Promise<void> {
  if (!(await isSuggestLikeTarget(locator))) {
    return;
  }

  const inputHandle = await locator.elementHandle().catch(() => null);
  if (!inputHandle) {
    return;
  }

  await page
    .waitForFunction(
      (input) => {
        if (!(input instanceof HTMLElement)) {
          return true;
        }

        const isVisible = (element: Element | null): boolean => {
          if (!(element instanceof HTMLElement) || element.hidden) {
            return false;
          }

          const style = window.getComputedStyle(element);
          if (style.display === "none" || style.visibility === "hidden") {
            return false;
          }

          return element.getClientRects().length > 0;
        };

        const controlsId = input.getAttribute("aria-controls");
        const popup = controlsId ? document.getElementById(controlsId) : null;
        const busyTarget = input.closest("[aria-busy='true'], [data-loading='true']");
        const busyPopup = popup?.closest("[aria-busy='true'], [data-loading='true']");
        if (busyTarget || busyPopup) {
          return false;
        }

        const visibleOptions = popup
          ? Array.from(popup.querySelectorAll("[role='option'], option, li, button")).filter((option) =>
              isVisible(option),
            )
          : [];
        if (visibleOptions.length > 0) {
          return true;
        }

        return input.getAttribute("aria-expanded") === "true" && isVisible(popup);
      },
      inputHandle,
      { timeout: timeoutMs },
    )
    .catch(() => undefined);

  await inputHandle.dispose().catch(() => undefined);
}

async function waitForActiveSuggestionOption(
  page: Page,
  locator: Locator,
  timeoutMs = SUGGEST_READY_TIMEOUT_MS,
): Promise<boolean> {
  if (!(await isSuggestLikeTarget(locator))) {
    return false;
  }

  const inputHandle = await locator.elementHandle().catch(() => null);
  if (!inputHandle) {
    return false;
  }

  const result = await page
    .waitForFunction(
      (input) => {
        if (!(input instanceof HTMLElement)) {
          return true;
        }

        const isVisible = (element: Element | null): boolean => {
          if (!(element instanceof HTMLElement) || element.hidden) {
            return false;
          }

          const style = window.getComputedStyle(element);
          if (style.display === "none" || style.visibility === "hidden") {
            return false;
          }

          return element.getClientRects().length > 0;
        };

        const activeDescendantId = input.getAttribute("aria-activedescendant");
        if (activeDescendantId) {
          const activeDescendant = document.getElementById(activeDescendantId);
          if (isVisible(activeDescendant)) {
            return true;
          }
        }

        const controlsId = input.getAttribute("aria-controls");
        const popup = controlsId ? document.getElementById(controlsId) : null;
        const activeOption = popup?.querySelector(
          "[data-active='true'], [aria-selected='true'], .is-active, .active",
        );
        return isVisible(activeOption ?? null);
      },
      inputHandle,
      { timeout: timeoutMs },
    )
    .then(() => true)
    .catch(() => false);

  await inputHandle.dispose().catch(() => undefined);
  return result;
}

async function waitForNavigationPressSettled(
  page: Page,
  locator: Locator,
  key: string,
  timeoutMs = SUGGEST_READY_TIMEOUT_MS,
): Promise<void> {
  if (!NAVIGATION_PRESS_KEYS.has(key) || !(await isSuggestLikeTarget(locator))) {
    return;
  }

  if (await waitForActiveSuggestionOption(page, locator, Math.min(timeoutMs, 400))) {
    return;
  }

  await waitForSuggestTargetReady(page, locator, Math.min(timeoutMs, SUGGEST_READY_TIMEOUT_MS));
  await locator.press(key).catch(() => undefined);
  await waitForActiveSuggestionOption(page, locator, Math.min(timeoutMs, SUGGEST_READY_TIMEOUT_MS));
}

async function resolveTarget(
  page: Page,
  target: Target,
  timeoutMs = 12_000,
  desiredState: TargetWaitState = "visible",
): Promise<Locator> {
  const attempts: StrategyAttempt[] = [];
  let lastError: unknown;
  const perStrategyTimeout = Math.max(
    2_000,
    Math.floor(timeoutMs / Math.max(target.strategies.length, 1)),
  );

  for (const strategy of target.strategies) {
    const label = formatStrategyLabel(strategy);
    const locator = strategyToLocator(page, strategy);
    const first = locator.first();
    let resolvedLocator = first;
    const attempt: StrategyAttempt = {
      label,
      matchedCount: await locator.count().catch(() => 0),
      success: false,
    };
    if (desiredState === "visible" || attempt.matchedCount > 0) {
      attempt.visibleCount = await countVisible(locator, attempt.matchedCount).catch(() => 0);
    }

    try {
      if (attempt.matchedCount > 1) {
        const resolution = await resolveCandidateLocator(
          locator,
          target,
          attempt.matchedCount,
          desiredState,
        );
        attempt.candidateSummaries = resolution.candidateSummaries;
        if (resolution.status === "ambiguous") {
          attempt.ambiguityReason = resolution.reason;
          attempt.error = resolution.reason;
          attempts.push(attempt);
          lastError = new Error(resolution.reason);
          continue;
        }
        attempt.selectedIndex = resolution.selectedIndex;
        resolvedLocator = resolution.locator;
      }

      await resolvedLocator.waitFor({ state: desiredState, timeout: perStrategyTimeout });
      attempt.success = true;
      attempt.matchedCount = await locator.count().catch(() => attempt.matchedCount);
      attempt.visibleCount = await countVisible(locator, attempt.matchedCount).catch(
        () => attempt.visibleCount ?? 0,
      );
      attempts.push(attempt);
      return resolvedLocator;
    } catch (error) {
      attempt.error = formatUnknownError(error);
      attempts.push(attempt);
      lastError = error;
    }
  }

  throw await buildTargetDiagnosticError(
    page,
    target,
    attempts,
    "无法根据 Target 策略定位元素",
    lastError,
  );
}

async function waitForTargetState(
  page: Page,
  target: Target,
  state: TargetWaitState,
  timeoutMs = 12_000,
): Promise<void> {
  const attempts: StrategyAttempt[] = [];
  let lastError: unknown;
  const perStrategyTimeout = Math.max(
    2_000,
    Math.floor(timeoutMs / Math.max(target.strategies.length, 1)),
  );

  for (const strategy of target.strategies) {
    const label = formatStrategyLabel(strategy);
    const locator = strategyToLocator(page, strategy);
    const first = locator.first();
    let resolvedLocator = first;
    const attempt: StrategyAttempt = {
      label,
      matchedCount: await locator.count().catch(() => 0),
      success: false,
    };

    try {
      if ((state === "hidden" || state === "detached") && attempt.matchedCount === 0) {
        await first.waitFor({
          state: "attached",
          timeout: Math.min(perStrategyTimeout, 2_000),
        });
        attempt.matchedCount = await locator.count().catch(() => attempt.matchedCount);
      }

      if (attempt.matchedCount > 1) {
        const resolution = await resolveCandidateLocator(locator, target, attempt.matchedCount, state);
        attempt.candidateSummaries = resolution.candidateSummaries;
        if (resolution.status === "ambiguous") {
          attempt.ambiguityReason = resolution.reason;
          attempt.error = resolution.reason;
          attempts.push(attempt);
          lastError = new Error(resolution.reason);
          continue;
        }
        attempt.selectedIndex = resolution.selectedIndex;
        resolvedLocator = resolution.locator;
      }

      attempt.visibleCount = await countVisible(locator, attempt.matchedCount).catch(() => 0);
      await resolvedLocator.waitFor({ state, timeout: perStrategyTimeout });
      attempt.success = true;
      attempt.matchedCount = await locator.count().catch(() => attempt.matchedCount);
      attempt.visibleCount = await countVisible(locator, attempt.matchedCount).catch(
        () => attempt.visibleCount ?? 0,
      );
      attempts.push(attempt);
      return;
    } catch (error) {
      attempt.error = formatUnknownError(error);
      attempts.push(attempt);
      lastError = error;
    }
  }

  throw await buildTargetDiagnosticError(
    page,
    target,
    attempts,
    `等待目标状态 ${state} 失败`,
    lastError,
  );
}

async function captureStepScreenshot(
  page: Page,
  artifactDir: string,
  stepIndex: number,
): Promise<string> {
  const screenshotPath = join(artifactDir, `step-${stepIndex}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: false });
  return screenshotPath;
}

async function capturePageSummary(
  page: Page,
  artifactDir: string,
  stepIndex: number,
): Promise<RuntimePageSnapshot> {
  const raw = await page.evaluate(() => ({
    url: location.href,
    title: document.title,
    formCount: document.forms.length,
    buttonCount: document.querySelectorAll("button").length,
    linkCount: document.querySelectorAll("a").length,
  }));
  const summary = buildPageSnapshotSummary(raw);
  const filePath = join(artifactDir, `page-${stepIndex}.json`);
  writeFileSync(filePath, JSON.stringify(summary, null, 2), "utf-8");
  return { stepIndex, filePath, summary };
}

function writeStepDiagnostic(artifactDir: string, diagnostic: StepDiagnostic): string {
  const filePath = join(artifactDir, `step-${diagnostic.stepIndex}-diagnostic.json`);
  writeFileSync(filePath, JSON.stringify(diagnostic, null, 2), "utf-8");
  return filePath;
}

function buildTargetResolutionDiagnostic(
  step: NormalizedStep,
  stepIndex: number,
  message: string,
  error: unknown,
  diagnostic: TargetDiagnosticContext,
): TargetResolutionDiagnostic {
  return {
    kind: "target-resolution",
    stepId: step.id,
    stepIndex,
    stepType: step.type,
    message,
    errorCode: getErrorCode(error),
    cause: diagnostic.cause ?? getErrorCause(error),
    url: diagnostic.url,
    title: diagnostic.title,
    strategyAttempts: diagnostic.strategyAttempts,
    targetHints: diagnostic.targetHints,
  };
}

async function buildRuntimeErrorDiagnostic(
  page: Page,
  step: NormalizedStep,
  stepIndex: number,
  message: string,
  error: unknown,
): Promise<RuntimeErrorDiagnostic> {
  const pageMeta = await captureDiagnosticPageMeta(page);
  return {
    kind: "runtime-error",
    stepId: step.id,
    stepIndex,
    stepType: step.type,
    message,
    errorCode: getErrorCode(error),
    cause: getErrorCause(error),
    ...pageMeta,
  };
}

async function runStep(
  page: Page,
  step: NormalizedStep,
  stepIndex: number,
  options: ExecutionOptions,
  artifactDir?: string,
  pageSnapshots?: RuntimePageSnapshot[],
  timeoutMs = 30_000,
): Promise<StepLog> {
  const startedAt = nowIso();
  const startMs = Date.now();
  const resolvedStep = resolveStep(step, options);

  try {
    switch (resolvedStep.type) {
      case "navigate":
        await page.goto(resolvedStep.url, {
          waitUntil: resolvedStep.waitUntil ?? "load",
        });
        if (resolvedStep.url.includes("#")) {
          await page.waitForLoadState("domcontentloaded").catch(() => undefined);
          await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => undefined);
        }
        if (artifactDir && pageSnapshots) {
          pageSnapshots.push(await capturePageSummary(page, artifactDir, stepIndex));
        }
        break;
      case "click": {
        const locator = await resolveTarget(page, resolvedStep.target, timeoutMs);
        await locator.click({
          button: resolvedStep.button ?? "left",
        });
        await waitForPageSettled(page, Math.min(timeoutMs, 15_000));
        break;
      }
      case "fill": {
        const locator = await resolveTarget(page, resolvedStep.target, timeoutMs);
        if (resolvedStep.clear !== false) {
          await locator.clear();
        }
        await locator.fill(resolvedStep.value);
        await waitForSuggestTargetReady(page, locator, Math.min(timeoutMs, SUGGEST_READY_TIMEOUT_MS));
        break;
      }
      case "select": {
        const locator = await resolveTarget(page, resolvedStep.target, timeoutMs);
        await locator.selectOption(resolvedStep.values);
        await waitForPageSettled(page, Math.min(timeoutMs, 8_000));
        break;
      }
      case "setChecked": {
        const locator = await resolveTarget(page, resolvedStep.target, timeoutMs);
        await locator.setChecked(resolvedStep.checked);
        await waitForPageSettled(page, Math.min(timeoutMs, 8_000));
        break;
      }
      case "press": {
        if (resolvedStep.target) {
          const locator = await resolveTarget(page, resolvedStep.target, timeoutMs);
          await locator.press(resolvedStep.key);
          await waitForNavigationPressSettled(
            page,
            locator,
            resolvedStep.key,
            Math.min(timeoutMs, SUGGEST_READY_TIMEOUT_MS),
          );
        } else {
          await page.keyboard.press(resolvedStep.key);
        }
        await waitForPageSettled(page, Math.min(timeoutMs, 8_000));
        break;
      }
      case "upload": {
        const locator = await resolveTarget(page, resolvedStep.target, timeoutMs, "attached");
        await locator.setInputFiles(resolvedStep.files);
        await waitForPageSettled(page, Math.min(timeoutMs, 8_000));
        break;
      }
      case "wait":
        if (resolvedStep.ms != null) {
          await page.waitForTimeout(resolvedStep.ms);
        } else if (resolvedStep.condition === "networkidle") {
          await page.waitForLoadState("networkidle");
        } else if (resolvedStep.condition === "urlIncludes") {
          await page.waitForURL(
            (url) => url.toString().includes(resolvedStep.urlIncludes ?? ""),
            { timeout: Math.min(timeoutMs, 15_000) },
          );
        } else if (
          resolvedStep.condition === "visible" ||
          resolvedStep.condition === "hidden" ||
          resolvedStep.condition === "attached" ||
          resolvedStep.condition === "detached"
        ) {
          if (!resolvedStep.target) {
            throw new FlowWeaveError(
              "RUNTIME_STEP_FAILED",
              `wait 步骤 condition=${resolvedStep.condition} 缺少 target`,
            );
          }
          await waitForTargetState(
            page,
            resolvedStep.target,
            resolvedStep.condition,
            Math.min(timeoutMs, 15_000),
          );
        } else {
          await page.waitForTimeout(500);
        }
        break;
      default: {
        const unsupported = resolvedStep as { type: string };
        throw new FlowWeaveError(
          "RUNTIME_STEP_FAILED",
          `不支持的步骤类型: ${unsupported.type}`,
        );
      }
    }

    const endedAt = nowIso();
    const screenshotPath = artifactDir
      ? await captureStepScreenshot(page, artifactDir, stepIndex)
      : undefined;
    return {
      stepIndex,
      stepId: resolvedStep.id,
      type: resolvedStep.type,
      status: "success",
      startedAt,
      endedAt,
      durationMs: Date.now() - startMs,
      screenshotPath,
    };
  } catch (error) {
    const endedAt = nowIso();
    const message =
      error instanceof FlowWeaveError
        ? error.message
        : error instanceof Error
          ? error.message
          : String(error);
    let screenshotPath: string | undefined;
    let diagnosticPath: string | undefined;
    if (artifactDir) {
      try {
        screenshotPath = await captureStepScreenshot(page, artifactDir, stepIndex);
      } catch {
        screenshotPath = undefined;
      }
      try {
        if (pageSnapshots) {
          pageSnapshots.push(await capturePageSummary(page, artifactDir, stepIndex));
        }
      } catch {
        // 页面已失效时允许跳过失败页摘要
      }
      try {
        const targetDiagnostic = getTargetDiagnosticContext(error);
        const diagnostic = targetDiagnostic
          ? buildTargetResolutionDiagnostic(
              resolvedStep,
              stepIndex,
              message,
              error,
              targetDiagnostic,
            )
          : await buildRuntimeErrorDiagnostic(page, resolvedStep, stepIndex, message, error);
        diagnosticPath = writeStepDiagnostic(artifactDir, diagnostic);
      } catch {
        diagnosticPath = undefined;
      }
    }
    return {
      stepIndex,
      stepId: resolvedStep.id,
      type: resolvedStep.type,
      status: "failed",
      startedAt,
      endedAt,
      durationMs: Date.now() - startMs,
      message,
      screenshotPath,
      diagnosticPath,
    };
  }
}

/** 使用 Playwright 执行 Flow 文档中的步骤 */
export async function executeFlow(
  flow: FlowDocument,
  options: ExecutionOptions = {},
): Promise<ExecutionResult> {
  const headless = options.headless ?? true;
  const timeoutMs = options.timeoutMs ?? 30_000;
  const executionId = options.executionId ?? crypto.randomUUID();
  const artifactDir = options.artifactDir;
  if (artifactDir) {
    mkdirSync(artifactDir, { recursive: true });
  }
  const stepLogs: StepLog[] = [];
  const pageSnapshots: RuntimePageSnapshot[] = [];
  const recordHar = artifactDir ? (options.recordHar ?? true) : false;
  const harPath = artifactDir && recordHar ? join(artifactDir, "network.har") : undefined;

  const browser = await chromium.launch({ headless });
  try {
    const context = await browser.newContext({
      ...(harPath ? { recordHar: { path: harPath, mode: "minimal" as const } } : {}),
      ...(options.storageStatePath ? { storageState: options.storageStatePath } : {}),
    });
    const page = await context.newPage();
    page.setDefaultTimeout(timeoutMs);

    for (let stepIndex = 0; stepIndex < flow.steps.length; stepIndex++) {
      const step = flow.steps[stepIndex];
      if (!step) {
        continue;
      }
      const log = await runStep(
        page,
        step,
        stepIndex,
        options,
        artifactDir,
        pageSnapshots,
        timeoutMs,
      );
      stepLogs.push(log);
      if (log.status === "failed") {
        await context.close();
        return {
          executionId,
          status: "failed",
          steps: stepLogs,
          harPath,
          pageSnapshots,
          error: { message: log.message ?? "步骤执行失败", stepIndex },
        };
      }
    }

    await context.close();
    return {
      executionId,
      status: "success",
      steps: stepLogs,
      harPath,
      pageSnapshots,
    };
  } finally {
    await browser.close();
  }
}
