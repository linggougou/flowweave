/**
 * URL 参数键的统一敏感词表。
 *
 * 使用冻结 tuple 对外提供可审计副本；实际判定使用模块私有 Set，调用者无法修改策略。
 */
export const SENSITIVE_PARAMETER_KEYS = Object.freeze([
  "token",
  "accesstoken",
  "refreshtoken",
  "idtoken",
  "sessiontoken",
  "bearertoken",
  "apikey",
  "key",
  "secret",
  "clientsecret",
  "password",
  "passwd",
  "auth",
  "authorization",
] as const);

const sensitiveParameterKeySet: ReadonlySet<string> = new Set(SENSITIVE_PARAMETER_KEYS);

/**
 * 以确定的两轮上限解码参数键，再折叠大小写及常见分隔符。
 *
 * 此函数无 Node.js 依赖，可供浏览器、Electron 与本地服务共同使用。
 */
export function normalizeSensitiveParameterKey(value: string): string {
  let decoded = value.replace(/\+/g, " ");
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) {
        break;
      }
      decoded = next;
    } catch {
      break;
    }
  }
  return decoded.trim().toLowerCase().replace(/[._-]/g, "");
}

export function isSensitiveParameterKey(value: string): boolean {
  return sensitiveParameterKeySet.has(normalizeSensitiveParameterKey(value));
}
