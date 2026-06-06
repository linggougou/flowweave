import type { Target } from "@flowweave/flow-dsl";

type LocatorStrategy = Target["strategies"][number];
type ScopeKind = NonNullable<NonNullable<Target["hints"]>["scopeKind"]>;

/** 录制事件 payload：与 normalize.buildTargetFromPayload 对齐 */
export type InteractionRecordingPayload = {
  strategies: LocatorStrategy[];
  selector?: string;
  role?: string;
  name?: string;
  testId?: string;
  text?: string;
  exact?: boolean;
  value?: string;
  values?: string[];
  files?: string[];
  checked?: boolean;
  inputType?: string;
  tagName?: string;
  nameAttr?: string;
  placeholder?: string;
  labelText?: string;
  textSample?: string;
  scopeText?: string;
  scopeKind?: ScopeKind;
};

const MAX_CSS_DEPTH = 6;
const MAX_NAME_LENGTH = 80;
const MAX_SCOPE_TEXT_LENGTH = 120;
const MAX_SCOPE_TEXT_PARTS = 3;
const SCOPE_HEADING_SELECTORS = [
  ".el-dialog__title",
  ".el-drawer__title",
  ".el-card__header",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "legend",
  '[role="heading"]',
  "header",
] as const;

function escapeCss(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function isElement(value: unknown): value is Element {
  return typeof Element !== "undefined" && value instanceof Element;
}

function isHtmlElement(value: Element): value is HTMLElement {
  return typeof HTMLElement !== "undefined" && value instanceof HTMLElement;
}

function isInputElement(value: Element): value is HTMLInputElement {
  return typeof HTMLInputElement !== "undefined" && value instanceof HTMLInputElement;
}

function isTextAreaElement(value: Element): value is HTMLTextAreaElement {
  return typeof HTMLTextAreaElement !== "undefined" && value instanceof HTMLTextAreaElement;
}

function isSelectElement(value: Element): value is HTMLSelectElement {
  return typeof HTMLSelectElement !== "undefined" && value instanceof HTMLSelectElement;
}

function isContentEditableElement(value: Element): value is HTMLElement {
  if (!isHtmlElement(value)) {
    return false;
  }

  if (value.isContentEditable) {
    return true;
  }

  const contentEditable = value.getAttribute("contenteditable");
  return contentEditable !== null && contentEditable.toLowerCase() !== "false";
}

function isLabelElement(value: Element): value is HTMLLabelElement {
  return typeof HTMLLabelElement !== "undefined" && value instanceof HTMLLabelElement;
}

function trimText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function sliceText(value: string, maxLength: number): string {
  return trimText(value).slice(0, maxLength);
}

function readAssociatedControl(label: Element): Element | null {
  if (!isLabelElement(label)) {
    return null;
  }

  if (label.control instanceof Element) {
    return label.control;
  }

  const htmlFor = label.getAttribute("for");
  if (htmlFor && typeof document !== "undefined") {
    const control = document.getElementById(htmlFor);
    if (control instanceof Element) {
      return control;
    }
  }

  return label.querySelector("input, select, textarea");
}

/** 元素是否可见（跳过 hidden checkbox、display:none 等） */
export function isVisibleElement(element: Element): boolean {
  if (!isHtmlElement(element)) {
    return true;
  }

  if (element.getAttribute("type") === "hidden") {
    return false;
  }

  if (element.classList.contains("el-checkbox__original")) {
    return false;
  }

  if (typeof window !== "undefined" && typeof window.getComputedStyle === "function") {
    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden") {
      return false;
    }
  }

  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function isClickableElement(element: Element): boolean {
  const tag = element.tagName.toLowerCase();
  if (tag === "button" || tag === "a" || tag === "label") {
    return true;
  }

  if (isInputElement(element)) {
    const type = (element.type || "text").toLowerCase();
    return type === "button" || type === "submit" || type === "reset";
  }

  const role = element.getAttribute("role");
  return role === "button" || role === "menuitem" || role === "tab" || role === "link";
}

/** 点击时向上查找可交互容器，避免点到 button 内 span 导致定位漂移 */
export function resolveClickTarget(element: Element): Element {
  let current: Element | null = element;
  for (let depth = 0; depth < 6 && current; depth += 1) {
    const control = readAssociatedControl(current);
    if (control) {
      return control;
    }
    if (isClickableElement(current)) {
      return current;
    }
    current = current.parentElement;
  }
  return element;
}

function isTextLikeInput(element: Element): boolean {
  if (isContentEditableElement(element)) {
    return true;
  }

  if (isTextAreaElement(element) || isSelectElement(element)) {
    return true;
  }

  if (!isInputElement(element)) {
    return false;
  }

  const type = (element.type || "text").toLowerCase();
  return !["button", "submit", "reset", "checkbox", "radio", "hidden", "file", "image"].includes(
    type,
  );
}

/** 是否应录制 click（聚焦 input 的 click 由 fill 覆盖） */
export function shouldRecordClick(element: Element): boolean {
  if (!isVisibleElement(element)) {
    return false;
  }

  const tag = element.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") {
    return false;
  }

  return true;
}

