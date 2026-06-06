import type { RecordedEvent, RecorderSessionMeta } from "@flowweave/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MSG_EXPORT_FLOW,
  MSG_RECORD_EVENT,
  MSG_SYNC_KNOWLEDGE,
  type ExtensionMessage,
  type ExportFlowResponse,
  type SyncKnowledgeResponse,
} from "./messages.js";

type StoredSession = {
  meta: RecorderSessionMeta;
  events: RecordedEvent[];
};

type BackgroundHandlerDeps = {
  loadSession?: () => Promise<StoredSession>;
  saveSession?: (session: StoredSession) => Promise<void>;
  parseRecordedEvent?: (event: RecordedEvent) => RecordedEvent;
  buildFlowFromEvents?: (events: RecordedEvent[], meta: Record<string, unknown>) => unknown;
  saveFlowToKnowledge?: (
    apiBase: string,
    projectId: string,
    flow: unknown,
    changeMessage?: string,
  ) => Promise<{ flowId: string; name: string; projectId: string }>;
  getStoredApiBase?: () => Promise<string | undefined>;
  defaultKnowledgeApiBase?: string;
};

type BackgroundModule = {
  createBackgroundMessageHandler?: (
    deps?: BackgroundHandlerDeps,
  ) => (message: ExtensionMessage) => Promise<unknown>;
};

type RuntimeMessageListener = (
  message: ExtensionMessage,
  sender: unknown,
  sendResponse: (response?: unknown) => void,
) => boolean;

async function loadBackgroundModule(): Promise<BackgroundModule> {
  vi.resetModules();
  vi.stubGlobal("defineBackground", (callback: () => void) => callback());
  vi.stubGlobal("browser", {
    sidePanel: {
      setPanelBehavior: vi.fn().mockResolvedValue(undefined),
    },
    runtime: {
      onMessage: {
        addListener: vi.fn(),
      },
    },
  });
  return (await import("../entrypoints/background.js")) as BackgroundModule;
}

async function loadBackgroundModuleWithRegisteredListener(browserStub: Record<string, unknown>): Promise<{
  listener: RuntimeMessageListener;
}> {
  vi.resetModules();
  vi.stubGlobal("defineBackground", (callback: () => void) => callback());
  const addListener = vi.fn();
  vi.stubGlobal("browser", {
    sidePanel: {
      setPanelBehavior: vi.fn().mockResolvedValue(undefined),
    },
    runtime: {
      onMessage: {
        addListener,
      },
    },
    ...browserStub,
  });
  await import("../entrypoints/background.js");
  expect(addListener).toHaveBeenCalledTimes(1);
  const listener = addListener.mock.calls[0]?.[0] as RuntimeMessageListener | undefined;
  expect(listener).toBeTypeOf("function");
  return { listener: listener as RuntimeMessageListener };
}

function createSession(overrides?: {
  meta?: Partial<RecorderSessionMeta>;
  events?: RecordedEvent[];
}): StoredSession {
  return {
    meta: {
      sessionId: "session-12345678",
      projectId: "project-source",
      startedAt: "2026-06-07T12:00:00.000Z",
      ...(overrides?.meta ?? {}),
    },
    events: overrides?.events ?? [],
  };
}

