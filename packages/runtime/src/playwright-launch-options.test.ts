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

describe("executeFlow launch options", () => {
  afterEach(() => {
    launchMock.mockReset();
    launchPersistentContextMock.mockReset();
    newContextMock.mockReset();
    newPageMock.mockReset();
    setDefaultTimeoutMock.mockReset();
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
});
