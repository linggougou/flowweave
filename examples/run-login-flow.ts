/**
 * P1 端到端：登录 fixture → Playwright 执行 → 知识库存盘
 *
 * 运行：pnpm exec tsx examples/run-login-flow.ts
 */
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { FLOW_SCHEMA_VERSION } from "@flowweave/shared";
import type { FlowDocument } from "@flowweave/flow-dsl";
import { ProjectKnowledgeRepository } from "@flowweave/project-knowledge";
import type { ExecutionResult as KnowledgeExecutionResult } from "@flowweave/project-knowledge";
import { executeFlow, type ExecutionResult as RuntimeExecutionResult } from "@flowweave/runtime";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const loginFixtureUrl = pathToFileURL(
  join(repoRoot, "examples/fixtures/login.html"),
).href;

function buildFlow(projectId: string): FlowDocument {
  const now = new Date().toISOString();
  return {
    schemaVersion: FLOW_SCHEMA_VERSION,
    id: "flow_e2e_login",
    projectId,
    name: "E2E 登录",
    variables: [],
    steps: [
      { id: "s1", type: "navigate", url: loginFixtureUrl, waitUntil: "domcontentloaded" },
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
    meta: { createdAt: now, updatedAt: now, source: "manual" },
  };
}

function toKnowledge(runtime: RuntimeExecutionResult, flowId: string): KnowledgeExecutionResult {
  return {
    executionId: runtime.executionId,
    flowId,
    status: runtime.status === "success" ? "success" : "failed",
    startedAt: runtime.steps[0]?.startedAt,
    finishedAt: new Date().toISOString(),
    steps: runtime.steps.map((s) => ({
      stepIndex: s.stepIndex,
      stepId: s.stepId,
      status: s.status === "success" ? "passed" : "failed",
      durationMs: s.durationMs,
      errorMessage: s.message,
    })),
  };
}

async function main() {
  const repo = new ProjectKnowledgeRepository();
  const project = repo.createProject(`e2e-${Date.now()}`);
  const flow = buildFlow(project.id);
  repo.saveFlow(project.id, flow);

  console.log(`项目: ${project.id}`);
  console.log(`执行 Flow: ${flow.id}`);

  const result = await executeFlow(flow, { headless: true });
  repo.saveExecution(project.id, toKnowledge(result, flow.id));

  console.log(`状态: ${result.status}`);
  console.log(`步骤: ${result.steps.length}`);
  for (const step of result.steps) {
    console.log(`  [${step.stepIndex}] ${step.stepId} ${step.status} (${step.durationMs}ms)`);
  }

  if (result.status !== "success") {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
