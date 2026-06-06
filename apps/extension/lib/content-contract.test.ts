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

    class FakeHTMLElement {
      textContent = "";
      innerText = "";
      isContentEditable = false;
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
    }

    class FakeHTMLTextAreaElement extends FakeHTMLElement {
      value = "";
    }

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

    class FakeElement {
      parentElement: FakeElement | null = null;
      tagName = "div";
    }

    class FakeHTMLElement extends FakeElement {
      textContent = "";
      innerText = "";
      isContentEditable = false;
      #attributes = new Map<string, string>();

      setAttribute(name: string, value: string): void {
        this.#attributes.set(name, value);
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
      id = "";

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

    vi.stubGlobal("Element", FakeElement);
    vi.stubGlobal("HTMLElement", FakeHTMLElement);
    vi.stubGlobal("HTMLInputElement", FakeHTMLInputElement);
    vi.stubGlobal("HTMLTextAreaElement", FakeHTMLTextAreaElement);
    vi.stubGlobal("HTMLSelectElement", FakeHTMLSelectElement);

    const handlers = new Map<string, Array<(event: { target: unknown; [key: string]: unknown }) => void>>();
    const documentStub = {
      body: new FakeHTMLElement(),
      documentElement: new FakeHTMLElement(),
      addEventListener: vi.fn((type: string, handler: (event: { target: unknown; [key: string]: unknown }) => void) => {
        const bucket = handlers.get(type) ?? [];
        bucket.push(handler);
        handlers.set(type, bucket);
      }),
      querySelector: vi.fn(() => null),
    };
    const windowStub = {
      location: { href: "https://app.example.com/search" },
      addEventListener: vi.fn(),
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
    const input = new FakeHTMLInputElement();
    input.value = "flowweave";
    input.id = "keyword";

    recorderMocks.shouldRecordFill.mockImplementation((element) => element === (input as unknown as Element));
    recorderMocks.resolveClickTarget.mockImplementation((element) => element);
    recorderMocks.shouldRecordClick.mockReturnValue(true);
    recorderMocks.buildInteractionPayload.mockImplementation((_element, kind, options) => {
      if (kind === "fill") {
        return {
          selector: "#keyword",
          role: "textbox",
          name: "搜索词",
          value: options?.value,
        };
      }
      return {
        selector: "#keyword",
        role: "textbox",
        name: "搜索词",
      };
    });

    expect(contentModule.default?.main).toBeTypeOf("function");
    contentModule.default?.main?.();

    sendMessage.mockClear();

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
    const recordedEvents = sendMessage.mock.calls.map(
      ([payload]) => (payload as { event: { type: string; payload: Record<string, unknown> } }).event,
    );
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
});
