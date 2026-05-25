import { existsSync } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { FLOW_SCHEMA_VERSION } from "@flowweave/shared";
import type { FlowDocument } from "@flowweave/flow-dsl";
import { executeFlow } from "./playwright-runner.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const loginFixtureUrl = pathToFileURL(
  join(repoRoot, "examples/fixtures/login.html"),
).href;

function buildLoginFlow(): FlowDocument {
  return {
    schemaVersion: FLOW_SCHEMA_VERSION,
    id: "flow_login_fixture",
    projectId: "proj_test",
    name: "登录 Fixture 最小流程",
    variables: [],
    steps: [
      {
        id: "s1",
        type: "navigate",
        url: loginFixtureUrl,
        waitUntil: "domcontentloaded",
      },
      {
        id: "s2",
        type: "fill",
        target: { strategies: [{ kind: "css", selector: "#username" }] },
        value: "demo",
      },
      {
        id: "s3",
        type: "fill",
        target: { strategies: [{ kind: "css", selector: "#password" }] },
        value: "secret",
      },
      {
        id: "s4",
        type: "click",
        target: { strategies: [{ kind: "css", selector: "#submit" }] },
      },
    ],
    meta: {
      createdAt: "2026-05-26T00:00:00.000Z",
      updatedAt: "2026-05-26T00:00:00.000Z",
      source: "manual",
    },
  };
}

describe("executeFlow", () => {
  let artifactDir: string | undefined;

  afterEach(() => {
    if (artifactDir) {
      rmSync(artifactDir, { recursive: true, force: true });
      artifactDir = undefined;
    }
  });

  it("artifactDir 时每步写入截图文件", async () => {
    artifactDir = mkdtempSync(join(tmpdir(), "fw-runtime-artifacts-"));
    const result = await executeFlow(buildLoginFlow(), {
      headless: true,
      artifactDir,
    });
    expect(result.status).toBe("success");
    for (let i = 0; i < result.steps.length; i++) {
      const shot = join(artifactDir, `step-${i}.png`);
      expect(existsSync(shot)).toBe(true);
      expect(result.steps[i]?.screenshotPath).toBe(shot);
    }
  });

  it("对 login.html fixture 执行 navigate / fill / click 流程", async () => {
    const result = await executeFlow(buildLoginFlow(), { headless: true });

    expect(result.executionId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(result.status).toBe("success");
    expect(result.steps).toHaveLength(4);
    expect(result.steps.every((s) => s.status === "success")).toBe(true);
    expect(result.steps.map((s) => s.type)).toEqual([
      "navigate",
      "fill",
      "fill",
      "click",
    ]);
  });
});
