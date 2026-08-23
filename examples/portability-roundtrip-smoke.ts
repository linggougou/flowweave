/**
 * P2.6 可移植往返：安全导出 → 空项目导入新副本 → 补齐变量运行 → 保存执行记录。
 *
 * 运行：pnpm e2e:portability
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { createPortableFlowDocument, type FlowDocument } from "@flowweave/flow-dsl";
import {
  ProjectKnowledgeRepository,
  type ExecutionResult as KnowledgeExecutionResult,
} from "@flowweave/project-knowledge";
import { executeFlow, type ExecutionResult as RuntimeExecutionResult } from "@flowweave/runtime";
import { FLOW_SCHEMA_VERSION } from "@flowweave/shared";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const loginFixtureUrl = pathToFileURL(join(repoRoot, "examples/fixtures/login.html")).href;
const uploadFixtureUrl = pathToFileURL(join(repoRoot, "examples/fixtures/upload-form.html")).href;

function buildLoginFlow(
  projectId: string,
  passwordLiteral: string,
  uploadFilePath: string,
): FlowDocument {
  const now = new Date().toISOString();
  return {
    schemaVersion: FLOW_SCHEMA_VERSION,
    id: "flow_portability_login_source",
    projectId,
    name: "可移植登录闭环",
    variables: [
      { name: "upload_url", type: "string", required: true },
      { name: "login_url", type: "string", required: true },
    ],
    steps: [
      {
        id: "open-upload",
        type: "navigate",
        url: "{{upload_url}}",
        waitUntil: "domcontentloaded",
      },
      {
        id: "fill-operator",
        type: "fill",
        target: { strategies: [{ kind: "css", selector: "#operator-name" }] },
        value: "portable-user",
      },
      {
        id: "upload-evidence",
        type: "upload",
        target: { strategies: [{ kind: "testId", testId: "evidence-files" }] },
        files: [uploadFilePath],
      },
      {
        id: "submit-upload",
        type: "click",
        target: { strategies: [{ kind: "css", selector: "#submit-upload" }] },
      },
      {
        id: "verify-upload",
        type: "wait",
        condition: "visible",
        target: {
          strategies: [{ kind: "css", selector: "#upload-result[data-ready='true']" }],
        },
      },
      {
        id: "open-login",
        type: "navigate",
        url: "{{login_url}}",
        waitUntil: "domcontentloaded",
      },
      {
        id: "fill-username",
        type: "fill",
        target: { strategies: [{ kind: "css", selector: "#username" }] },
        value: "portable-user",
      },
      {
        id: "fill-password",
        type: "fill",
        target: {
          strategies: [{ kind: "css", selector: "#password" }],
          hints: { inputType: "password", textSample: passwordLiteral },
        },
        value: passwordLiteral,
      },
      {
        id: "submit-login",
        type: "click",
        target: { strategies: [{ kind: "css", selector: "#submit" }] },
      },
      {
        id: "verify-login",
        type: "wait",
        condition: "visible",
        target: { strategies: [{ kind: "css", selector: "#message" }] },
      },
    ],
    meta: { createdAt: now, updatedAt: now, source: "manual" },
  };
}

function toKnowledgeExecution(
  runtime: RuntimeExecutionResult,
  flow: FlowDocument,
  startedAt: string,
  finishedAt: string,
): KnowledgeExecutionResult {
  return {
    executionId: runtime.executionId,
    flowId: flow.id,
    status:
      runtime.status === "success"
        ? "success"
        : runtime.status === "cancelled"
          ? "cancelled"
          : "failed",
    startedAt,
    finishedAt,
    flowSnapshot: flow,
    steps: runtime.steps.map((step) => ({
      stepIndex: step.stepIndex,
      stepId: step.stepId,
      status:
        step.status === "success" ? "passed" : step.status === "cancelled" ? "skipped" : "failed",
      durationMs: step.durationMs,
      errorMessage: step.message,
      screenshotPath: step.screenshotPath,
      diagnosticPath: step.diagnosticPath,
    })),
  };
}

async function main(): Promise<void> {
  const started = Date.now();
  const dataDir = await mkdtemp(join(tmpdir(), "flowweave-portability-"));

  try {
    const uploadFilePath = join(dataDir, "roundtrip-upload.txt");
    await writeFile(uploadFilePath, "flowweave portability fixture\n", "utf8");
    const repo = new ProjectKnowledgeRepository({ dataDir });
    const sourceProject = repo.createProject("可移植来源项目");
    const targetProject = repo.createProject("可移植空目标项目");
    assert.deepEqual(repo.listFlows(targetProject.id), [], "目标项目必须从空 Flow 列表开始");

    const passwordLiteral = `fixture-${randomUUID()}`;
    const sourceFlow = buildLoginFlow(sourceProject.id, passwordLiteral, uploadFilePath);
    const sourceSnapshot = JSON.parse(JSON.stringify(sourceFlow)) as FlowDocument;
    repo.saveFlow(sourceProject.id, sourceFlow);

    const portable = createPortableFlowDocument(sourceFlow);
    assert.equal(
      JSON.stringify(sourceFlow) === JSON.stringify(sourceSnapshot),
      true,
      "安全导出不得修改来源 Flow",
    );
    assert.ok(portable.warnings.length > 0, "安全导出必须返回实际处理 warnings");
    assert.ok(
      portable.warnings.some((warning) => warning.code === "password-value-variableized"),
      "密码字面量必须被变量化",
    );
    assert.ok(
      portable.warnings.some((warning) => warning.code === "upload-path-variableized"),
      "上传绝对路径必须被变量化",
    );

    const exportedJson = JSON.stringify(portable.document, null, 2);
    assert.equal(exportedJson.includes(passwordLiteral), false, "导出 JSON 不得包含密码字面量");
    assert.equal(
      exportedJson.includes(loginFixtureUrl),
      false,
      "导出 JSON 不得包含本机 fixture 路径",
    );
    assert.equal(exportedJson.includes(repoRoot), false, "导出 JSON 不得包含仓库绝对路径");
    assert.equal(exportedJson.includes(dataDir), false, "导出 JSON 不得包含临时数据路径");
    assert.equal(exportedJson.includes(uploadFilePath), false, "导出 JSON 不得包含上传绝对路径");

    const roundTrippedInput = JSON.parse(exportedJson) as unknown;
    const imported = repo.importFlow(targetProject.id, roundTrippedInput);
    assert.notEqual(imported.flow.id, sourceFlow.id, "导入必须生成新的 flowId");
    assert.equal(imported.flow.projectId, targetProject.id, "导入必须覆盖为目标 projectId");
    assert.equal(imported.flow.name, `${sourceFlow.name}（导入）`, "导入必须使用新副本名称");
    assert.deepEqual(imported.warnings, [], "已安全导出的文档再次导入不应重复产生 warning");
    assert.ok(
      imported.flow.variables.every(
        (variable) => variable.required === true && variable.defaultValue === undefined,
      ),
      "导入后的运行变量必须为 required 且不携带默认值",
    );

    const passwordWarning = portable.warnings.find(
      (warning) => warning.code === "password-value-variableized",
    );
    assert.ok(passwordWarning?.variableName, "密码 warning 必须提供运行变量名");
    const uploadWarning = portable.warnings.find(
      (warning) => warning.code === "upload-path-variableized",
    );
    assert.ok(uploadWarning?.variableName, "上传路径 warning 必须提供运行变量名");
    const runtimeVariables = {
      upload_url: uploadFixtureUrl,
      login_url: loginFixtureUrl,
      [passwordWarning.variableName]: passwordLiteral,
      [uploadWarning.variableName]: uploadFilePath,
    };
    const requiredVariableNames = imported.flow.variables
      .filter((variable) => variable.required)
      .map((variable) => variable.name)
      .sort();
    assert.deepEqual(
      Object.keys(runtimeVariables).sort(),
      requiredVariableNames,
      "运行前必须补齐全部 required 变量",
    );

    const executionId = randomUUID();
    const artifactDir = repo.allocateRunDirectory(targetProject.id, executionId);
    const executionStartedAt = new Date().toISOString();
    const runtime = await executeFlow(imported.flow, {
      headless: true,
      executionId,
      artifactDir,
      recordHar: false,
      variables: runtimeVariables,
    });
    const executionFinishedAt = new Date().toISOString();
    assert.equal(runtime.status, "success", "导入后的 login fixture Flow 必须运行成功");
    assert.equal(runtime.steps.length, imported.flow.steps.length, "全部步骤必须执行完成");

    repo.saveExecution(
      targetProject.id,
      toKnowledgeExecution(runtime, imported.flow, executionStartedAt, executionFinishedAt),
    );
    const savedExecution = repo.getExecution(executionId);
    assert.ok(savedExecution, "执行记录必须可从知识库重新读取");
    assert.equal(savedExecution.projectId, targetProject.id);
    assert.equal(savedExecution.flowId, imported.flow.id);
    assert.equal(savedExecution.status, "success");
    assert.equal(savedExecution.steps.length, imported.flow.steps.length);
    assert.deepEqual(savedExecution.flowSnapshot, imported.flow);

    console.log(
      `可移植往返 smoke 通过：warnings=${portable.warnings.length}，steps=${runtime.steps.length}，耗时=${Date.now() - started}ms`,
    );
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
