import { describe, expect, it } from "vitest";
import * as shared from "./index.js";

type TemplateVariableApi = {
  extractTemplateVariables?: (value: unknown) => string[];
  interpolateTemplateString?: (
    value: string,
    variables?: Record<string, unknown>,
  ) => string;
  getSingleTemplateVariableName?: (value: string) => string | null;
};

function api(): TemplateVariableApi {
  return shared as TemplateVariableApi;
}

describe("template variables", () => {
  it("提取连字符、点号与中文变量名", () => {
    const extract = api().extractTemplateVariables;
    expect(extract).toBeTypeOf("function");
    expect(extract?.("{{tenant-id}} / {{profile.name}} / {{中文变量}}")).toEqual([
      "tenant-id",
      "profile.name",
      "中文变量",
    ]);
  });

  it("只把整值占位符识别为单值变量", () => {
    const getSingleName = api().getSingleTemplateVariableName;
    expect(getSingleName).toBeTypeOf("function");
    expect(getSingleName?.("{{upload_1}}")).toBe("upload_1");
    expect(getSingleName?.("说明 {{upload_1}}")).toBeNull();
  });

  it("插值时保留缺失变量，只替换已提供变量", () => {
    const interpolate = api().interpolateTemplateString;
    expect(interpolate).toBeTypeOf("function");
    expect(
      interpolate?.("{{tenant-id}} / {{missing}}", {
        "tenant-id": "acme",
      }),
    ).toBe("acme / {{missing}}");
  });
});
