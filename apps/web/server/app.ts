import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, type Server, type ServerResponse } from "node:http";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { handleKnowledgeApiRequest } from "@flowweave/local-api";
import { ProjectKnowledgeRepository } from "@flowweave/project-knowledge";

const serverDir = fileURLToPath(new URL(".", import.meta.url));

export const DEFAULT_CLIENT_DIR = join(serverDir, "..", "dist");

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

export interface WebServerOptions {
  clientDir?: string;
  repo?: ProjectKnowledgeRepository;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(body));
}

function serveStatic(res: ServerResponse, filePath: string): void {
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    res.writeHead(404);
    res.end("Not Found");
    return;
  }
  const ext = extname(filePath);
  res.writeHead(200, { "Content-Type": MIME[ext] ?? "application/octet-stream" });
  createReadStream(filePath).pipe(res);
}

function resolveStaticPath(pathname: string, clientDir: string): string {
  const safe = pathname === "/" ? "/index.html" : pathname;
  const filePath = join(clientDir, safe);
  if (existsSync(filePath) && statSync(filePath).isFile()) {
    return filePath;
  }
  return join(clientDir, "index.html");
}

export function createWebServer(options: WebServerOptions = {}): Server {
  const clientDir = options.clientDir ?? DEFAULT_CLIENT_DIR;
  const repo = options.repo ?? new ProjectKnowledgeRepository();

  return createServer((req, res) => {
    void (async () => {
      try {
        if (await handleKnowledgeApiRequest(req, res, repo)) {
          return;
        }

        const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
        const method = req.method ?? "GET";
        if (url.pathname.startsWith("/api")) {
          sendJson(res, 404, { error: "未找到接口" });
          return;
        }
        if (method !== "GET" && method !== "HEAD") {
          sendJson(res, 405, { error: "方法不允许" });
          return;
        }
        serveStatic(res, resolveStaticPath(url.pathname, clientDir));
      } catch (error: unknown) {
        sendJson(res, 500, { error: error instanceof Error ? error.message : "服务器错误" });
      }
    })();
  });
}
