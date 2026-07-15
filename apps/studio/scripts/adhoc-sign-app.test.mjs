import { describe, expect, it } from "vitest";

import { adhocSignMacApp } from "./adhoc-sign-app.mjs";

describe("adhocSignMacApp", () => {
  it("对完整 app bundle 重签后执行严格校验", () => {
    const calls = [];

    adhocSignMacApp({
      appPath: "/tmp/织流 Studio.app",
      execFileSyncImpl(command, args, options) {
        calls.push({ command, args, options });
      },
    });

    expect(calls).toEqual([
      {
        command: "codesign",
        args: ["--force", "--deep", "--sign", "-", "/tmp/织流 Studio.app"],
        options: { stdio: "inherit" },
      },
      {
        command: "codesign",
        args: ["--verify", "--deep", "--strict", "/tmp/织流 Studio.app"],
        options: { stdio: "inherit" },
      },
    ]);
  });
});