describe("background extension contract", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("记录事件消息会解析事件并返回最新 eventCount", async () => {
    const backgroundModule = await loadBackgroundModule();

    expect(backgroundModule.createBackgroundMessageHandler).toBeTypeOf("function");

    const parsedEvent: RecordedEvent = {
      id: "evt-normalized",
      type: "click",
      timestamp: 1710000000000,
      url: "https://example.com/list",
      payload: {
        selector: "#submit",
      },
    };
    const rawEvent: RecordedEvent = {
      id: "evt-raw",
      type: "click",
      timestamp: 1710000000000,
      url: "https://example.com/list",
      payload: {
        selector: "#submit",
      },
    };
    const session = createSession();
    const loadSession = vi.fn().mockResolvedValue(session);
    const saveSession = vi.fn().mockResolvedValue(undefined);
    const parseRecordedEvent = vi.fn().mockReturnValue(parsedEvent);

    const handleMessage = backgroundModule.createBackgroundMessageHandler?.({
      loadSession,
      saveSession,
      parseRecordedEvent,
    });

    const response = await handleMessage?.({
      type: MSG_RECORD_EVENT,
      event: rawEvent,
    });

    expect(parseRecordedEvent).toHaveBeenCalledWith(rawEvent);
    expect(saveSession).toHaveBeenCalledWith({
      ...session,
      events: [parsedEvent],
    });
    expect(response).toEqual({ ok: true, eventCount: 1 });
  });

  it("导出流程消息会返回序列化 JSON 与文件名合同", async () => {
    const backgroundModule = await loadBackgroundModule();

    expect(backgroundModule.createBackgroundMessageHandler).toBeTypeOf("function");

    const session = createSession({
      events: [
        {
          id: "evt-1",
          type: "navigate",
          timestamp: 1710000000000,
          url: "https://example.com/list",
          payload: {
            url: "https://example.com/list",
          },
        },
      ],
    });
    const flow = {
      id: "flow-session-12345678",
      name: "录制流程",
      steps: [{ type: "navigate" }],
    };
    const buildFlowFromEvents = vi.fn().mockReturnValue(flow);

    const handleMessage = backgroundModule.createBackgroundMessageHandler?.({
      loadSession: vi.fn().mockResolvedValue(session),
      buildFlowFromEvents,
    });

    const response = (await handleMessage?.({
      type: MSG_EXPORT_FLOW,
    })) as ExportFlowResponse;

    expect(buildFlowFromEvents).toHaveBeenCalledWith(session.events, {
      ...session.meta,
      flowId: `flow-${session.meta.sessionId}`,
      name: "录制流程",
    });
    expect(response).toEqual({
      ok: true,
      json: JSON.stringify(flow, null, 2),
      filename: "flow-session-.json",
    });
  });

  it("同步知识库消息会使用目标 projectId 构建并返回保存结果", async () => {
    const backgroundModule = await loadBackgroundModule();

    expect(backgroundModule.createBackgroundMessageHandler).toBeTypeOf("function");

    const session = createSession({
      meta: {
        projectId: "project-source",
      },
      events: [
        {
          id: "evt-1",
          type: "fill",
          timestamp: 1710000000000,
          url: "https://example.com/form",
          payload: {
            selector: "#name",
            value: "FlowWeave",
          },
        },
      ],
    });
    const flow = {
      id: "flow-session-12345678",
      name: "录制流程",
      steps: [{ type: "fill" }],
    };
    const buildFlowFromEvents = vi.fn().mockReturnValue(flow);
    const saveFlowToKnowledge = vi.fn().mockResolvedValue({
      flowId: "flow-0001",
      name: "录制流程",
      projectId: "project-target",
    });
    const getStoredApiBase = vi.fn().mockResolvedValue("http://127.0.0.1:4010");

    const handleMessage = backgroundModule.createBackgroundMessageHandler?.({
      loadSession: vi.fn().mockResolvedValue(session),
      buildFlowFromEvents,
      saveFlowToKnowledge,
      getStoredApiBase,
      defaultKnowledgeApiBase: "http://127.0.0.1:3847",
    });

    const response = (await handleMessage?.({
      type: MSG_SYNC_KNOWLEDGE,
      projectId: "project-target",
      changeMessage: "扩展侧栏同步",
    })) as SyncKnowledgeResponse;

    expect(buildFlowFromEvents).toHaveBeenCalledWith(session.events, {
      ...session.meta,
      projectId: "project-target",
      flowId: `flow-${session.meta.sessionId}`,
      name: "录制流程",
    });
    expect(saveFlowToKnowledge).toHaveBeenCalledWith(
      "http://127.0.0.1:4010",
      "project-target",
      flow,
      "扩展侧栏同步",
    );
    expect(response).toEqual({
      ok: true,
      flowId: "flow-0001",
      name: "录制流程",
      projectId: "project-target",
    });
  });

  it("同步知识库消息优先使用 message.apiBase，而不是存储中的 API 地址", async () => {
    const backgroundModule = await loadBackgroundModule();

    expect(backgroundModule.createBackgroundMessageHandler).toBeTypeOf("function");

    const session = createSession({
      events: [
        {
          id: "evt-1",
          type: "fill",
          timestamp: 1710000000000,
          url: "https://example.com/form",
          payload: {
            selector: "#name",
            value: "FlowWeave",
          },
        },
      ],
    });
    const flow = {
      id: "flow-session-12345678",
      name: "录制流程",
      steps: [{ type: "fill" }],
    };
    const getStoredApiBase = vi.fn().mockResolvedValue("http://127.0.0.1:4010");
    const saveFlowToKnowledge = vi.fn().mockResolvedValue({
      flowId: "flow-0002",
      name: "录制流程",
      projectId: "project-target",
    });

    const handleMessage = backgroundModule.createBackgroundMessageHandler?.({
      loadSession: vi.fn().mockResolvedValue(session),
      buildFlowFromEvents: vi.fn().mockReturnValue(flow),
      saveFlowToKnowledge,
      getStoredApiBase,
      defaultKnowledgeApiBase: "http://127.0.0.1:3847",
    });

    await handleMessage?.({
      type: MSG_SYNC_KNOWLEDGE,
      projectId: "project-target",
      apiBase: "http://127.0.0.1:9999",
      changeMessage: "扩展侧栏同步",
    });

    expect(getStoredApiBase).not.toHaveBeenCalled();
    expect(saveFlowToKnowledge).toHaveBeenCalledWith(
      "http://127.0.0.1:9999",
      "project-target",
      flow,
      "扩展侧栏同步",
    );
  });

  it("同步知识库消息在存储中没有 API 地址时回退默认值", async () => {
    const backgroundModule = await loadBackgroundModule();

    expect(backgroundModule.createBackgroundMessageHandler).toBeTypeOf("function");

    const session = createSession({
      events: [
        {
          id: "evt-1",
          type: "fill",
          timestamp: 1710000000000,
          url: "https://example.com/form",
          payload: {
            selector: "#name",
            value: "FlowWeave",
          },
        },
      ],
    });
    const flow = {
      id: "flow-session-12345678",
      name: "录制流程",
      steps: [{ type: "fill" }],
    };
    const getStoredApiBase = vi.fn().mockResolvedValue(undefined);
    const saveFlowToKnowledge = vi.fn().mockResolvedValue({
      flowId: "flow-0003",
      name: "录制流程",
      projectId: "project-target",
    });

    const handleMessage = backgroundModule.createBackgroundMessageHandler?.({
      loadSession: vi.fn().mockResolvedValue(session),
      buildFlowFromEvents: vi.fn().mockReturnValue(flow),
      saveFlowToKnowledge,
      getStoredApiBase,
      defaultKnowledgeApiBase: "http://127.0.0.1:3847",
    });

    await handleMessage?.({
      type: MSG_SYNC_KNOWLEDGE,
      projectId: "project-target",
      changeMessage: "扩展侧栏同步",
    });

    expect(getStoredApiBase).toHaveBeenCalledTimes(1);
    expect(saveFlowToKnowledge).toHaveBeenCalledWith(
      "http://127.0.0.1:3847",
      "project-target",
      flow,
      "扩展侧栏同步",
    );
  });

  it("同步知识库消息在会话为空时返回稳定错误", async () => {
    const backgroundModule = await loadBackgroundModule();

    expect(backgroundModule.createBackgroundMessageHandler).toBeTypeOf("function");

    const saveFlowToKnowledge = vi.fn();
    const handleMessage = backgroundModule.createBackgroundMessageHandler?.({
      loadSession: vi.fn().mockResolvedValue(createSession()),
      saveFlowToKnowledge,
    });

    const response = (await handleMessage?.({
      type: MSG_SYNC_KNOWLEDGE,
      projectId: "project-target",
    })) as SyncKnowledgeResponse;

    expect(response).toEqual({
      ok: false,
      error: "暂无录制事件",
    });
    expect(saveFlowToKnowledge).not.toHaveBeenCalled();
  });

  it("background listener 会保持消息通道开启，并把 reject 包装成错误响应", async () => {
    const { listener } = await loadBackgroundModuleWithRegisteredListener({
      storage: {
        session: {
          get: vi.fn().mockRejectedValue(new Error("读取会话失败")),
          set: vi.fn().mockResolvedValue(undefined),
        },
        local: {
          get: vi.fn().mockResolvedValue({}),
          set: vi.fn().mockResolvedValue(undefined),
        },
      },
    });

    let resolveResponse: ((response: unknown) => void) | undefined;
    const responsePromise = new Promise<unknown>((resolve) => {
      resolveResponse = resolve;
    });
    const sendResponse = vi.fn((response?: unknown) => {
      resolveResponse?.(response);
    });

    const keepChannelOpen = listener(
      { type: MSG_EXPORT_FLOW },
      {},
      sendResponse,
    );

    expect(keepChannelOpen).toBe(true);
    await expect(responsePromise).resolves.toEqual({
      ok: false,
      error: "读取会话失败",
    });
  });
});
