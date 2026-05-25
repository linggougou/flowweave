import { describe, expect, it } from "vitest";
import { FLOW_SCHEMA_VERSION } from "@flowweave/shared";
import { flowDocumentSchema } from "./schema.js";

describe("flowDocumentSchema", () => {
  it("校验最小合法 Flow 文档", () => {
    const doc = flowDocumentSchema.parse({
      schemaVersion: FLOW_SCHEMA_VERSION,
      id: "flow_1",
      projectId: "proj_1",
      name: "示例流程",
      variables: [],
      steps: [
        {
          id: "s1",
          type: "navigate",
          url: "https://example.com",
        },
      ],
      meta: {
        createdAt: "2026-05-25T00:00:00.000Z",
        updatedAt: "2026-05-25T00:00:00.000Z",
        source: "manual",
      },
    });
    expect(doc.name).toBe("示例流程");
  });
});