/** 是否应录制 fill/change */
export function shouldRecordFill(element: Element): boolean {
  if (!isVisibleElement(element)) {
    return false;
  }
  return isTextLikeInput(element);
}

function readLabelText(element: Element): string | undefined {
  const id = element.getAttribute("id");
  if (id && typeof document !== "undefined") {
    const label = document.querySelector(`label[for="${escapeCss(id)}"]`);
    if (label?.textContent) {
      const text = trimText(label.textContent);
      if (text.length > 0) {
        return text.slice(0, MAX_NAME_LENGTH);
      }
    }
  }

  const wrapped = element.closest("label");
  if (wrapped?.textContent) {
    const text = trimText(wrapped.textContent);
    if (text.length > 0) {
      return text.slice(0, MAX_NAME_LENGTH);
    }
  }

  return undefined;
}

function readAccessibleName(element: Element): string | undefined {
  const ariaLabel = element.getAttribute("aria-label");
  if (ariaLabel) {
    return trimText(ariaLabel).slice(0, MAX_NAME_LENGTH);
  }

  const placeholder = element.getAttribute("placeholder");
  if (placeholder) {
    return trimText(placeholder).slice(0, MAX_NAME_LENGTH);
  }

  const labelText = readLabelText(element);
  if (labelText) {
    return labelText;
  }

  if (isHtmlElement(element)) {
    const text = trimText(element.innerText || element.textContent || "");
    if (text.length > 0 && text.length <= MAX_NAME_LENGTH) {
      return text;
    }
  }

  return undefined;
}

function inferRole(element: Element): string | undefined {
  const explicit = element.getAttribute("role");
  if (explicit) {
    return explicit;
  }

  const tag = element.tagName.toLowerCase();
  if (tag === "button") {
    return "button";
  }
  if (tag === "a") {
    return "link";
  }
  if (tag === "textarea" || tag === "select") {
    return tag === "select" ? "combobox" : "textbox";
  }
  if (isContentEditableElement(element)) {
    return "textbox";
  }
  if (isInputElement(element)) {
    const type = (element.type || "text").toLowerCase();
    if (type === "button" || type === "submit" || type === "reset") {
      return "button";
    }
    if (type === "checkbox") {
      return "checkbox";
    }
    if (type === "radio") {
      return "radio";
    }
    return "textbox";
  }

  if (tag === "li" && element.classList.contains("el-menu-item")) {
    return "menuitem";
  }

  return undefined;
}

function buildCssSelector(element: Element): string {
  const testId = element.getAttribute("data-testid");
  if (testId) {
    return `[data-testid="${escapeCss(testId)}"]`;
  }

  if (element.id) {
    return `#${escapeCss(element.id)}`;
  }

  const ariaLabel = element.getAttribute("aria-label");
  if (ariaLabel) {
    return `[aria-label="${escapeCss(ariaLabel)}"]`;
  }

  const placeholder = element.getAttribute("placeholder");
  if (placeholder && isInputElement(element)) {
    const type = (element.type || "text").toLowerCase();
    return `${element.tagName.toLowerCase()}[type="${escapeCss(type)}"][placeholder="${escapeCss(placeholder)}"]`;
  }

  const name = element.getAttribute("name");
  if (name && (isInputElement(element) || isTextAreaElement(element) || isSelectElement(element))) {
    return `${element.tagName.toLowerCase()}[name="${escapeCss(name)}"]`;
  }

  const parts: string[] = [];
  let current: Element | null = element;

  while (current && current !== document.documentElement) {
    let part = current.tagName.toLowerCase();
    const parent: Element | null = current.parentElement;
    if (parent) {
      const tag = current.tagName;
      const siblings = Array.from(parent.children).filter(
        (child): child is Element => isElement(child) && child.tagName === tag,
      );
      if (siblings.length > 1) {
        const index = siblings.indexOf(current) + 1;
        part += `:nth-of-type(${index})`;
      }
    }
    parts.unshift(part);
    current = parent;
    if (parts.length >= MAX_CSS_DEPTH) {
      break;
    }
  }

  return parts.join(" > ") || element.tagName.toLowerCase();
}

