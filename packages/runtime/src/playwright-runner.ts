import type { FlowDocument, NormalizedStep, Target } from "@flowweave/flow-dsl";

type LocatorStrategy = Target["strategies"][number];
import { FlowWeaveError } from "@flowweave/shared";
import { chromium, type Locator, type Page } from "playwright";
import type { ExecutionOptions, ExecutionResult, StepLog } from "./types.js";

export type { ExecutionOptions };

function nowIso(): string {
  return new Date().toISOString();
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

async function resolveTarget(page: Page, target: Target): Promise<Locator> {
  let lastError: unknown;
  for (const strategy of target.strategies) {
    try {
      const locator = strategyToLocator(page, strategy);
      if ((await locator.count()) > 0) {
        return locator.first();
      }
    } catch (error) {
      lastError = error;
    }
  }
  throw new FlowWeaveError(
    "RUNTIME_STEP_FAILED",
    "无法根据 Target 策略定位元素",
    lastError,
  );
}

async function runStep(
  page: Page,
  step: NormalizedStep,
  stepIndex: number,
): Promise<StepLog> {
  const startedAt = nowIso();
  const startMs = Date.now();

  try {
    switch (step.type) {
      case "navigate":
        await page.goto(step.url, {
          waitUntil: step.waitUntil ?? "load",
        });
        break;
      case "click": {
        const locator = await resolveTarget(page, step.target);
        await locator.click({
          button: step.button ?? "left",
        });
        break;
      }
      case "fill": {
        const locator = await resolveTarget(page, step.target);
        if (step.clear !== false) {
          await locator.clear();
        }
        await locator.fill(step.value);
        break;
      }
      case "wait":
        if (step.ms != null) {
          await page.waitForTimeout(step.ms);
        } else if (step.condition === "networkidle") {
          await page.waitForLoadState("networkidle");
        } else if (step.condition === "visible") {
          throw new FlowWeaveError(
            "RUNTIME_STEP_FAILED",
            "wait 步骤 condition=visible 需配合 Target，P1 暂未实现",
          );
        } else {
          await page.waitForTimeout(500);
        }
        break;
      default: {
        const unsupported = step as { type: string };
        throw new FlowWeaveError(
          "RUNTIME_STEP_FAILED",
          `不支持的步骤类型: ${unsupported.type}`,
        );
      }
    }

    const endedAt = nowIso();
    return {
      stepIndex,
      stepId: step.id,
      type: step.type,
      status: "success",
      startedAt,
      endedAt,
      durationMs: Date.now() - startMs,
    };
  } catch (error) {
    const endedAt = nowIso();
    const message =
      error instanceof FlowWeaveError
        ? error.message
        : error instanceof Error
          ? error.message
          : String(error);
    return {
      stepIndex,
      stepId: step.id,
      type: step.type,
      status: "failed",
      startedAt,
      endedAt,
      durationMs: Date.now() - startMs,
      message,
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
  const executionId = crypto.randomUUID();
  const stepLogs: StepLog[] = [];

  const browser = await chromium.launch({ headless });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    page.setDefaultTimeout(timeoutMs);

    for (let stepIndex = 0; stepIndex < flow.steps.length; stepIndex++) {
      const step = flow.steps[stepIndex];
      if (!step) {
        continue;
      }
      const log = await runStep(page, step, stepIndex);
      stepLogs.push(log);
      if (log.status === "failed") {
        return {
          executionId,
          status: "failed",
          steps: stepLogs,
          error: { message: log.message ?? "步骤执行失败", stepIndex },
        };
      }
    }

    return {
      executionId,
      status: "success",
      steps: stepLogs,
    };
  } finally {
    await browser.close();
  }
}
