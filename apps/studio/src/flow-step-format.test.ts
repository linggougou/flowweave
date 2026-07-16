import { describe, expect, it } from "vitest";
import type { NormalizedStep } from "@flowweave/flow-dsl";

import { flowStepsToRows } from "./flow-step-format.js";

describe("flowStepsToRows 敏感信息展示", () => {
  it("密码步骤始终显示遮罩，不展示历史明文", () => {
    const steps: NormalizedStep[] = [
      {
        id: "step_password",
        type: "fill",
        target: {
          strategies: [{ kind: "css", selector: "#password" }],
          hints: { inputType: "password" },
        },
        value: "legacy-plain-password",
      },
    ];

    const [row] = flowStepsToRows(steps);

    expect(row?.summary).toBe("填写敏感信息（已隐藏）");
    expect(JSON.stringify(row)).not.toContain("legacy-plain-password");
  });

  it("旧 Flow 只有密码选择器时也默认遮罩", () => {
    const steps: NormalizedStep[] = [
      {
        id: "legacy_password",
        type: "fill",
        target: {
          strategies: [{ kind: "css", selector: "#password" }],
        },
        value: "legacy-plain-password",
      },
    ];

    const [row] = flowStepsToRows(steps);

    expect(row?.summary).toBe("填写敏感信息（已隐藏）");
    expect(JSON.stringify(row)).not.toContain("legacy-plain-password");
  });
});