function readTextSample(element: Element, labelText?: string): string | undefined {
  if (isSelectElement(element)) {
    const sample = trimText(
      Array.from(element.selectedOptions)
        .map((option) => option.textContent ?? "")
        .join(" "),
    );
    if (sample) {
      return sample.slice(0, MAX_NAME_LENGTH);
    }
  }

  if (isHtmlElement(element)) {
    const text = trimText(element.innerText || element.textContent || "");
    if (text.length > 0) {
      return text.slice(0, MAX_NAME_LENGTH);
    }
  }

  return labelText?.slice(0, MAX_NAME_LENGTH);
}

function inferScopeKind(element: Element): ScopeKind | undefined {
  const tagName = element.tagName.toLowerCase();
  const role = element.getAttribute("role");
  if (tagName === "tr" || role === "row") {
    return "row";
  }
  if (tagName === "li" || role === "listitem") {
    return "listitem";
  }
  if (role === "dialog" || element.classList.contains("el-dialog")) {
    return "dialog";
  }
  if (role === "tabpanel") {
    return "tabpanel";
  }
  if (tagName === "section" || tagName === "article" || tagName === "fieldset" || role === "region") {
    return "section";
  }
  if (element.classList.contains("el-card") || element.classList.contains("card")) {
    return "card";
  }
  return undefined;
}

function findScopeContainer(element: Element): { container: Element; kind: ScopeKind } | undefined {
  let current = element.parentElement;
  for (let depth = 0; depth < 10 && current; depth += 1) {
    const kind = inferScopeKind(current);
    if (kind) {
      return { container: current, kind };
    }
    current = current.parentElement;
  }
  return undefined;
}

function isScopeNoiseElement(element: Element): boolean {
  const tagName = element.tagName.toLowerCase();
  if (tagName === "button" || tagName === "input" || tagName === "select" || tagName === "textarea") {
    return true;
  }
  const role = element.getAttribute("role");
  return role === "button" || role === "menuitem" || role === "tab";
}

function collectScopeText(element: Element, excluded: Element): string {
  if (element === excluded || excluded.contains(element)) {
    return "";
  }
  if (element.getAttribute("aria-hidden") === "true" || isScopeNoiseElement(element)) {
    return "";
  }

  let buffer = "";
  for (const child of Array.from(element.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      buffer += ` ${child.textContent ?? ""}`;
      continue;
    }
    if (isElement(child)) {
      buffer += ` ${collectScopeText(child, excluded)}`;
    }
  }

  return trimText(buffer);
}

function readScopeHeading(container: Element, excluded: Element): string | undefined {
  for (const selector of SCOPE_HEADING_SELECTORS) {
    const candidate = container.querySelector(selector);
    if (!candidate || candidate === excluded || excluded.contains(candidate)) {
      continue;
    }
    const text = sliceText(candidate.textContent ?? "", MAX_SCOPE_TEXT_LENGTH);
    if (text) {
      return text;
    }
  }
  return undefined;
}

function collectScopeTextParts(container: Element, excluded: Element): string[] {
  const parts: string[] = [];

  for (const child of Array.from(container.children)) {
    const text = sliceText(collectScopeText(child, excluded), MAX_SCOPE_TEXT_LENGTH);
    if (!text || parts.some((part) => part === text || part.includes(text) || text.includes(part))) {
      continue;
    }
    parts.push(text);
    if (parts.length >= MAX_SCOPE_TEXT_PARTS || trimText(parts.join(" ")).length >= MAX_SCOPE_TEXT_LENGTH) {
      break;
    }
  }

  if (parts.length === 0) {
    const fallback = sliceText(collectScopeText(container, excluded), MAX_SCOPE_TEXT_LENGTH);
    if (fallback) {
      parts.push(fallback);
    }
  }

  return parts;
}

