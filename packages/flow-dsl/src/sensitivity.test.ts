import { describe, expect, it } from "vitest";

import {
  SENSITIVE_PARAMETER_KEYS,
  isSensitiveParameterKey,
  normalizeSensitiveParameterKey,
} from "./index.js";

describe("统一敏感参数键合同", () => {
  it.each([
    ["key", "key"],
    ["AcCeSs_ToKeN", "accesstoken"],
    ["client.secret", "clientsecret"],
    ["api-key", "apikey"],
    ["api_key", "apikey"],
    ["%61%70%69%5F%6B%65%79", "apikey"],
    ["%2561%2570%2569%255F%256B%2565%2579", "apikey"],
  ])("将 %s 有限规范化为 %s", (raw, normalized) => {
    expect(normalizeSensitiveParameterKey(raw)).toBe(normalized);
    expect(isSensitiveParameterKey(raw)).toBe(true);
  });

  it.each([
    "monkey",
    "password_policy",
    "authentication",
    "%252561%252570%252569%25255F%25256B%252565%252579",
  ])("不把安全近似词或第三层编码 %s 判为敏感键", (raw) => {
    expect(isSensitiveParameterKey(raw)).toBe(false);
  });

  it("导出的审计词表是冻结只读副本且包含明确最小集合", () => {
    expect(Object.isFrozen(SENSITIVE_PARAMETER_KEYS)).toBe(true);
    expect(SENSITIVE_PARAMETER_KEYS).toEqual(
      expect.arrayContaining(["token", "key", "secret", "password", "auth"]),
    );
  });
});
