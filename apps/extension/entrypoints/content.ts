import type { RecordedEvent } from "@flowweave/shared";
import { buildCssSelector } from "../lib/dom.js";
import { MSG_RECORD_EVENT, type RecordEventMessage } from "../lib/messages.js";

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

export default defineContentScript({
  matches: ["<all_urls>"],
  runAt: "document_idle",
  main() {
    recordNavigate(window.location.href);

    document.addEventListener(
      "click",
      (ev) => {
        const target = ev.target;
        if (!(target instanceof Element)) return;
        sendEvent({
          type: "click",
          timestamp: Date.now(),
          url: window.location.href,
          payload: {
            selector: buildCssSelector(target),
            tagName: target.tagName.toLowerCase(),
          },
        });
      },
      true,
    );

    document.addEventListener(
      "change",
      (ev) => {
        const target = ev.target;
        if (
          !(target instanceof HTMLInputElement) &&
          !(target instanceof HTMLTextAreaElement) &&
          !(target instanceof HTMLSelectElement)
        ) {
          return;
        }
        sendEvent({
          type: "fill",
          timestamp: Date.now(),
          url: window.location.href,
          payload: {
            selector: buildCssSelector(target),
            value: target instanceof HTMLSelectElement ? target.value : target.value,
            inputType: target instanceof HTMLInputElement ? target.type : undefined,
          },
        });
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