function readScopeHint(
  element: Element,
  labelText?: string,
  textSample?: string,
): { scopeText: string; scopeKind: ScopeKind } | undefined {
  const scope = findScopeContainer(element);
  if (!scope) {
    return undefined;
  }

  let scopeText =
    scope.kind === "row" || scope.kind === "listitem" ? undefined : readScopeHeading(scope.container, element);
  if (!scopeText) {
    scopeText = sliceText(collectScopeTextParts(scope.container, element).join(" "), MAX_SCOPE_TEXT_LENGTH);
  }
  if (!scopeText) {
    return undefined;
  }

  const normalizedScopeText = trimText(scopeText);
  const duplicateTexts = [readAccessibleName(element), labelText, textSample]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .map((value) => trimText(value).toLowerCase());
  if (duplicateTexts.includes(normalizedScopeText.toLowerCase())) {
    return undefined;
  }

  return {
    scopeText: normalizedScopeText,
    scopeKind: scope.kind,
  };
}

function buildStrategies(element: Element): LocatorStrategy[] {
  const strategies: LocatorStrategy[] = [];

  const testId = element.getAttribute("data-testid");
  if (testId) {
    strategies.push({ kind: "testId", testId });
  }

  const role = inferRole(element);
  const name = readAccessibleName(element);
  if (role) {
    strategies.push(name ? { kind: "role", role, name } : { kind: "role", role });
  }

  const css = buildCssSelector(element);
  strategies.push({ kind: "css", selector: css });

  if (name && (role === "button" || role === "link" || role === "menuitem" || role === "tab")) {
    strategies.push({ kind: "text", text: name, exact: true });
  }

  return strategies;
}

/** 从 DOM 节点生成录制 payload（多策略 Target，执行时按优先级回退） */
export function buildInteractionPayload(
  element: Element,
  kind: "click" | "fill" | "select" | "setChecked" | "upload",
  options: {
    value?: string;
    values?: string[];
    files?: string[];
    checked?: boolean;
    inputType?: string;
  } = {},
): InteractionRecordingPayload {
  const strategies = buildStrategies(element);
  const css = strategies.find((s) => s.kind === "css");
  const roleStrategy = strategies.find((s) => s.kind === "role");
  const testIdStrategy = strategies.find((s) => s.kind === "testId");
  const textStrategy = strategies.find((s) => s.kind === "text");
  const labelText = readLabelText(element);
  const placeholder = trimText(element.getAttribute("placeholder") ?? "") || undefined;
  const nameAttr = trimText(element.getAttribute("name") ?? "") || undefined;
  const inputType =
    options.inputType ?? (isInputElement(element) ? (element.type || "text").toLowerCase() : undefined);
  const textSample = readTextSample(element, labelText);
  const scopeHint = readScopeHint(element, labelText, textSample);

  const payload: InteractionRecordingPayload = {
    strategies,
    tagName: element.tagName.toLowerCase(),
  };

  if (css && css.kind === "css") {
    payload.selector = css.selector;
  }
  if (roleStrategy && roleStrategy.kind === "role") {
    payload.role = roleStrategy.role;
    if (roleStrategy.name) {
      payload.name = roleStrategy.name;
    }
  }
  if (testIdStrategy && testIdStrategy.kind === "testId") {
    payload.testId = testIdStrategy.testId;
  }
  if (textStrategy && textStrategy.kind === "text") {
    payload.text = textStrategy.text;
    payload.exact = textStrategy.exact;
  }

  if (inputType) {
    payload.inputType = inputType;
  }
  if (nameAttr) {
    payload.nameAttr = nameAttr;
  }
  if (placeholder) {
    payload.placeholder = placeholder;
  }
  if (labelText) {
    payload.labelText = labelText;
  }
  if (textSample) {
    payload.textSample = textSample;
  }
  if (scopeHint) {
    payload.scopeText = scopeHint.scopeText;
    payload.scopeKind = scopeHint.scopeKind;
  }

  if (kind === "fill" && typeof options.value === "string") {
    payload.value = options.value;
  }
  if (kind === "select" && options.values && options.values.length > 0) {
    payload.values = options.values;
  }
  if (kind === "setChecked" && typeof options.checked === "boolean") {
    payload.checked = options.checked;
  }
  if (kind === "upload" && options.files && options.files.length > 0) {
    payload.files = options.files;
  }

  return payload;
}
