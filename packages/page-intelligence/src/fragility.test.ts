import { describe, expect, it } from "vitest";
import { FLOW_SCHEMA_VERSION } from "@flowweave/shared";
import type { FlowDocument } from "@flowweave/flow-dsl";
import { analyzeFlowFragility } from "./fragility.js";

function baseFlow(steps: FlowDocument["steps"]): FlowDocument {
  const now = new Date().toISOString();
  return {
    schemaVersion: FLOW_SCHEMA_VERSION,
    id: "f1",
    projectId: "p1",
    name: "test",
    variables: [],
    steps,
    meta: { createdAt: now, updatedAt: now, source: "manual" },
  };
}

describe("analyzeFlowFragility", () => {
  it("对纯 css 步骤给出 warning", () => {
    const flow = baseFlow([
      {
        id: "s1",
        type: "click",
        target: { strategies: [{ kind: "css", selector: "#btn" }] },
      },
    ]);
    const issues = analyzeFlowFragility(flow);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.code).toBe("CSS_ONLY");
  });

  it("含 role 策略时不报 CSS_ONLY", () => {
    const flow = baseFlow([
      {
        id: "s1",
        type: "click",
        target: {
          strategies: [
            { kind: "role", role: "button", name: "提交" },
            { kind: "css", selector: "#btn" },
          ],
        },
      },
    ]);
    expect(analyzeFlowFragility(flow)).toHaveLength(0);
  });
});
