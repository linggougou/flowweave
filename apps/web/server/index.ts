import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { ProjectKnowledgeRepository } from "@flowweave/project-knowledge";

const WEB_API_PORT = Number(process.env.FLOWWEAVE_WEB_PORT ?? 3847);
const repo = new ProjectKnowledgeRepository();

const serverDir = fileURLToPath(new URL(".", import.meta.url));
const clientDir = join(serverDir, "..", "dist");

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(body));
}

async function handleApi(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  method: string,
): Promise<boolean> {
  if (method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return true;
  }

  const segments = pathname.split("/").filter(Boolean);

  if (segments[0] === "api" && segments[1] === "projects" && method === "GET") {
    if (segments.length === 2) {
      const projects = repo.listProjects().map((p) => {
        const env = repo.getDefaultEnvironment(p.id);
        return { ...p, baseUrl: env?.baseUrl };
      });
      sendJson(res, 200, projects);
      return true;
    }

    const projectId = segments[2];
    if (!projectId) {
      sendJson(res, 400, { error: "缺少 projectId" });
      return true;
    }

    if (segments[3] === "flows" && segments.length === 4 && method === "GET") {
      sendJson(res, 200, repo.listFlows(projectId));
      return true;
    }

    if (segments[3] === "flows" && segments[5] === "versions" && method === "GET") {
      const flowId = segments[4];
      if (!flowId) {
        sendJson(res, 400, { error: "缺少 flowId" });
        return true;
      }
      sendJson(res, 200, repo.listFlowVersions(projectId, flowId));
      return true;
    }

    if (segments[3] === "flows" && segments.length === 5 && method === "GET") {
      const flowId = segments[4];
      if (!flowId) {
        sendJson(res, 400, { error: "缺少 flowId" });
        return true;
      }
      const flow = repo.getFlowInProject(projectId, flowId);
      if (!flow) {
        sendJson(res, 404, { error: "Flow 不存在" });
        return true;
      }
      sendJson(res, 200, flow);
      return true;
    }

    if (segments[3] === "executions" && segments.length === 4 && method === "GET") {
      sendJson(res, 200, repo.listExecutions(projectId, 50));
      return true;
    }

    if (segments[3] === "flow-versions" && segments.length === 5) {
      const versionId = segments[4];
      if (!versionId) {
        sendJson(res, 400, { error: "缺少 versionId" });
        return true;
      }

      if (method === "GET") {
        const doc = repo.getFlowVersion(projectId, versionId);
        if (!doc) {
          sendJson(res, 404, { error: "版本不存在" });
          return true;
        }
        sendJson(res, 200, doc);
        return true;
      }

      if (method === "POST" && segments[5] === "restore") {
        try {
          const restored = repo.restoreFlowVersion(projectId, versionId);
          sendJson(res, 200, restored);
        } catch (err: unknown) {
          sendJson(res, 400, {
            error: err instanceof Error ? err.message : "恢复失败",
          });
        }
        return true;
      }
    }
  }

  if (segments[0] === "api" && segments[1] === "executions" && segments.length === 3 && method === "GET") {
    const executionId = segments[2];
    const detail = repo.getExecution(executionId ?? "");
    if (!detail) {
      sendJson(res, 404, { error: "执行记录不存在" });
      return true;
    }
    sendJson(res, 200, detail);
    return true;
  }

  return false;
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

function resolveStaticPath(pathname: string): string {
  const safe = pathname === "/" ? "/index.html" : pathname;
  const filePath = join(clientDir, safe);
  if (existsSync(filePath) && statSync(filePath).isFile()) {
    return filePath;
  }
  return join(clientDir, "index.html");
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const method = req.method ?? "GET";

  void (async () => {
    try {
      const handled = await handleApi(req, res, url.pathname, method);
      if (handled) {
        return;
      }

      if (url.pathname.startsWith("/api")) {
        sendJson(res, 404, { error: "未找到接口" });
        return;
      }

      if (method !== "GET" && method !== "HEAD") {
        sendJson(res, 405, { error: "方法不允许" });
        return;
      }

      serveStatic(res, resolveStaticPath(url.pathname));
    } catch (err: unknown) {
      sendJson(res, 500, {
        error: err instanceof Error ? err.message : "服务器错误",
      });
    }
  })();
});

server.listen(WEB_API_PORT, "127.0.0.1", () => {
  console.log(`@flowweave/app-web API: http://127.0.0.1:${WEB_API_PORT}`);
  if (existsSync(clientDir)) {
    console.log(`静态资源: ${clientDir}`);
  }
});

export { WEB_API_PORT };
