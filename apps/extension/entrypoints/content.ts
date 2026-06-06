import type { RecordedEvent } from "@flowweave/shared";
import {
  buildInteractionPayload,
  resolveClickTarget,
  shouldRecordClick,
  shouldRecordFill,
} from "@flowweave/recorder";
import { MSG_PING_CONTENT, MSG_RECORD_EVENT, type RecordEventMessage } from "../lib/messages.js";

function sendEvent(event: Omit<RecordedEvent, "id"> & { id?: string }): void {
  const payload: RecordEventMessage = {
    type: MSG_RECORD_EVENT,
    event: {
      id: event.id ?? crypto.randomUUID(),
      type: event.type,
      timestamp: event.timestamp,
      url: event.url,
      frameId: event.frameId,
      payload: event.payload,
    },
  };
  void browser.runtime.sendMessage(payload).catch(() => {
    // background 未就绪时忽略
  });
}

function recordNavigate(url: string): void {
  sendEvent({
    type: "navigate",
    timestamp: Date.now(),
    url,
    payload: { url },
  });
}

function readFillValue(element: Element): string {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    return element.value;
  }
  return "";
}

function readSelectValues(element: HTMLSelectElement): string[] {
  return Array.from(element.selectedOptions).map((option) => option.value);
}

function readUploadFiles(element: HTMLInputElement): string[] {
  return Array.from(element.files ?? []).map((file) => file.name).filter((name) => name.length > 0);
}

let lastFillSignature = "";

function recordInteractionFromElement(element: Element): void {
  if (element instanceof HTMLInputElement) {
    const inputType = (element.type || "text").toLowerCase();

    if (inputType === "checkbox" || inputType === "radio") {
      const payload = buildInteractionPayload(element, "setChecked", {
        inputType,
        checked: element.checked,
      });
      sendEvent({
        type: "click",
        timestamp: Date.now(),
        url: window.location.href,
        payload,
      });
      return;
    }

    if (inputType === "file") {
      const files = readUploadFiles(element);
      if (files.length === 0) {
        return;
      }
      const payload = buildInteractionPayload(element, "upload", {
        inputType,
        files,
      });
      sendEvent({
        type: "fill",
        timestamp: Date.now(),
        url: window.location.href,
        payload,
      });
      return;
    }
  }

  if (element instanceof HTMLSelectElement) {
    const values = readSelectValues(element);
    const payload = buildInteractionPayload(element, "select", { values });
    sendEvent({
      type: "select",
      timestamp: Date.now(),
      url: window.location.href,
      payload,
    });
    return;
  }

  if (!shouldRecordFill(element)) {
    return;
  }

  const value = readFillValue(element);
  const payload = buildInteractionPayload(element, "fill", {
    value,
    inputType: element instanceof HTMLInputElement ? element.type : undefined,
  });
  const signature = `${payload.selector ?? ""}:${value}:${payload.role ?? ""}`;
  if (signature === lastFillSignature) {
    return;
  }
  lastFillSignature = signature;
  sendEvent({
    type: "fill",
    timestamp: Date.now(),
    url: window.location.href,
    payload,
  });
}

export default defineContentScript({
  matches: ["<all_urls>"],
  runAt: "document_idle",
  main() {
    recordNavigate(window.location.href);

    browser.runtime.onMessage.addListener(
      (message: unknown, _sender: unknown, sendResponse: (response?: unknown) => void) => {
      if (message && typeof message === "object" && "type" in message) {
        if ((message as { type: string }).type === MSG_PING_CONTENT) {
          sendResponse({ ok: true, url: window.location.href });
          return true;
        }
      }
      return undefined;
    },
    );

    document.addEventListener(
      "click",
      (ev) => {
        const target = ev.target;
        if (!(target instanceof Element)) return;
        const actionable = resolveClickTarget(target);
        if (!shouldRecordClick(actionable)) return;
        const payload = buildInteractionPayload(actionable, "click");
        sendEvent({
          type: "click",
          timestamp: Date.now(),
          url: window.location.href,
          payload,
        });
      },
      true,
    );

    document.addEventListener(
      "change",
      (ev) => {
        const target = ev.target;
        if (!(target instanceof Element)) return;
        recordInteractionFromElement(target);
      },
      true,
    );

    document.addEventListener(
      "blur",
      (ev) => {
        const target = ev.target;
        if (!(target instanceof Element)) return;
        recordInteractionFromElement(target);
      },
      true,
    );

    let inputDebounce: ReturnType<typeof setTimeout> | undefined;
    document.addEventListener(
      "input",
      (ev) => {
        const target = ev.target;
        if (!(target instanceof Element) || !shouldRecordFill(target)) return;
        clearTimeout(inputDebounce);
        inputDebounce = setTimeout(() => {
          recordInteractionFromElement(target);
        }, 400);
      },
      true,
    );

    window.addEventListener("popstate", () => {
      recordNavigate(window.location.href);
    });

    const pushState = history.pushState.bind(history);
    history.pushState = (...args) => {
      pushState(...args);
      recordNavigate(window.location.href);
    };

    const replaceState = history.replaceState.bind(history);
    history.replaceState = (...args) => {
      replaceState(...args);
      recordNavigate(window.location.href);
    };
  },
});
