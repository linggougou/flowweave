export const REDACTED_SENSITIVE_VALUE = "[已隐藏]";

export function isSensitiveVariableName(name: string): boolean {
  return /^secret(?:_|$)/i.test(name.trim());
}

export function redactSensitiveVariables<T>(
  variables?: Record<string, T>,
): Record<string, T | string> | undefined {
  if (!variables) {
    return undefined;
  }
  return Object.fromEntries(
    Object.entries(variables).map(([name, value]) => [
      name,
      isSensitiveVariableName(name) ? REDACTED_SENSITIVE_VALUE : value,
    ]),
  );
}

export function omitSensitiveVariables<T>(
  variables?: Record<string, T>,
): Record<string, T> | undefined {
  if (!variables) {
    return undefined;
  }
  return Object.fromEntries(
    Object.entries(variables).filter(([name]) => !isSensitiveVariableName(name)),
  );
}
