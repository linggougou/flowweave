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
};

async function loadContentModule(): Promise<ContentModule> {
  vi.resetModules();
  vi.stubGlobal("defineContentScript", (config: unknown) => config);
  vi.mock("@flowweave/recorder", () => ({
    buildInteractionPayload: vi.fn(),
    resolveClickTarget: vi.fn(),
    shouldRecordClick: vi.fn(),
    shouldRecordFill: vi.fn(),
  }));
  return (await import("../entrypoints/content.js")) as ContentModule;
}

describe("content upload placeholder contract", () => {
  afterEach(() => {
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
});
