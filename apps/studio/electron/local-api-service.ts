import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

import { createKnowledgeApiServer } from "@flowweave/local-api";
import type { ProjectKnowledgeRepository } from "@flowweave/project-knowledge";

export const DEFAULT_LOCAL_KNOWLEDGE_API_HOST = "127.0.0.1";
export const DEFAULT_LOCAL_KNOWLEDGE_API_PORT = 3847;

export type LocalKnowledgeApiService = {
  status: "owned" | "reused";
  baseUrl: string;
  close: () => Promise<void>;
};

type LocalKnowledgeApiServiceOptions = {
  repo: ProjectKnowledgeRepository;
  host?: string;
  port?: number;
};

function listen(server: Server, port: number, host: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const handleListening = () => {
      server.off("error", handleError);
      resolve();
    };
    const handleError = (error: Error) => {
      server.off("listening", handleListening);
      reject(error);
    };
    server.once("listening", handleListening);
    server.once("error", handleError);
    server.listen(port, host);
  });
}

async function closeOwnedServer(server: Server): Promise<void> {
  if (!server.listening) return;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function isCompatibleService(baseUrl: string): Promise<boolean> {
  try {
    const response = await fetch(`${baseUrl}/api/health`, {
      signal: AbortSignal.timeout(1_000),
    });
    if (!response.ok) return false;
    const body = (await response.json()) as { ok?: unknown };
    return body.ok === true;
  } catch {
    return false;
  }
}

export async function startLocalKnowledgeApiService(
  options: LocalKnowledgeApiServiceOptions,
): Promise<LocalKnowledgeApiService> {
  const host = options.host ?? DEFAULT_LOCAL_KNOWLEDGE_API_HOST;
  const port = options.port ?? DEFAULT_LOCAL_KNOWLEDGE_API_PORT;
  const server = createKnowledgeApiServer({ repo: options.repo });

  try {
    await listen(server, port, host);
  } catch (error: unknown) {
    const code = (error as NodeJS.ErrnoException).code;
    const expectedBaseUrl = `http://${host}:${port}`;
    if (code === "EADDRINUSE" && (await isCompatibleService(expectedBaseUrl))) {
      return {
        status: "reused",
        baseUrl: expectedBaseUrl,
        close: async () => undefined,
      };
    }
    if (code === "EADDRINUSE") {
      throw new Error(`端口 ${port} 已被非 FlowWeave 服务占用`, { cause: error });
    }
    throw error;
  }

  const address = server.address() as AddressInfo;
  const baseUrl = `http://${host}:${address.port}`;
  return {
    status: "owned",
    baseUrl,
    close: () => closeOwnedServer(server),
  };
}
