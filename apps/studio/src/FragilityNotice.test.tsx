import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { FragilityIssue } from "@flowweave/page-intelligence";

import { FragilityNotice } from "./FragilityNotice.js";

describe("FragilityNotice", () => {
  it("把 fragility 问题转成建议动作而不只是重复错误文案", () => {
    const warnings: FragilityIssue[] = [
      {
        stepId: "s1",
        stepIndex: 0,
        code: "MISSING_ENVIRONMENT",
        message: "流程包含相对地址，但当前没有可用 baseUrl，真实页面回放会直接失败",
        severity: "error",
      },
      {
        stepId: "s2",
        stepIndex: 1,
        code: "CSS_ONLY",
        message: "仅使用 CSS 选择器，页面变更后易失效，建议补充 role/testId",
        severity: "warning",
      },
    ];

    const html = renderToStaticMarkup(<FragilityNotice warnings={warnings} />);

    expect(html).toContain("建议动作");
    expect(html).toContain("Base URL");
    expect(html).toContain("role/testId");
  });
});
