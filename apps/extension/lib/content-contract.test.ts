import { afterEach, describe, expect, it, vi } from "vitest";

type UploadReplayInputsBuilder = (
  source: {
    selector?: string;
    testId?: string;
    nameAttr?: string;
    labelText?: string;
    ariaLabel?: string;
  },
  fileNames: string[],
) => string[];

type ContentModule = {
  buildUploadReplayInputs?: UploadReplayInputsBuilder;
  readFillValue?: (element: Element) => string;
  isSubmitLikePressKey?: (key: string) => boolean;
  default?: {
    main?: () => void;
  };
};

const recorderMocks = vi.hoisted(() => ({
  buildInteractionPayload: vi.fn(),
  resolveClickTarget: vi.fn(),
  shouldRecordClick: vi.fn(),
  shouldRecordFill: vi.fn(),
}));

async function loadContentModule(): Promise<ContentModule> {
  vi.resetModules();
  recorderMocks.buildInteractionPayload.mockReset();
  recorderMocks.resolveClickTarget.mockReset();
  recorderMocks.shouldRecordClick.mockReset();
  recorderMocks.shouldRecordFill.mockReset();
  vi.stubGlobal("defineContentScript", (config: unknown) => config);
  vi.doMock("@flowweave/recorder", () => recorderMocks);
  return (await import("../entrypoints/content.js")) as ContentModule;
}

type HandlerEvent = { target: unknown; [key: string]: unknown };

class FakeElement {
  parentElement: FakeElement | null = null;
  tagName = "div";
}

class FakeHTMLElement extends FakeElement {
  textContent = "";
  innerText = "";
  isContentEditable = false;
  id = "";
  scrollLeft = 0;
  scrollTop = 0;
  #attributes = new Map<string, string>();

  setAttribute(name: string, value: string): void {
    this.#attributes.set(name, value);
    if (name === "contenteditable" && value.toLowerCase() !== "false") {
      this.isContentEditable = true;
    }
  }

  getAttribute(name: string): string | null {
    return this.#attributes.get(name) ?? null;
  }
}

class FakeHTMLInputElement extends FakeHTMLElement {
  value = "";
  type = "text";
  checked = false;
  files: Array<{ name: string }> | null = null;

  constructor() {
    super();
    this.tagName = "input";
  }
}

class FakeHTMLTextAreaElement extends FakeHTMLElement {
  value = "";

  constructor() {
    super();
    this.tagName = "textarea";
  }
}

class FakeHTMLSelectElement extends FakeHTMLElement {
  selectedOptions: Array<{ value: string }> = [];

  constructor() {
    super();
    this.tagName = "select";
  }
}

async function setupContentHarness() {
  vi.stubGlobal("Element", FakeElement);
  vi.stubGlobal("HTMLElement", FakeHTMLElement);
  vi.stubGlobal("HTMLInputElement", FakeHTMLInputElement);
  vi.stubGlobal("HTMLTextAreaElement", FakeHTMLTextAreaElement);
  vi.stubGlobal("HTMLSelectElement", FakeHTMLSelectElement);

  const handlers = new Map<string, Array<(event: HandlerEvent) => void>>();
  const documentStub = {
    body: new FakeHTMLElement(),
    documentElement: new FakeHTMLElement(),
    addEventListener: vi.fn((type: string, handler: (event: HandlerEvent) => void) => {
      const bucket = handlers.get(type) ?? [];
      bucket.push(handler);
      handlers.set(type, bucket);
    }),
    querySelector: vi.fn(() => null),
  };
  const windowStub = {
    location: { href: "https://app.example.com/search" },
    addEventListener: vi.fn(),
    scrollX: 0,
    scrollY: 0,
  };
  const historyStub = {
    pushState() {
      return undefined;
    },
    replaceState() {
      return undefined;
    },
  };
  const sendMessage = vi.fn().mockResolvedValue(undefined);

  vi.stubGlobal("document", documentStub);
  vi.stubGlobal("window", windowStub);
  vi.stubGlobal("history", historyStub);
  vi.stubGlobal("browser", {
    runtime: {
      sendMessage,
      onMessage: {
        addListener: vi.fn(),
      },
    },
  });

  const contentModule = await loadContentModule();
  recorderMocks.resolveClickTarget.mockImplementation((element) => element);
  recorderMocks.shouldRecordClick.mockReturnValue(true);
  recorderMocks.buildInteractionPayload.mockImplementation((element, kind, options) => {
    const htmlElement = element as FakeHTMLElement;
    const selector = htmlElement.id ? `#${htmlElement.id}` : `#${htmlElement.tagName.toLowerCase()}`;
    const role =
      htmlElement instanceof FakeHTMLSelectElement
        ? "combobox"
        : htmlElement.getAttribute("role") ?? "textbox";

    if (kind === "fill") {
      return {
        selector,
        role,
        name: "字段",
        value: options?.value,
      };
    }

    return {
      selector,
      role,
      name: "字段",
    };
  });
  expect(contentModule.default?.main).toBeTypeOf("function");
  contentModule.default?.main?.();
  sendMessage.mockClear();

  return {
    handlers,
    sendMessage,
  };
}

