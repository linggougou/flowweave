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

function normalizeUploadTokenPart(value: string): string {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return normalized.length > 0 ? normalized : "file";
}

function buildUploadReplayInputs(element: HTMLInputElement, fileNames: string[]): string[] {
  const tokenSeed = normalizeUploadTokenPart(
    element.name || element.id || element.getAttribute("aria-label") || "upload",
  );
  return fileNames.map((_name, index) => `{{upload_${tokenSeed}_${index + 1}}}`);
}

const PRESS_KEYS = new Set(["Enter", "Tab", "Escape"]);
const MODIFIER_KEYS = new Set(["Shift", "Control", "Alt", "Meta"]);

function normalizePressKey(key: string): string {
  if (key === "Esc") {
    return "Escape";
  }
  if (key === " ") {
    return "Space";
  }
  return key;
}

function buildRecordedPressKey(event: KeyboardEvent): string | null {
  if (event.isComposing || event.repeat) {
    return null;
  }

  const key = normalizePressKey(event.key);
  if (MODIFIER_KEYS.has(key)) {
    return null;
  }

  const hasShortcutModifier = event.ctrlKey || event.altKey || event.metaKey;
  if (!hasShortcutModifier && !PRESS_KEYS.has(key)) {
    return null;
  }

  const parts: string[] = [];
  if (event.ctrlKey) {
    parts.push("Control");
  }
  if (event.altKey) {
    parts.push("Alt");
  }
  if (event.shiftKey && key !== "Shift") {
    parts.push("Shift");
  }
  if (event.metaKey) {
    parts.push("Meta");
  }
  parts.push(key);
  return parts.join("+");
}

function resolvePressTarget(target: EventTarget | null): Element | null {
  if (!(target instanceof Element)) {
    return null;
  }

  const resolved = resolveClickTarget(target);
  if (resolved === document.body || resolved === document.documentElement) {
    return null;
  }

  return resolved;
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
      const fileNames = readUploadFiles(element);
      if (fileNames.length === 0) {
        return;
      }
      const payload = {
        ...buildInteractionPayload(element, "upload", {
          inputType,
        }),
        files: buildUploadReplayInputs(element, fileNames),
        fileNames,
      };
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

function recordPress(event: KeyboardEvent): void {
  const key = buildRecordedPressKey(event);
  if (!key) {
    return;
  }

  const target = resolvePressTarget(event.target);
  const payload = target
    ? {
        ...buildInteractionPayload(target, "click"),
        key,
      }
    : { key };

  sendEvent({
    type: "keypress",
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

    document.addEventListener(
      "keydown",
      (ev) => {
        recordPress(ev);
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
