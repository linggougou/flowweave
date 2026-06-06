import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ExecutionRunContextPanel } from "./ExecutionRunContextPanel.js";

describe("ExecutionRunContextPanel", () => {
  it("展示本次执行的运行上下文摘要", () => {
    const html = renderToStaticMarkup(
      <ExecutionRunContextPanel
        runContext={{
          environmentName: "预发已登录",
          baseUrl: "https://staging.example.com/app",
          storageStatePath: "/tmp/flowweave/state.json",
          variables: {
            username: "alice",
            retryCount: 2,
            rememberMe: true,
          },
        }}
      />,
    );

    expect(html).toContain("本次运行上下文");
    expect(html).toContain("预发已登录");
    expect(html).toContain("https://staging.example.com/app");
    expect(html).toContain("/tmp/flowweave/state.json");
    expect(html).toContain("retryCount");
    expect(html).toContain("2");
    expect(html).toContain("rememberMe");
    expect(html).toContain("true");
  });
});
