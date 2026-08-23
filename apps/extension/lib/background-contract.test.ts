import type { RecordedEvent, RecorderSessionMeta } from "@flowweave/shared";
import type { FlowDocument, PortableFlowDocumentResult } from "@flowweave/flow-dsl";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MSG_CLEAR_SESSION,
  MSG_COMPLETE_SESSION,
  MSG_EXPORT_FLOW,
  MSG_GET_SESSION,
  MSG_PAUSE_SESSION,
  MSG_RECORD_EVENT,
  MSG_RESTORE_CLEARED_SESSION,
  MSG_RESUME_SESSION,
  MSG_SET_TASK_NAME,
  MSG_START_SESSION,
  MSG_SYNC_KNOWLEDGE,
  type ExtensionMessage,
  type ExportFlowResponse,
  type RecordingStatus,
  type SessionState,
  type SyncKnowledgeResponse,
} from "./messages.js";

type StoredSession = {
  meta: RecorderSessionMeta;
  events: RecordedEvent[];
  status: RecordingStatus;
  taskName?: string;
};

type BackgroundHandlerDeps = {
  loadSession?: () => Promise<StoredSession>;
  saveSession?: (session: StoredSession) => Promise<void>;
  loadClearedSession?: () => Promise<StoredSession | undefined>;
  saveClearedSession?: (session: StoredSession | undefined) => Promise<void>;
  parseRecordedEvent?: (event: RecordedEvent) => RecordedEvent;
  buildFlowFromEvents?: (events: RecordedEvent[], meta: Record<string, unknown>) => unknown;
  createPortableFlowDocument?: (flow: unknown) => PortableFlowDocumentResult;
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
    storage: {
      session: {
        get: vi.fn().mockResolvedValue({}),
        set: vi.fn().mockResolvedValue(undefined),
        remove: vi.fn().mockResolvedValue(undefined),
      },
      local: {
        get: vi.fn().mockResolvedValue({}),
        set: vi.fn().mockResolvedValue(undefined),
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
  status?: RecordingStatus;
  taskName?: string;
}): StoredSession {
  return {
    meta: {
      sessionId: "session-12345678",
      projectId: "project-source",
      startedAt: "2026-06-07T12:00:00.000Z",
      ...(overrides?.meta ?? {}),
    },
    events: overrides?.events ?? [],
    status: overrides?.status ?? "recording",
    ...(overrides?.taskName ? { taskName: overrides.taskName } : {}),
  };
}

function dispatchRuntimeMessage(
  listener: RuntimeMessageListener,
  message: ExtensionMessage,
): Promise<unknown> {
  return new Promise((resolve) => {
    const keepChannelOpen = listener(message, {}, resolve);
    expect(keepChannelOpen).toBe(true);
  });
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
    expect(response).toEqual({ ok: true, status: "recording", eventCount: 1 });
  });

  it("初始会话为空闲态，不会静默录制", async () => {
    const backgroundModule = await loadBackgroundModule();
    const session = createSession();
    session.status = "idle";
    const saveSession = vi.fn();
    const parseRecordedEvent = vi.fn();
    const handleMessage = backgroundModule.createBackgroundMessageHandler?.({
      loadSession: vi.fn().mockResolvedValue(session),
      saveSession,
      parseRecordedEvent,
    });

    const response = await handleMessage?.({
      type: MSG_RECORD_EVENT,
      event: {
        id: "evt-ignored",
        type: "click",
        timestamp: 1710000000000,
        url: "https://example.com",
        payload: { selector: "#submit" },
      },
    });

    expect(response).toEqual({ ok: false, ignored: true, status: "idle", eventCount: 0 });
    expect(parseRecordedEvent).not.toHaveBeenCalled();
    expect(saveSession).not.toHaveBeenCalled();
  });

  it("开始、暂停、继续、完成沿用同一会话且暂停与完成后拒绝事件", async () => {
    const backgroundModule = await loadBackgroundModule();
    let session = createSession();
    session.status = "idle";
    const saveSession = vi.fn(async (next: StoredSession) => {
      session = structuredClone(next);
    });
    const handleMessage = backgroundModule.createBackgroundMessageHandler?.({
      loadSession: vi.fn(async () => structuredClone(session)),
      saveSession,
    });

    await expect(handleMessage?.({ type: MSG_START_SESSION })).resolves.toMatchObject({
      status: "recording",
      eventCount: 0,
    });
    const sessionId = session.meta.sessionId;
    await expect(handleMessage?.({ type: MSG_PAUSE_SESSION })).resolves.toMatchObject({
      status: "paused",
    });
    await expect(
      handleMessage?.({
        type: MSG_RECORD_EVENT,
        event: {
          id: "evt-paused",
          type: "click",
          timestamp: 1710000000000,
          url: "https://example.com",
          payload: { selector: "#paused" },
        },
      }),
    ).resolves.toMatchObject({ ok: false, ignored: true, status: "paused", eventCount: 0 });
    await expect(handleMessage?.({ type: MSG_RESUME_SESSION })).resolves.toMatchObject({
      status: "recording",
      sessionId,
    });
    await handleMessage?.({
      type: MSG_RECORD_EVENT,
      event: {
        id: "evt-recorded",
        type: "click",
        timestamp: 1710000000100,
        url: "https://example.com",
        payload: { selector: "#recorded", name: "保存" },
      },
    });
    await expect(handleMessage?.({ type: MSG_COMPLETE_SESSION })).resolves.toMatchObject({
      status: "completed",
      eventCount: 1,
      targetSites: ["example.com"],
      preview: [{ id: "evt-recorded", label: "点击 保存" }],
    });
    await expect(
      handleMessage?.({
        type: MSG_RECORD_EVENT,
        event: {
          id: "evt-completed",
          type: "click",
          timestamp: 1710000000200,
          url: "https://example.com",
          payload: { selector: "#completed" },
        },
      }),
    ).resolves.toMatchObject({ ok: false, ignored: true, status: "completed", eventCount: 1 });
  });

  it("读取会话会恢复已持久化的暂停状态、事件和预览", async () => {
    const backgroundModule = await loadBackgroundModule();
    const session = createSession({
      events: [
        {
          id: "evt-fill",
          type: "fill",
          timestamp: 1710000000000,
          url: "https://secure.example.com/login",
          payload: {
            selector: "#password",
            name: "密码",
            value: "{{secret_password}}",
          },
        },
      ],
      status: "completed",
      taskName: "录制流程",
    });
    session.status = "paused";
    const handleMessage = backgroundModule.createBackgroundMessageHandler?.({
      loadSession: vi.fn().mockResolvedValue(session),
    });

    const state = (await handleMessage?.({ type: MSG_GET_SESSION })) as SessionState;

    expect(state).toMatchObject({
      status: "paused",
      eventCount: 1,
      targetSites: ["secure.example.com"],
      preview: [{ id: "evt-fill", label: "填写 密码（敏感信息已保护）" }],
    });
    expect(JSON.stringify(state)).not.toContain("secret_password}}");
  });

  it("service worker 重启后从 storage.session 恢复会话状态", async () => {
    const sessionStorage = new Map<string, unknown>();
    const storageSession = {
      get: vi.fn(async (key: string) => ({ [key]: sessionStorage.get(key) })),
      set: vi.fn(async (values: Record<string, unknown>) => {
        for (const [key, value] of Object.entries(values)) sessionStorage.set(key, value);
      }),
      remove: vi.fn(async (key: string) => {
        sessionStorage.delete(key);
      }),
    };
    const browserStub = {
      storage: {
        session: storageSession,
        local: {
          get: vi.fn().mockResolvedValue({}),
          set: vi.fn().mockResolvedValue(undefined),
        },
      },
    };
    const firstWorker = await loadBackgroundModuleWithRegisteredListener(browserStub);

    const started = (await dispatchRuntimeMessage(firstWorker.listener, {
      type: MSG_START_SESSION,
    })) as SessionState;
    await dispatchRuntimeMessage(firstWorker.listener, { type: MSG_PAUSE_SESSION });

    const restartedWorker = await loadBackgroundModuleWithRegisteredListener(browserStub);
    const restored = (await dispatchRuntimeMessage(restartedWorker.listener, {
      type: MSG_GET_SESSION,
    })) as SessionState;

    expect(restored).toMatchObject({
      status: "paused",
      sessionId: started.sessionId,
      eventCount: 0,
    });
    expect(storageSession.set).toHaveBeenCalled();
  });

  it("background listener 串行化并发事件，避免快速操作覆盖前一事件", async () => {
    const sessionStorage = new Map<string, unknown>();
    const browserStub = {
      storage: {
        session: {
          get: vi.fn(async (key: string) => ({
            [key]: structuredClone(sessionStorage.get(key)),
          })),
          set: vi.fn(async (values: Record<string, unknown>) => {
            await Promise.resolve();
            for (const [key, value] of Object.entries(values)) {
              sessionStorage.set(key, structuredClone(value));
            }
          }),
          remove: vi.fn(async (key: string) => {
            sessionStorage.delete(key);
          }),
        },
        local: {
          get: vi.fn().mockResolvedValue({}),
          set: vi.fn().mockResolvedValue(undefined),
        },
      },
    };
    const worker = await loadBackgroundModuleWithRegisteredListener(browserStub);
    await dispatchRuntimeMessage(worker.listener, { type: MSG_START_SESSION });
    const buildEvent = (id: string): ExtensionMessage => ({
      type: MSG_RECORD_EVENT,
      event: {
        id,
        type: "click",
        timestamp: 1710000000000,
        url: "https://example.com",
        payload: { selector: `#${id}` },
      },
    });

    await Promise.all([
      dispatchRuntimeMessage(worker.listener, buildEvent("first")),
      dispatchRuntimeMessage(worker.listener, buildEvent("second")),
    ]);
    const state = (await dispatchRuntimeMessage(worker.listener, {
      type: MSG_GET_SESSION,
    })) as SessionState;

    expect(state.eventCount).toBe(2);
    expect(state.preview).toHaveLength(2);
  });

  it("完成后任务名会去除首尾空白、拒绝空白和超长，并同步为 Flow 名称", async () => {
    const backgroundModule = await loadBackgroundModule();
    let session = createSession({
      events: [
        {
          id: "evt-1",
          type: "navigate",
          timestamp: 1710000000000,
          url: "https://example.com/list",
          payload: { url: "https://example.com/list" },
        },
      ],
      status: "completed",
      taskName: "录制流程",
    });
    session.status = "completed";
    const saveSession = vi.fn(async (next: StoredSession) => {
      session = structuredClone(next);
    });
    const buildFlowFromEvents = vi.fn().mockReturnValue({ id: "flow-1", name: "导出订单" });
    const saveFlowToKnowledge = vi.fn().mockResolvedValue({
      flowId: "flow-1",
      name: "导出订单",
      projectId: "project-target",
    });
    const handleMessage = backgroundModule.createBackgroundMessageHandler?.({
      loadSession: vi.fn(async () => structuredClone(session)),
      saveSession,
      buildFlowFromEvents,
      saveFlowToKnowledge,
    });

    await expect(handleMessage?.({ type: MSG_SET_TASK_NAME, name: "   " })).resolves.toEqual({
      ok: false,
      error: "请输入任务名称",
    });
    await expect(
      handleMessage?.({ type: MSG_SET_TASK_NAME, name: "任".repeat(81) }),
    ).resolves.toEqual({ ok: false, error: "任务名称不能超过 80 个字符" });
    await expect(
      handleMessage?.({ type: MSG_SET_TASK_NAME, name: "  导出订单  " }),
    ).resolves.toMatchObject({ ok: true, taskName: "导出订单" });
    await handleMessage?.({
      type: MSG_SYNC_KNOWLEDGE,
      projectId: "project-target",
    });

    expect(buildFlowFromEvents).toHaveBeenCalledWith(session.events, {
      ...session.meta,
      projectId: "project-target",
      flowId: `flow-${session.meta.sessionId}`,
      name: "导出订单",
    });
  });

  it("清空必须明确确认，并且清空后的会话只能恢复一次", async () => {
    const backgroundModule = await loadBackgroundModule();
    let session = createSession({
      events: [
        {
          id: "evt-1",
          type: "click",
          timestamp: 1710000000000,
          url: "https://example.com",
          payload: { selector: "#submit" },
        },
      ],
    });
    session.status = "completed";
    let clearedSession: StoredSession | undefined;
    const saveSession = vi.fn(async (next: StoredSession) => {
      session = structuredClone(next);
    });
    const handleMessage = backgroundModule.createBackgroundMessageHandler?.({
      loadSession: vi.fn(async () => structuredClone(session)),
      saveSession,
      saveClearedSession: vi.fn(async (cleared: StoredSession | undefined) => {
        clearedSession = cleared ? structuredClone(cleared) : undefined;
      }),
      loadClearedSession: vi.fn(async () =>
        clearedSession ? structuredClone(clearedSession) : undefined,
      ),
    });

    await expect(handleMessage?.({ type: MSG_CLEAR_SESSION, confirmed: false })).resolves.toEqual({
      ok: false,
      error: "清空前需要确认",
    });
    expect(session.events).toHaveLength(1);
    await expect(handleMessage?.({ type: MSG_CLEAR_SESSION, confirmed: true })).resolves.toMatchObject({
      status: "idle",
      eventCount: 0,
      canRestoreCleared: true,
    });
    await expect(handleMessage?.({ type: MSG_RESTORE_CLEARED_SESSION })).resolves.toMatchObject({
      ok: true,
      status: "completed",
      eventCount: 1,
      canRestoreCleared: false,
    });
    await expect(handleMessage?.({ type: MSG_RESTORE_CLEARED_SESSION })).resolves.toEqual({
      ok: false,
      error: "没有可恢复的录制",
    });
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
      status: "completed",
      taskName: "录制流程",
    });
    const flow = {
      id: "flow-session-12345678",
      name: "录制流程",
      steps: [{ type: "navigate" }],
    };
    const buildFlowFromEvents = vi.fn().mockReturnValue(flow);
    const createPortableFlowDocument = vi.fn().mockReturnValue({
      document: flow,
      warnings: [],
    });

    const handleMessage = backgroundModule.createBackgroundMessageHandler?.({
      loadSession: vi.fn().mockResolvedValue(session),
      buildFlowFromEvents,
      createPortableFlowDocument,
    });

    const response = (await handleMessage?.({
      type: MSG_EXPORT_FLOW,
    })) as ExportFlowResponse;

    expect(buildFlowFromEvents).toHaveBeenCalledWith(session.events, {
      ...session.meta,
      flowId: `flow-${session.meta.sessionId}`,
      name: "录制流程",
    });
    expect(createPortableFlowDocument).toHaveBeenCalledWith(flow);
    expect(response).toEqual({
      ok: true,
      json: JSON.stringify(flow, null, 2),
      filename: "flow-session-.json",
      warnings: [],
      summary: {
        warningCount: 0,
        businessTextReviewRequired: true,
      },
    });
  });

  it("导出 bare FlowDocument 时复用公共合同处理密码、token、上传路径与 URL 凭据", async () => {
    const backgroundModule = await loadBackgroundModule();
    const session = createSession({ status: "completed", taskName: "敏感导出" });
    const sensitiveFlow: FlowDocument = {
      schemaVersion: 1,
      id: "flow-sensitive-export",
      projectId: "project-source",
      name: "敏感导出",
      variables: [
        {
          name: "secret_api_token",
          type: "string",
          required: false,
          defaultValue: "token-default-value",
        },
      ],
      steps: [
        {
          id: "password",
          type: "fill",
          target: {
            strategies: [{ kind: "css", selector: "input[type=password]" }],
            hints: { inputType: "password", textSample: "hunter2" },
          },
          value: "hunter2",
        },
        {
          id: "upload",
          type: "upload",
          target: { strategies: [{ kind: "css", selector: "input[type=file]" }] },
          files: ["/Users/example/private/report.csv"],
        },
        {
          id: "navigate",
          type: "navigate",
          url: "https://alice:password@example.com/report?token=url-token&view=summary",
        },
      ],
      meta: {
        createdAt: "2026-08-23T08:00:00.000Z",
        updatedAt: "2026-08-23T08:00:00.000Z",
        source: "recorded",
      },
    };
    const handleMessage = backgroundModule.createBackgroundMessageHandler?.({
      loadSession: vi.fn().mockResolvedValue(session),
      buildFlowFromEvents: vi.fn().mockReturnValue(sensitiveFlow),
    });

    const response = (await handleMessage?.({ type: MSG_EXPORT_FLOW })) as ExportFlowResponse;

    expect(response.ok).toBe(true);
    if (!response.ok) throw new Error(response.error);
    const exported = JSON.parse(response.json) as FlowDocument & { warnings?: unknown };
    expect(exported.schemaVersion).toBe(1);
    expect(exported).not.toHaveProperty("warnings");
    expect(response.warnings.map((warning) => warning.code)).toEqual(
      expect.arrayContaining([
        "secret-default-removed",
        "password-value-variableized",
        "password-hint-removed",
        "upload-path-variableized",
        "url-userinfo-removed",
        "url-query-variableized",
      ]),
    );
    expect(response.summary).toEqual({
      warningCount: response.warnings.length,
      businessTextReviewRequired: true,
    });
    expect(response.json).not.toContain("token-default-value");
    expect(response.json).not.toContain("hunter2");
    expect(response.json).not.toContain("/Users/example/private/report.csv");
    expect(response.json).not.toContain("alice:password");
    expect(response.json).not.toContain("url-token");
  });

  it("公共导出合同失败时返回可判别错误且不伪造成功结果", async () => {
    const backgroundModule = await loadBackgroundModule();
    const handleMessage = backgroundModule.createBackgroundMessageHandler?.({
      loadSession: vi.fn().mockResolvedValue(createSession({ status: "completed" })),
      buildFlowFromEvents: vi.fn().mockReturnValue({ schemaVersion: 1 }),
      createPortableFlowDocument: vi.fn(() => {
        throw new Error("Flow 结构无效");
      }),
    });

    await expect(handleMessage?.({ type: MSG_EXPORT_FLOW })).resolves.toEqual({
      ok: false,
      error: "Flow 结构无效",
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
      status: "completed",
      taskName: "录制流程",
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
      status: "completed",
      taskName: "录制流程",
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
      status: "completed",
      taskName: "录制流程",
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
      loadSession: vi.fn().mockResolvedValue(createSession({ status: "completed" })),
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
