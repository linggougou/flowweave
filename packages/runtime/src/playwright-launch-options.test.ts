import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FLOW_SCHEMA_VERSION } from "@flowweave/shared";
import type { FlowDocument } from "@flowweave/flow-dsl";

const launchMock = vi.fn();
const launchPersistentContextMock = vi.fn();
const newContextMock = vi.fn();
const newPageMock = vi.fn();
const setDefaultTimeoutMock = vi.fn();
const waitForTimeoutMock = vi.fn();
const closeContextMock = vi.fn();
const closeBrowserMock = vi.fn();
let capturedPreferences = "";

vi.mock("playwright", () => ({
  chromium: {
    launch: launchMock,
    launchPersistentContext: launchPersistentContextMock,
  },
}));

const { executeFlow } = await import("./playwright-runner.js");

function buildEmptyFlow(): FlowDocument {
  return {
    schemaVersion: FLOW_SCHEMA_VERSION,
    id: "flow_empty",
    projectId: "proj_test",
    name: "空流程",
    variables: [],
    steps: [],
    meta: {
      createdAt: "2026-06-09T00:00:00.000Z",
      updatedAt: "2026-06-09T00:00:00.000Z",
      source: "manual",
    },
  };
}

function buildWaitFlow(): FlowDocument {
  return {
    ...buildEmptyFlow(),
    id: "flow_wait",
    name: "等待流程",
    steps: [{ id: "s1", type: "wait", ms: 20 }],
  };
}

describe("executeFlow launch options", () => {
  afterEach(() => {
    launchMock.mockReset();
    launchPersistentContextMock.mockReset();
    newContextMock.mockReset();
    newPageMock.mockReset();
    setDefaultTimeoutMock.mockReset();
    waitForTimeoutMock.mockReset();
    closeContextMock.mockReset();
    closeBrowserMock.mockReset();
    capturedPreferences = "";
  });

  it("headed 模式会用禁用翻译的临时浏览器 profile", async () => {
    newPageMock.mockResolvedValue({
      setDefaultTimeout: setDefaultTimeoutMock,
    });
    launchPersistentContextMock.mockImplementation(async (userDataDir: string) => {
      capturedPreferences = readFileSync(join(userDataDir, "Default/Preferences"), "utf-8");
      return {
        pages: () => [],
        newPage: newPageMock,
        close: closeContextMock.mockResolvedValue(undefined),
      };
    });
    launchMock.mockResolvedValue({
      newContext: newContextMock,
      close: closeBrowserMock.mockResolvedValue(undefined),
    });

    await executeFlow(buildEmptyFlow(), { headless: false });

    expect(launchPersistentContextMock).toHaveBeenCalledOnce();
    expect(launchMock).not.toHaveBeenCalled();
    expect(launchPersistentContextMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headless: false,
        viewport: null,
      }),
    );
    expect(JSON.parse(capturedPreferences)).toMatchObject({
      translate: {
        enabled: false,
      },
      credentials_enable_service: false,
      profile: {
        password_manager_enabled: false,
        password_manager_leak_detection: false,
      },
    });
  });

  it("headless 模式继续走普通 launch", async () => {
    newContextMock.mockResolvedValue({
      newPage: newPageMock,
      close: closeContextMock.mockResolvedValue(undefined),
    });
    launchMock.mockResolvedValue({
      newContext: newContextMock,
      close: closeBrowserMock.mockResolvedValue(undefined),
    });
    newPageMock.mockResolvedValue({
      setDefaultTimeout: setDefaultTimeoutMock,
    });

    await executeFlow(buildEmptyFlow(), { headless: true });

    expect(launchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        headless: true,
      }),
    );
    expect(launchPersistentContextMock).not.toHaveBeenCalled();
  });

  it("按稳定顺序发送结构化进度且不泄露变量", async () => {
    newContextMock.mockResolvedValue({
      newPage: newPageMock,
      close: closeContextMock.mockResolvedValue(undefined),
    });
    launchMock.mockResolvedValue({
      newContext: newContextMock,
      close: closeBrowserMock.mockResolvedValue(undefined),
    });
    waitForTimeoutMock.mockResolvedValue(undefined);
    newPageMock.mockResolvedValue({
      setDefaultTimeout: setDefaultTimeoutMock,
      waitForTimeout: waitForTimeoutMock,
    });
    const events: unknown[] = [];

    const result = await executeFlow(buildWaitFlow(), {
      headless: true,
      executionId: "exec_progress",
      variables: { secret_password: "绝不能出现在进度里" },
      onProgress: (event) => events.push(event),
    });

    expect(result.status).toBe("success");
    expect(events.map((event) => (event as { type: string }).type)).toEqual([
      "started",
      "step-started",
      "step-finished",
      "completed",
    ]);
    expect(JSON.stringify(events)).not.toContain("绝不能出现在进度里");
    expect(events[1]).toMatchObject({
      executionId: "exec_progress",
      stepIndex: 0,
      stepId: "s1",
      stepType: "wait",
      totalSteps: 1,
      currentAction: "正在等待页面就绪",
    });
  });

  it("AbortSignal 会把执行标记为已取消并且浏览器资源只关闭一次", async () => {
    newContextMock.mockResolvedValue({
      newPage: newPageMock,
      close: closeContextMock.mockResolvedValue(undefined),
    });
    launchMock.mockResolvedValue({
      newContext: newContextMock,
      close: closeBrowserMock.mockResolvedValue(undefined),
    });
    waitForTimeoutMock.mockResolvedValue(undefined);
    newPageMock.mockResolvedValue({
      setDefaultTimeout: setDefaultTimeoutMock,
      waitForTimeout: waitForTimeoutMock,
    });
    const controller = new AbortController();
    const events: Array<{ type: string }> = [];

    const result = await executeFlow(buildWaitFlow(), {
      headless: true,
      executionId: "exec_cancel",
      signal: controller.signal,
      onProgress: (event) => {
        events.push(event);
        if (event.type === "step-started") {
          controller.abort();
        }
      },
    });

    expect(result.status).toBe("cancelled");
    expect(result.error).toBeUndefined();
    expect(result.steps[0]?.status).toBe("cancelled");
    expect(events.map((event) => event.type)).toEqual(["started", "step-started", "cancelled"]);
    expect(closeContextMock).toHaveBeenCalledOnce();
    expect(closeBrowserMock).toHaveBeenCalledOnce();
  });
});
