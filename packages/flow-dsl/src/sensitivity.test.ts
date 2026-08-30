import { describe, expect, it } from "vitest";

import {
  SENSITIVE_PARAMETER_KEYS,
  inspectUrlUserInfo,
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

  it.each([
    ["raw username", "https://{{username}}:literal@example.test/path", ["username"]],
    ["raw password", "https://literal:{{password}}@example.test/path", ["password"]],
    [
      "raw multiple",
      "https://{{username}}:prefix-{{password}}-{{tenant}}@example.test/path",
      ["username", "password", "tenant"],
    ],
    [
      "single encoded",
      "https://%7B%7Busername%7D%7D:%7B%7Bpassword%7D%7D@example.test/path",
      ["username", "password"],
    ],
    [
      "double encoded",
      "https://%257B%257Busername%257D%257D:%257B%257Bpassword%257D%257D@example.test/path",
      ["username", "password"],
    ],
  ])("识别并移除 %s userinfo", (_label, value, variableNames) => {
    expect(inspectUrlUserInfo(value)).toEqual({
      url: "https://example.test/path",
      removed: true,
      variableNames,
    });
  });

  it.each([
    [
      "变量前存在非法 percent",
      "https://bad%ZZ%7B%7Busername%7D%7D:literal@example.test/path",
      ["username"],
    ],
    [
      "变量后存在非法 percent",
      "https://literal:%7B%7Bpassword%7D%7D%ZZ@example.test/path",
      ["password"],
    ],
    [
      "同侧多个变量中间存在非法 percent",
      "https://%7B%7Busername%7D%7D%ZZ%7B%7Btenant%7D%7D:literal@example.test/path",
      ["username", "tenant"],
    ],
    [
      "另一侧存在非法 percent",
      "https://bad%ZZ:%7B%7Bpassword%7D%7D@example.test/path",
      ["password"],
    ],
    [
      "两层编码变量前存在非法 percent",
      "https://%ZZ%257B%257Busername%257D%257D:literal@example.test/path",
      ["username"],
    ],
    [
      "两层编码变量后存在非法 percent",
      "https://literal:%257B%257Bpassword%257D%257D%ZZ@example.test/path",
      ["password"],
    ],
    [
      "合法 Unicode 与模板位于同一连续 run",
      "https://%E9%9B%AA%7B%7Busername%7D%7D:literal@example.test/path",
      ["username"],
    ],
    [
      "无效 UTF-8 token 与模板位于同一连续 run",
      "https://%FF%7B%7Busername%7D%7D:literal@example.test/path",
      ["username"],
    ],
  ])("容错解码 %s 且不返回 userinfo", (_label, value, variableNames) => {
    expect(inspectUrlUserInfo(value)).toEqual({
      url: "https://example.test/path",
      removed: true,
      variableNames,
    });
  });

  it("第三层编码模板不越过两轮上限并以固定无值错误 fail closed", () => {
    const value = "https://%25257B%25257Bcredential%25257D%25257D:literal@example.test/path";

    expect(() => inspectUrlUserInfo(value)).toThrowError(
      "URL userinfo percent 编码层级超出安全上限",
    );
    try {
      inspectUrlUserInfo(value);
    } catch (error) {
      expect(JSON.stringify(error)).not.toContain("credential");
      expect(JSON.stringify(error)).not.toContain("example.test");
    }
  });

  it.each([
    "https://example.test/path?user={{username}}",
    "/relative/path?state={{state}}",
    "https://example.test/path#{{fragment}}",
  ])("无 userinfo 时保持 %s 且不误判变量", (value) => {
    expect(inspectUrlUserInfo(value)).toEqual({ url: value, removed: false, variableNames: [] });
  });
});
