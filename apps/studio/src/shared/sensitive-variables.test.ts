import { describe, expect, it } from "vitest";

import {
  isSensitiveVariableName,
  omitSensitiveVariables,
  redactSensitiveVariables,
} from "./sensitive-variables.js";

describe("敏感运行变量", () => {
  it("只按显式 secret 命名识别，避免误伤普通业务字段", () => {
    expect(isSensitiveVariableName("secret_password")).toBe(true);
    expect(isSensitiveVariableName("SECRET_TOKEN")).toBe(true);
    expect(isSensitiveVariableName("passwordPolicy")).toBe(false);
  });

  it("落库时遮罩，恢复表单时完全省略", () => {
    const variables = { username: "alice", secret_password: "plain-secret" };

    expect(redactSensitiveVariables(variables)).toEqual({
      username: "alice",
      secret_password: "[已隐藏]",
    });
    expect(omitSensitiveVariables(variables)).toEqual({ username: "alice" });
  });
});
