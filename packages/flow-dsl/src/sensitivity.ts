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
const urlWithAuthorityPattern = /^([a-z][a-z\d+.-]*:\/\/)([^/?#]*)(.*)$/i;

export type UrlUserInfoInspection = {
  url: string;
  removed: boolean;
  variableNames: string[];
};

function decodePercentEncodingAtMostTwice(value: string): string {
  let decoded = value;
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
  return decoded;
}

/**
 * 以确定的两轮上限解码参数键，再折叠大小写及常见分隔符。
 *
 * 此函数无 Node.js 依赖，可供浏览器、Electron 与本地服务共同使用。
 */
export function normalizeSensitiveParameterKey(value: string): string {
  const decoded = decodePercentEncodingAtMostTwice(value.replace(/\+/g, " "));
  return decoded.trim().toLowerCase().replace(/[._-]/g, "");
}

export function isSensitiveParameterKey(value: string): boolean {
  return sensitiveParameterKeySet.has(normalizeSensitiveParameterKey(value));
}

/**
 * 检查 URL authority 的 userinfo，在不返回凭据字面值的前提下提取模板变量并给出安全 URL。
 * 模板识别至多进行两轮 percent decode，避免消费者各自形成不同解码策略。
 */
export function inspectUrlUserInfo(value: string): UrlUserInfoInspection {
  const match = urlWithAuthorityPattern.exec(value);
  if (!match) {
    return { url: value, removed: false, variableNames: [] };
  }

  const scheme = match[1];
  const authority = match[2];
  const rest = match[3];
  if (scheme === undefined || authority === undefined || rest === undefined) {
    return { url: value, removed: false, variableNames: [] };
  }
  const userInfoEnd = authority.lastIndexOf("@");
  if (userInfoEnd < 0) {
    return { url: value, removed: false, variableNames: [] };
  }

  const decodedUserInfo = decodePercentEncodingAtMostTwice(authority.slice(0, userInfoEnd));
  return {
    url: `${scheme}${authority.slice(userInfoEnd + 1)}${rest}`,
    removed: true,
    variableNames: [...new Set(extractTemplateVariables(decodedUserInfo))],
  };
}
import { extractTemplateVariables } from "@flowweave/shared";
