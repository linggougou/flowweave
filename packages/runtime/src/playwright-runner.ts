import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { FlowDocument, NormalizedStep, Target } from "@flowweave/flow-dsl";
import { buildPageSnapshotSummary } from "@flowweave/page-intelligence";
import { FlowWeaveError } from "@flowweave/shared";

type LocatorStrategy = Target["strategies"][number];
import { chromium, type Locator, type Page } from "playwright";
import type {
  ExecutionOptions,
  ExecutionResult,
  RuntimePageSnapshot,
  StepLog,
} from "./types.js";

export type { ExecutionOptions };

type TargetWaitState = "visible" | "hidden" | "attached" | "detached";

type StrategyAttempt = {
  label: string;
  matchedCount: number;
  visibleCount?: number;
  success: boolean;
  error?: string;
};

type TargetDiagnosticContext = {
  url: string;
  title: string;
  strategyAttempts: StrategyAttempt[];
  targetHints?: Target["hints"];
};

function nowIso(): string {
  return new Date().toISOString();
}

function formatUnknownError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function interpolateString(
  value: string,
  variables?: ExecutionOptions["variables"],
): string {
  if (!variables) {
    return value;
  }

  return value.replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (match, variableName: string) => {
    const resolved = variables[variableName];
    return resolved === undefined ? match : String(resolved);
  });
}

function interpolateStepValue<T>(value: T, variables?: ExecutionOptions["variables"]): T {
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
    } satisfies TargetDiagnosticContext & { cause: string },
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
    const attempt: StrategyAttempt = {
      label,
      matchedCount: await locator.count().catch(() => 0),
      success: false,
    };
    if (desiredState === "visible" || attempt.matchedCount > 0) {
      attempt.visibleCount = await countVisible(locator, attempt.matchedCount).catch(() => 0);
    }

    try {
      await first.waitFor({ state: desiredState, timeout: perStrategyTimeout });
      attempt.success = true;
      attempt.matchedCount = await locator.count().catch(() => attempt.matchedCount);
      attempt.visibleCount = await countVisible(locator, attempt.matchedCount).catch(
        () => attempt.visibleCount ?? 0,
      );
      attempts.push(attempt);
      return first;
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

      attempt.visibleCount = await countVisible(locator, attempt.matchedCount).catch(() => 0);
      await first.waitFor({ state, timeout: perStrategyTimeout });
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

function writeStepDiagnostic(
  artifactDir: string,
  step: NormalizedStep,
  stepIndex: number,
  diagnostic: TargetDiagnosticContext,
): string {
  const filePath = join(artifactDir, `step-${stepIndex}-diagnostic.json`);
  writeFileSync(
    filePath,
    JSON.stringify(
      {
        stepId: step.id,
        stepIndex,
        url: diagnostic.url,
        title: diagnostic.title,
        strategyAttempts: diagnostic.strategyAttempts,
        targetHints: diagnostic.targetHints,
      },
      null,
      2,
    ),
    "utf-8",
  );
  return filePath;
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
      const diagnostic = getTargetDiagnosticContext(error);
      if (diagnostic) {
        try {
          diagnosticPath = writeStepDiagnostic(artifactDir, resolvedStep, stepIndex, diagnostic);
        } catch {
          diagnosticPath = undefined;
        }
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
    const context = await browser.newContext(
      harPath ? { recordHar: { path: harPath, mode: "minimal" } } : undefined,
    );
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
