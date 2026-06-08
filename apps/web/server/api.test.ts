import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ProjectKnowledgeRepository } from "@flowweave/project-knowledge";
import { FLOW_SCHEMA_VERSION } from "@flowweave/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createWebServer } from "./app.js";

function buildFlow(projectId: string, flowId: string, name = "流程 A") {
  return {
    schemaVersion: FLOW_SCHEMA_VERSION,
    id: flowId,
    projectId,
    name,
    variables: [],
    steps: [{ id: "s1", type: "navigate" as const, url: "https://example.com" }],
    meta: {
      createdAt: "2026-05-25T10:00:00.000Z",
      updatedAt: "2026-05-25T10:00:00.000Z",
      source: "recorded" as const,
    },
  };
}

async function startServer(repo: ProjectKnowledgeRepository): Promise<{
  server: Server;
  baseUrl: string;
}> {
  const server = createWebServer({ repo });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
}

async function stopServer(server?: Server): Promise<void> {
  if (!server?.listening) {
    return;
  }
  await new Promise<void>((resolve, reject) => {
    server.close((err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}

describe("web API HTTP 路由", () => {
  let dataDir = "";
  let server: Server | undefined;
  let baseUrl = "";
  let repo: ProjectKnowledgeRepository;
  let projectId = "";
  let flowId = "";
  let historyVersionId = "";

  beforeEach(async () => {
    dataDir = mkdtempSync(join(tmpdir(), "flowweave-web-http-"));
    repo = new ProjectKnowledgeRepository({ dataDir });

    const project = repo.createProject("Web HTTP 测试");
    projectId = project.id;
    flowId = "flow_web_restore";

    const v1 = buildFlow(projectId, flowId, "流程 A");
    repo.saveFlow(projectId, v1);
    repo.saveFlow(
      projectId,
      {
        ...v1,
        name: "流程 B",
        steps: [
          ...v1.steps,
          {
            id: "s2",
            type: "click" as const,
            target: { strategies: [{ kind: "css" as const, selector: "button" }] },
          },
        ],
      },
      "新增点击步骤",
    );

    const versions = repo.listFlowVersions(projectId, flowId);
    historyVersionId = versions[0]!.id;

    const started = await startServer(repo);
    server = started.server;
    baseUrl = started.baseUrl;
  });

  afterEach(async () => {
    await stopServer(server);
    server = undefined;
    baseUrl = "";
    if (dataDir) {
      rmSync(dataDir, { recursive: true, force: true });
      dataDir = "";
    }
  });

  it("GET /api/projects/:projectId/flow-versions/:versionId 返回历史版本", async () => {
    const response = await fetch(
      `${baseUrl}/api/projects/${projectId}/flow-versions/${historyVersionId}`,
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      id: string;
      name: string;
      steps: Array<unknown>;
    };
    expect(body.id).toBe(flowId);
    expect(body.name).toBe("流程 A");
    expect(body.steps).toHaveLength(1);
  });

  it("POST /api/projects/:projectId/flow-versions/:versionId/restore 恢复当前 flow", async () => {
    const beforeRestore = repo.getFlowInProject(projectId, flowId);
    expect(beforeRestore?.name).toBe("流程 B");
    expect(beforeRestore?.steps).toHaveLength(2);

    const response = await fetch(
      `${baseUrl}/api/projects/${projectId}/flow-versions/${historyVersionId}/restore`,
      { method: "POST" },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      id: string;
      name: string;
      steps: Array<unknown>;
    };
    expect(body.id).toBe(flowId);
    expect(body.name).toBe("流程 A");
    expect(body.steps).toHaveLength(1);

    const restored = repo.getFlowInProject(projectId, flowId);
    expect(restored?.name).toBe("流程 A");
    expect(restored?.steps).toHaveLength(1);
  });

  it("POST restore 在 versionId 不存在时返回 404", async () => {
    const response = await fetch(
      `${baseUrl}/api/projects/${projectId}/flow-versions/missing-version/restore`,
      { method: "POST" },
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: "版本不存在",
    });
  });
});