function readRecordedEvents(sendMessage: ReturnType<typeof vi.fn>) {
  return sendMessage.mock.calls.map(
    ([payload]) => (payload as { event: { type: string; payload: Record<string, unknown> } }).event,
  );
}

describe("content upload placeholder contract", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unmock("@flowweave/recorder");
  });

  it("为同名 file input 生成不同的 upload 占位符前缀，避免变量碰撞", async () => {
    const contentModule = await loadContentModule();

    expect(contentModule.buildUploadReplayInputs).toBeTypeOf("function");

    const buildInputs = contentModule.buildUploadReplayInputs as UploadReplayInputsBuilder;
    const first = buildInputs(
      {
        nameAttr: "resume",
        selector: "#resume-primary",
        labelText: "上传简历",
      },
      ["resume-a.pdf"],
    );
    const second = buildInputs(
      {
        nameAttr: "resume",
        selector: "#resume-secondary",
        labelText: "上传简历",
      },
      ["resume-b.pdf"],
    );

    expect(first[0]).toMatch(/^\{\{upload_[a-z0-9_]+_1\}\}$/);
    expect(second[0]).toMatch(/^\{\{upload_[a-z0-9_]+_1\}\}$/);
    expect(first[0]).not.toBe(second[0]);
  });

  it("读取 contenteditable 的文本内容作为 fill 值", async () => {
    const contentModule = await loadContentModule();

    expect(contentModule.readFillValue).toBeTypeOf("function");

    vi.stubGlobal("HTMLElement", FakeHTMLElement);
    vi.stubGlobal("HTMLInputElement", FakeHTMLInputElement);
    vi.stubGlobal("HTMLTextAreaElement", FakeHTMLTextAreaElement);

    const editor = new FakeHTMLElement();
    editor.setAttribute("contenteditable", "true");
    editor.textContent = "需要补充库存说明";

    const readValue = contentModule.readFillValue as (element: Element) => string;
    expect(readValue(editor as unknown as Element)).toBe("需要补充库存说明");
  });

  it("识别会先 flush 待提交 fill 的提交型按键", async () => {
    const contentModule = await loadContentModule();

    expect(contentModule.isSubmitLikePressKey).toBeTypeOf("function");

    const isSubmitLikePressKey = contentModule.isSubmitLikePressKey as (key: string) => boolean;
    expect(isSubmitLikePressKey("Enter")).toBe(true);
    expect(isSubmitLikePressKey("Tab")).toBe(true);
    expect(isSubmitLikePressKey("Escape")).toBe(true);
    expect(isSubmitLikePressKey("Control+Enter")).toBe(true);
    expect(isSubmitLikePressKey("Meta+s")).toBe(true);
    expect(isSubmitLikePressKey("Control+c")).toBe(false);
  });

  it("提交型 keypress 会先 flush 待提交 fill，再记录 keypress", async () => {
    vi.useFakeTimers();
    const { handlers, sendMessage } = await setupContentHarness();
    const input = new FakeHTMLInputElement();
    input.value = "flowweave";
    input.id = "keyword";

    recorderMocks.shouldRecordFill.mockImplementation((element) => element === (input as unknown as Element));

    handlers.get("input")?.[0]?.({ target: input });
    handlers.get("keydown")?.[0]?.({
      target: input,
      key: "Enter",
      isComposing: false,
      repeat: false,
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      metaKey: false,
    });

    expect(sendMessage).toHaveBeenCalledTimes(2);
    const recordedEvents = readRecordedEvents(sendMessage);
    expect(recordedEvents[0]).toMatchObject({
      type: "fill",
      payload: {
        selector: "#keyword",
        value: "flowweave",
      },
    });
    expect(recordedEvents[1]).toMatchObject({
      type: "keypress",
      payload: {
        selector: "#keyword",
        key: "Enter",
      },
    });

    vi.advanceTimersByTime(450);
    expect(sendMessage).toHaveBeenCalledTimes(2);
  });

  it("真实 suggest 输入上的 ArrowDown 会记录 keypress，但不会提前 flush pending fill", async () => {
    vi.useFakeTimers();

    const { handlers, sendMessage } = await setupContentHarness();
    const input = new FakeHTMLInputElement();
    input.id = "keyword";
    input.value = "flow";
    input.setAttribute("aria-autocomplete", "list");

    recorderMocks.shouldRecordFill.mockImplementation((element) => element === (input as unknown as Element));

    handlers.get("input")?.[0]?.({ target: input });
    handlers.get("keydown")?.[0]?.({
      target: input,
      key: "ArrowDown",
      isComposing: false,
      repeat: false,
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      metaKey: false,
    });

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(readRecordedEvents(sendMessage)[0]).toMatchObject({
      type: "keypress",
      payload: {
        selector: "#keyword",
        key: "ArrowDown",
      },
    });

    vi.advanceTimersByTime(450);
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(readRecordedEvents(sendMessage)[1]).toMatchObject({
      type: "fill",
      payload: {
        selector: "#keyword",
        value: "flow",
      },
    });
  });

  it("aria-autocomplete=none 的普通输入框上的 ArrowDown 不会被录制，也不会提前 flush", async () => {
    vi.useFakeTimers();

    const { handlers, sendMessage } = await setupContentHarness();
    const input = new FakeHTMLInputElement();
    input.id = "plain-none";
    input.value = "plain text";
    input.setAttribute("aria-autocomplete", "none");

    recorderMocks.shouldRecordFill.mockImplementation((element) => element === (input as unknown as Element));

    handlers.get("input")?.[0]?.({ target: input });
    handlers.get("keydown")?.[0]?.({
      target: input,
      key: "ArrowDown",
      isComposing: false,
      repeat: false,
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      metaKey: false,
    });

    expect(sendMessage).not.toHaveBeenCalled();

    vi.advanceTimersByTime(450);
    expect(readRecordedEvents(sendMessage)).toEqual([
      expect.objectContaining({
        type: "fill",
        payload: expect.objectContaining({
          selector: "#plain-none",
          value: "plain text",
        }),
      }),
    ]);
  });

  it("只有 aria-controls 的输入框上的 ArrowDown 不会被录制，也不会提前 flush", async () => {
    vi.useFakeTimers();

    const { handlers, sendMessage } = await setupContentHarness();
    const input = new FakeHTMLInputElement();
    input.id = "plain-controls";
    input.value = "plain text";
    input.setAttribute("aria-controls", "keyword-suggestions");

    recorderMocks.shouldRecordFill.mockImplementation((element) => element === (input as unknown as Element));

    handlers.get("input")?.[0]?.({ target: input });
    handlers.get("keydown")?.[0]?.({
      target: input,
      key: "ArrowDown",
      isComposing: false,
      repeat: false,
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      metaKey: false,
    });

    expect(sendMessage).not.toHaveBeenCalled();

    vi.advanceTimersByTime(450);
    expect(readRecordedEvents(sendMessage)).toEqual([
      expect.objectContaining({
        type: "fill",
        payload: expect.objectContaining({
          selector: "#plain-controls",
          value: "plain text",
        }),
      }),
    ]);
  });

  it("原生 select 与组合框容器内输入框上的方向键会记录为 keypress", async () => {
    const { handlers, sendMessage } = await setupContentHarness();
    const select = new FakeHTMLSelectElement();
    select.id = "country";
    const combobox = new FakeHTMLElement();
    combobox.setAttribute("role", "combobox");
    const childInput = new FakeHTMLInputElement();
    childInput.id = "city";
    childInput.parentElement = combobox;

    handlers.get("keydown")?.[0]?.({
      target: select,
      key: "ArrowDown",
      isComposing: false,
      repeat: false,
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      metaKey: false,
    });
    handlers.get("keydown")?.[0]?.({
      target: childInput,
      key: "ArrowUp",
      isComposing: false,
      repeat: false,
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      metaKey: false,
    });

    expect(readRecordedEvents(sendMessage)).toEqual([
      expect.objectContaining({
        type: "keypress",
        payload: expect.objectContaining({
          selector: "#country",
          key: "ArrowDown",
        }),
      }),
      expect.objectContaining({
        type: "keypress",
        payload: expect.objectContaining({
          selector: "#city",
          key: "ArrowUp",
        }),
      }),
    ]);
  });

  it("普通非导航型输入框上的方向键不会被录制，也不会提前 flush", async () => {
    vi.useFakeTimers();

    const { handlers, sendMessage } = await setupContentHarness();
    const input = new FakeHTMLInputElement();
    input.id = "plain";
    input.value = "plain text";

    recorderMocks.shouldRecordFill.mockImplementation((element) => element === (input as unknown as Element));

    handlers.get("input")?.[0]?.({ target: input });
    handlers.get("keydown")?.[0]?.({
      target: input,
      key: "ArrowDown",
      isComposing: false,
      repeat: false,
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      metaKey: false,
    });

    expect(sendMessage).not.toHaveBeenCalled();

    vi.advanceTimersByTime(450);
    expect(readRecordedEvents(sendMessage)).toEqual([
      expect.objectContaining({
        type: "fill",
        payload: expect.objectContaining({
          selector: "#plain",
          value: "plain text",
        }),
      }),
    ]);
  });

  it("页面级 scroll 发送不带 target 的坐标", async () => {
    vi.useFakeTimers();

    const { handlers, sendMessage } = await setupContentHarness();
    const page = window as unknown as { scrollX: number; scrollY: number };
    page.scrollX = 12;
    page.scrollY = 480;

    handlers.get("scroll")?.[0]?.({ target: document });
    vi.advanceTimersByTime(180);

    expect(readRecordedEvents(sendMessage)).toEqual([
      expect.objectContaining({
        type: "scroll",
        payload: {
          x: 12,
          y: 480,
        },
      }),
    ]);
    expect(readRecordedEvents(sendMessage)[0]?.payload).not.toHaveProperty("selector");
  });

  it("容器级 scroll 发送带 target 的坐标", async () => {
    vi.useFakeTimers();

    const { handlers, sendMessage } = await setupContentHarness();
    const container = new FakeHTMLElement();
    container.id = "activity-list";
    container.scrollLeft = 20;
    container.scrollTop = 640;
    container.setAttribute("role", "region");

    handlers.get("scroll")?.[0]?.({ target: container });
    vi.advanceTimersByTime(180);

    expect(readRecordedEvents(sendMessage)).toEqual([
      expect.objectContaining({
        type: "scroll",
        payload: expect.objectContaining({
          selector: "#activity-list",
          role: "region",
          x: 20,
          y: 640,
        }),
      }),
    ]);
  });

  it("连续滚动只保留最后一次坐标", async () => {
    vi.useFakeTimers();

    const { handlers, sendMessage } = await setupContentHarness();
    const container = new FakeHTMLElement();
    container.id = "activity-list";

    container.scrollTop = 120;
    handlers.get("scroll")?.[0]?.({ target: container });

    vi.advanceTimersByTime(60);
    container.scrollTop = 420;
    handlers.get("scroll")?.[0]?.({ target: container });

    vi.advanceTimersByTime(180);

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(readRecordedEvents(sendMessage)[0]).toMatchObject({
      type: "scroll",
      payload: {
        selector: "#activity-list",
        x: 0,
        y: 420,
      },
    });
  });

  it("输入后立刻滚动时，scroll 仍先于 debounce 后的 fill 发出", async () => {
    vi.useFakeTimers();

    const { handlers, sendMessage } = await setupContentHarness();
    const input = new FakeHTMLInputElement();
    input.id = "keyword";
    input.value = "flowweave";

    const container = new FakeHTMLElement();
    container.id = "activity-list";
    container.scrollTop = 360;

    recorderMocks.shouldRecordFill.mockImplementation((element) => element === (input as unknown as Element));

    handlers.get("input")?.[0]?.({ target: input });
    handlers.get("scroll")?.[0]?.({ target: container });

    vi.advanceTimersByTime(180);
    expect(readRecordedEvents(sendMessage)).toEqual([
      expect.objectContaining({
        type: "scroll",
        payload: expect.objectContaining({
          selector: "#activity-list",
          y: 360,
        }),
      }),
    ]);

    vi.advanceTimersByTime(260);
    expect(readRecordedEvents(sendMessage)[1]).toMatchObject({
      type: "fill",
      payload: expect.objectContaining({
        selector: "#keyword",
        value: "flowweave",
      }),
    });
  });
});
