import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ProjectKnowledgeRepository } from "@flowweave/project-knowledge";
import { FLOW_SCHEMA_VERSION } from "@flowweave/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createKnowledgeApiServer } from "./index.js";

describe("本地知识库 API", () => {
  let dataDir = "";
  let server: Server | undefined;
  let baseUrl = "";

  beforeEach(async () => {
    dataDir = mkdtempSync(join(tmpdir(), "flowweave-local-api-"));
    const repo = new ProjectKnowledgeRepository({ dataDir });
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
});
