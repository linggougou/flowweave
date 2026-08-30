import { once } from "node:events";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  ProjectKnowledgeRepository,
  resolveProjectStorePath,
} from "@flowweave/project-knowledge";
import { FLOW_SCHEMA_VERSION, FLOW_SCHEMA_VERSION_V2 } from "@flowweave/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createKnowledgeApiServer } from "./index.js";

describe("本地知识库 API", () => {
  let dataDir = "";
  let repo: ProjectKnowledgeRepository;
  let server: Server | undefined;
  let baseUrl = "";

  beforeEach(async () => {
    dataDir = mkdtempSync(join(tmpdir(), "flowweave-local-api-"));
    repo = new ProjectKnowledgeRepository({ dataDir });
    server = createKnowledgeApiServer({ repo });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    if (server?.listening) {
      await new Promise<void>((resolve, reject) => {
        server?.close((error) => (error ? reject(error) : resolve()));
      });
    }
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("提供健康检查并允许扩展跨域访问", async () => {
    const response = await fetch(`${baseUrl}/api/health`, {
      headers: { Origin: "chrome-extension://abcdefghijklmnopabcdefghijklmnop" },
    });

    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("拒绝非本机网页读取本地知识库", async () => {
    const response = await fetch(`${baseUrl}/api/projects`, {
      headers: { Origin: "https://malicious.example" },
    });

    expect(response.status).toBe(403);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    await expect(response.json()).resolves.toEqual({ error: "不允许的请求来源" });
  });

  it("创建并列出项目", async () => {
    const createdResponse = await fetch(`${baseUrl}/api/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "首次录制" }),
    });
    const created = (await createdResponse.json()) as { id: string; name: string };

    const projectsResponse = await fetch(`${baseUrl}/api/projects`);
    const projects = (await projectsResponse.json()) as Array<{ id: string; name: string }>;

    expect(createdResponse.status).toBe(201);
    expect(created.name).toBe("首次录制");
    expect(projects).toContainEqual(expect.objectContaining(created));
  });

  it("运行目录分配拒绝非法 ID 与 ghost project，且不泄露路径", async () => {
    const project = repo.createProject("运行目录安全项目");
    const invalidExecution = await fetch(`${baseUrl}/api/projects/${project.id}/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ executionId: "../escape" }),
    });
    const invalidProject = await fetch(`${baseUrl}/api/projects/invalid.project/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ executionId: "exec_safe" }),
    });
    const missingProject = await fetch(`${baseUrl}/api/projects/ghost_project/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ executionId: "exec_safe" }),
    });

    expect(invalidExecution.status).toBe(400);
    await expect(invalidExecution.json()).resolves.toEqual({
      code: "INVALID_RUN_REQUEST",
      error: "运行目录请求无效",
    });
    expect(invalidProject.status).toBe(400);
    expect(missingProject.status).toBe(404);
    const missingBody = (await missingProject.json()) as { error: string };
    expect(missingBody.error).toBe("目标项目不存在");
    expect(missingBody.error).not.toContain(dataDir);
    expect(existsSync(resolveProjectStorePath("ghost_project", dataDir))).toBe(false);
  });

  it("保存扩展同步的 Flow", async () => {
    const projectResponse = await fetch(`${baseUrl}/api/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "同步项目" }),
    });
    const project = (await projectResponse.json()) as { id: string };
    const flow = {
      schemaVersion: FLOW_SCHEMA_VERSION,
      id: "flow_first_recording",
      projectId: project.id,
      name: "第一次录制",
      variables: [],
      steps: [{ id: "step_1", type: "navigate", url: "https://example.com" }],
      meta: {
        createdAt: "2026-07-16T00:00:00.000Z",
        updatedAt: "2026-07-16T00:00:00.000Z",
        source: "recorded",
      },
    };

    const savedResponse = await fetch(`${baseUrl}/api/projects/${project.id}/flows`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ flow, changeMessage: "扩展侧栏同步" }),
    });
    const flowsResponse = await fetch(`${baseUrl}/api/projects/${project.id}/flows`);
    const flows = (await flowsResponse.json()) as Array<{ id: string; name: string }>;

    expect(savedResponse.status).toBe(200);
    await expect(savedResponse.json()).resolves.toMatchObject({
      flowId: flow.id,
      projectId: project.id,
    });
    expect(flows).toContainEqual(expect.objectContaining({ id: flow.id, name: flow.name }));
  });

  it("旧 recorder 同步入口明确拒绝 v2 且数据库零写入", async () => {
    const project = repo.createProject("v1 同步边界项目");
    const v2Flow = {
      schemaVersion: FLOW_SCHEMA_VERSION_V2,
      id: "flow_v2_not_recorded",
      projectId: project.id,
      name: "不得经旧入口保存",
      steps: [
        {
          id: "input_name_01",
          type: "input",
          name: "运行输入",
          fields: [
            {
              fieldId: "field_name_01",
              label: "名称",
              type: "string",
              required: true,
              sensitive: false,
              remember: "never",
            },
          ],
        },
      ],
      meta: {
        createdAt: "2026-08-30T00:00:00.000Z",
        updatedAt: "2026-08-30T00:00:00.000Z",
        source: "manual",
      },
    };

    const response = await fetch(`${baseUrl}/api/projects/${project.id}/flows`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ flow: v2Flow }),
    });

    expect(response.status).toBe(400);
    expect(repo.listFlows(project.id)).toEqual([]);
    expect(repo.getFlowInProject(project.id, v2Flow.id)).toBeNull();
  });

  it("通过专用 endpoint 将裸 Flow 导入为安全新副本并返回 warnings", async () => {
    const project = repo.createProject("导入 API 项目");
    const flow = createImportFlow("project_source");

    const response = await fetch(`${baseUrl}/api/projects/${project.id}/flow-imports`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(flow),
    });
    const body = (await response.json()) as {
      flow: typeof flow;
      warnings: Array<{ code: string; variableName?: string }>;
    };

    expect(response.status).toBe(201);
    expect(body.flow.id).not.toBe(flow.id);
    expect(body.flow.projectId).toBe(project.id);
    expect(body.flow.name).toBe("API 导入流程（导入）");
    expect(body.flow.variables).toEqual([
      { name: "secret_token", type: "string", required: true },
    ]);
    expect(body.warnings).toEqual([
      expect.objectContaining({ code: "secret-default-removed", variableName: "secret_token" }),
    ]);
    expect(repo.getFlowInProject(project.id, body.flow.id)).toEqual(body.flow);
  });

  it("重复 HTTP 导入始终生成唯一 ID 与递增名称", async () => {
    const project = repo.createProject("重复导入 API 项目");
    const flow = createImportFlow("project_source");

    const imported = await Promise.all(
      [1, 2, 3].map(async () => {
        const response = await fetch(`${baseUrl}/api/projects/${project.id}/flow-imports`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(flow),
        });
        expect(response.status).toBe(201);
        return (await response.json()) as { flow: { id: string; name: string } };
      }),
    );

    expect(new Set(imported.map((result) => result.flow.id)).size).toBe(3);
    expect(imported.map((result) => result.flow.name).sort()).toEqual([
      "API 导入流程（导入 2）",
      "API 导入流程（导入 3）",
      "API 导入流程（导入）",
    ]);
  });

  it("畸形 JSON、无效 schema 与不存在项目返回准确状态且无写入", async () => {
    const project = repo.createProject("导入失败项目");
    const invalidJson = await fetch(`${baseUrl}/api/projects/${project.id}/flow-imports`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not-json",
    });
    const invalidSchema = await fetch(`${baseUrl}/api/projects/${project.id}/flow-imports`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...createImportFlow("source"), schemaVersion: 2 }),
    });
    const invalidShape = await fetch(`${baseUrl}/api/projects/${project.id}/flow-imports`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "[]",
    });
    const invalidNull = await fetch(`${baseUrl}/api/projects/${project.id}/flow-imports`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "null",
    });
    const missingProject = await fetch(`${baseUrl}/api/projects/missing_project/flow-imports`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(createImportFlow("source")),
    });

    expect(invalidJson.status).toBe(400);
    await expect(invalidJson.json()).resolves.toEqual({
      code: "INVALID_JSON",
      error: "请求 JSON 格式无效",
    });
    expect(invalidSchema.status).toBe(400);
    await expect(invalidSchema.json()).resolves.toEqual({
      code: "INVALID_FLOW",
      error: "Flow 文档格式无效",
    });
    expect(invalidShape.status).toBe(400);
    await expect(invalidShape.json()).resolves.toEqual({
      code: "INVALID_FLOW",
      error: "Flow 文档格式无效",
    });
    expect(invalidNull.status).toBe(400);
    await expect(invalidNull.json()).resolves.toEqual({
      code: "INVALID_FLOW",
      error: "Flow 文档格式无效",
    });
    expect(missingProject.status).toBe(404);
    await expect(missingProject.json()).resolves.toEqual({
      code: "PROJECT_NOT_FOUND",
      error: "目标项目不存在",
    });
    expect(repo.listFlows(project.id)).toEqual([]);
    expect(existsSync(resolveProjectStorePath("missing_project", dataDir))).toBe(false);
  });

  it("允许恰好 1 MiB 请求并对多一字节返回 413 且无副作用", async () => {
    const project = repo.createProject("导入大小边界项目");
    const acceptedBody = createSizedImportBody(1024 * 1024);
    const accepted = await fetch(`${baseUrl}/api/projects/${project.id}/flow-imports`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: acceptedBody,
    });

    expect(Buffer.byteLength(acceptedBody)).toBe(1024 * 1024);
    expect(accepted.status).toBe(201);
    const countAfterAccepted = repo.listFlows(project.id).length;

    const oversizedBody = createSizedImportBody(1024 * 1024 + 1);
    const oversized = await fetch(`${baseUrl}/api/projects/${project.id}/flow-imports`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: oversizedBody,
    });

    expect(Buffer.byteLength(oversizedBody)).toBe(1024 * 1024 + 1);
    expect(oversized.status).toBe(413);
    await expect(oversized.json()).resolves.toEqual({
      code: "PAYLOAD_TOO_LARGE",
      error: "请求体不能超过 1 MiB",
    });
    expect(repo.listFlows(project.id)).toHaveLength(countAfterAccepted);
  });
});

function createImportFlow(projectId: string) {
  return {
    schemaVersion: FLOW_SCHEMA_VERSION,
    id: "flow_api_import_source",
    projectId,
    name: "API 导入流程",
    variables: [
      {
        name: "secret_token",
        type: "string" as const,
        required: false,
        defaultValue: "do-not-import",
      },
    ],
    steps: [{ id: "open", type: "navigate" as const, url: "https://example.com" }],
    meta: {
      createdAt: "2026-05-25T00:00:00.000Z",
      updatedAt: "2026-05-25T00:00:00.000Z",
      source: "recorded" as const,
    },
  };
}

function createSizedImportBody(targetBytes: number): string {
  const flow = { ...createImportFlow("project_source"), description: "" };
  const emptyBody = JSON.stringify(flow);
  const paddingBytes = targetBytes - Buffer.byteLength(emptyBody);
  if (paddingBytes < 0) {
    throw new Error("目标请求体太小");
  }
  flow.description = "x".repeat(paddingBytes);
  return JSON.stringify(flow);
}
