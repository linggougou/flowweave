// @vitest-environment happy-dom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExecutionScreenshotPreview } from "./ExecutionScreenshotPreview.js";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

afterEach(() => document.body.replaceChildren());

describe("执行截图预览", () => {
  it("加载态提供对话框语义并把初始焦点放在关闭按钮", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);

    act(() =>
      root.render(
        <ExecutionScreenshotPreview
          status="loading"
          blobUrl={null}
          stepIndex={2}
          stepLabel="提交表单"
          onClose={vi.fn()}
        />,
      ),
    );

    const dialog = host.querySelector("[role='dialog'][aria-modal='true']");
    const closeButton = host.querySelector<HTMLButtonElement>("button");
    expect(dialog?.getAttribute("aria-labelledby")).toBeTruthy();
    expect(dialog?.textContent).toContain("第 3 步截图");
    expect(dialog?.textContent).toContain("提交表单");
    expect(host.textContent).toContain("正在加载截图");
    expect(dialog?.getAttribute("aria-busy")).toBe("true");
    expect(host.querySelector("img")).toBeNull();
    expect(document.activeElement).toBe(closeButton);

    act(() => root.unmount());
  });

  it("成功态只用 Blob URL 渲染只读图片并提供可读 alt", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);

    act(() =>
      root.render(
        <ExecutionScreenshotPreview
          status="available"
          blobUrl="blob:http://127.0.0.1/preview-id"
          stepIndex={0}
          stepLabel="打开订单"
          onClose={vi.fn()}
        />,
      ),
    );

    const image = host.querySelector("img");
    expect(image?.getAttribute("src")).toBe("blob:http://127.0.0.1/preview-id");
    expect(image?.getAttribute("alt")).toBe("第 1 步“打开订单”的执行截图");
    expect(image?.getAttribute("draggable")).toBe("false");
    expect(host.querySelector("iframe, object, embed, webview, script")).toBeNull();
    expect(host.innerHTML).not.toContain("/Users/");
    expect(host.innerHTML).not.toContain("file:");

    act(() => root.unmount());
  });

  it("不可用态和不安全 URL 都不会保留或渲染图片", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);

    act(() =>
      root.render(
        <ExecutionScreenshotPreview
          status="available"
          blobUrl="blob:null/old-preview"
          stepIndex={4}
          stepLabel="保存订单"
          onClose={vi.fn()}
        />,
      ),
    );
    expect(host.querySelector("img")).not.toBeNull();

    act(() =>
      root.render(
        <ExecutionScreenshotPreview
          status="unavailable"
          blobUrl={null}
          stepIndex={4}
          stepLabel="保存订单"
          onClose={vi.fn()}
        />,
      ),
    );
    expect(host.querySelector("img")).toBeNull();
    expect(host.textContent).toContain("没有可预览的截图");

    act(() =>
      root.render(
        <ExecutionScreenshotPreview
          status="available"
          blobUrl="file:///Users/example/.flowweave/step-4.png"
          stepIndex={4}
          stepLabel="保存订单"
          onClose={vi.fn()}
        />,
      ),
    );
    expect(host.querySelector("img")).toBeNull();
    expect(host.textContent).toContain("没有可预览的截图");
    expect(host.textContent).not.toContain("/Users/example");

    act(() => root.unmount());
  });

  it("关闭按钮和 Escape 都请求关闭，卸载后恢复打开前焦点", () => {
    const trigger = document.createElement("button");
    trigger.textContent = "查看截图";
    document.body.append(trigger);
    trigger.focus();
    const host = document.createElement("div");
    document.body.append(host);
    const onClose = vi.fn();
    const root = createRoot(host);

    act(() =>
      root.render(
        <ExecutionScreenshotPreview
          status="unavailable"
          blobUrl={null}
          stepIndex={1}
          stepLabel="点击确认"
          onClose={onClose}
        />,
      ),
    );

    const closeButton = host.querySelector<HTMLButtonElement>("button");
    act(() => closeButton?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onClose).toHaveBeenCalledTimes(1);

    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(onClose).toHaveBeenCalledTimes(2);

    act(() => root.unmount());
    expect(document.activeElement).toBe(trigger);
  });
});
