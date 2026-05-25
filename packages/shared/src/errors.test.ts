import { describe, expect, it } from "vitest";
import { FlowWeaveError } from "./errors.js";

describe("FlowWeaveError", () => {
  it("保留错误码与详情", () => {
    const err = new FlowWeaveError("VALIDATION_FAILED", "校验失败", { field: "name" });
    expect(err.code).toBe("VALIDATION_FAILED");
    expect(err.details).toEqual({ field: "name" });
    expect(err.name).toBe("FlowWeaveError");
  });
});
