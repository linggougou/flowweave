import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createKnowledgeApiServer } from "@flowweave/local-api";
import { ProjectKnowledgeRepository } from "@flowweave/project-knowledge";
import { afterEach, describe, expect, it } from "vitest";

import {
  startLocalKnowledgeApiService,
  type LocalKnowledgeApiService,
} from "./local-api-service.js";

async function closeServer(server?: Server): Promise<void> {
  if (!server?.listening) return;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

describe("Studio 本地同步服务", () => {
  let service: LocalKnowledgeApiService | undefined;
  let occupiedServer: Server | undefined;
  const dataDirs: string[] = [];

  function createRepository(): ProjectKnowledgeRepository {
    const dataDir = mkdtempSync(join(tmpdir(), "flowweave-studio-local-api-"));
    dataDirs.push(dataDir);
    return new ProjectKnowledgeRepository({ dataDir });
  }

  afterEach(async () => {
    await service?.close();
    service = undefined;
    await closeServer(occupiedServer);
    occupiedServer = undefined;
    for (const dataDir of dataDirs.splice(0)) {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it("启动自持有服务并在关闭后释放端口", async () => {
    service = await startLocalKnowledgeApiService({
      repo: createRepository(),
      port: 0,
    });

    expect(service.status).toBe("owned");
    await expect(fetch(`${service.baseUrl}/api/health`).then((response) => response.json())).resolves.toEqual({
      ok: true,
    });

    const baseUrl = service.baseUrl;
    await service.close();
    service = undefined;
    await expect(fetch(`${baseUrl}/api/health`)).rejects.toThrow();
  });

  it("兼容 API 已占用端口时复用现有服务", async () => {
    occupiedServer = createKnowledgeApiServer({ repo: createRepository() });
    occupiedServer.listen(0, "127.0.0.1");
    await once(occupiedServer, "listening");
    const port = (occupiedServer.address() as AddressInfo).port;

    service = await startLocalKnowledgeApiService({
      repo: createRepository(),
      port,
    });

    expect(service.status).toBe("reused");
    await service.close();
    expect(occupiedServer.listening).toBe(true);
  });

  it("非兼容进程占用端口时返回明确错误", async () => {
    occupiedServer = createServer((_request, response) => {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ service: "other" }));
    });
    occupiedServer.listen(0, "127.0.0.1");
    await once(occupiedServer, "listening");
    const port = (occupiedServer.address() as AddressInfo).port;

    await expect(
      startLocalKnowledgeApiService({
        repo: createRepository(),
        port,
      }),
    ).rejects.toThrow(`端口 ${port} 已被非 FlowWeave 服务占用`);
  });
});
