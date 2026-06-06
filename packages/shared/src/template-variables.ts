const templateVariablePattern = /\{\{\s*([^{}]+?)\s*\}\}/g;
const singleTemplateVariablePattern = /^\s*\{\{\s*([^{}]+?)\s*\}\}\s*$/;

/** 提取字符串中的模板变量名，忽略空变量与非法嵌套大括号。 */
export function extractTemplateVariables(value: unknown): string[] {
  if (typeof value !== "string") {
    return [];
  }

  return Array.from(value.matchAll(templateVariablePattern), (match) => match[1]?.trim() ?? "").filter(
    Boolean,
  );
}

/** 当整个值就是一个模板变量时，返回变量名；否则返回 null。 */
export function getSingleTemplateVariableName(value: string): string | null {
  const match = singleTemplateVariablePattern.exec(value);
  return match?.[1]?.trim() || null;
}

/** 用运行变量替换模板变量；未提供的变量保持原占位符不变。 */
export function interpolateTemplateString(
  value: string,
  variables?: Record<string, unknown>,
): string {
  if (!variables) {
    return value;
  }

  return value.replace(templateVariablePattern, (match, variableName: string) => {
    const resolved = variables[variableName.trim()];
    return resolved === undefined ? match : String(resolved);
  });
}
