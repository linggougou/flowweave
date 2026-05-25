/** 生成用于录制的简易 CSS 选择器（P1 占位，后续由 page-intelligence 增强） */
export function buildCssSelector(element: Element): string {
  if (element.id) {
    return `#${CSS.escape(element.id)}`;
  }

  const testId = element.getAttribute("data-testid");
  if (testId) {
    return `[data-testid="${CSS.escape(testId)}"]`;
  }

  const name = element.getAttribute("name");
  if (name && (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) {
    return `${element.tagName.toLowerCase()}[name="${CSS.escape(name)}"]`;
  }

  const parts: string[] = [];
  let current: Element | null = element;

  while (current && current !== document.documentElement) {
    let part = current.tagName.toLowerCase();
    const parent: Element | null = current.parentElement;
    if (parent) {
      const tag = current.tagName;
      const siblings = Array.from(parent.children).filter(
        (child): child is Element => child instanceof Element && child.tagName === tag,
      );
      if (siblings.length > 1) {
        const index = siblings.indexOf(current) + 1;
        part += `:nth-of-type(${index})`;
      }
    }
    parts.unshift(part);
    current = parent;
    if (parts.length >= 4) break;
  }

  return parts.join(" > ") || element.tagName.toLowerCase();
}
