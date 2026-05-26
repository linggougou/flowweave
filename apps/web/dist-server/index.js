// server/index.ts
import { createReadStream, existsSync, statSync } from "fs";
import { createServer } from "http";
import { extname, join } from "path";
import { fileURLToPath } from "url";
import { ProjectKnowledgeRepository } from "@flowweave/project-knowledge";
var WEB_API_PORT = Number(process.env.FLOWWEAVE_WEB_PORT ?? 3847);
var repo = new ProjectKnowledgeRepository();
var serverDir = fileURLToPath(new URL(".", import.meta.url));
var clientDir = join(serverDir, "..", "dist");
var MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png"
};
function sendJson(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*"
  });
  res.end(JSON.stringify(body));
}
async function handleApi(req, res, pathname, method) {
  if (method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
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
      sendJson(res, 400, { error: "\u7F3A\u5C11 projectId" });
      return true;
    }
    if (segments[3] === "flows" && segments.length === 4 && method === "GET") {
      sendJson(res, 200, repo.listFlows(projectId));
      return true;
    }
    if (segments[3] === "flows" && segments[5] === "versions" && method === "GET") {
      const flowId = segments[4];
      if (!flowId) {
        sendJson(res, 400, { error: "\u7F3A\u5C11 flowId" });
        return true;
      }
      sendJson(res, 200, repo.listFlowVersions(projectId, flowId));
      return true;
    }
    if (segments[3] === "flows" && segments.length === 5 && method === "GET") {
      const flowId = segments[4];
      if (!flowId) {
        sendJson(res, 400, { error: "\u7F3A\u5C11 flowId" });
        return true;
      }
      const flow = repo.getFlowInProject(projectId, flowId);
      if (!flow) {
        sendJson(res, 404, { error: "Flow \u4E0D\u5B58\u5728" });
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
        sendJson(res, 400, { error: "\u7F3A\u5C11 versionId" });
        return true;
      }
      if (method === "GET") {
        const doc = repo.getFlowVersion(projectId, versionId);
        if (!doc) {
          sendJson(res, 404, { error: "\u7248\u672C\u4E0D\u5B58\u5728" });
          return true;
        }
        sendJson(res, 200, doc);
        return true;
      }
      if (method === "POST" && segments[5] === "restore") {
        try {
          const restored = repo.restoreFlowVersion(projectId, versionId);
          sendJson(res, 200, restored);
        } catch (err) {
          sendJson(res, 400, {
            error: err instanceof Error ? err.message : "\u6062\u590D\u5931\u8D25"
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
      sendJson(res, 404, { error: "\u6267\u884C\u8BB0\u5F55\u4E0D\u5B58\u5728" });
      return true;
    }
    sendJson(res, 200, detail);
    return true;
  }
  return false;
}
function serveStatic(res, filePath) {
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    res.writeHead(404);
    res.end("Not Found");
    return;
  }
  const ext = extname(filePath);
  res.writeHead(200, { "Content-Type": MIME[ext] ?? "application/octet-stream" });
  createReadStream(filePath).pipe(res);
}
function resolveStaticPath(pathname) {
  const safe = pathname === "/" ? "/index.html" : pathname;
  const filePath = join(clientDir, safe);
  if (existsSync(filePath) && statSync(filePath).isFile()) {
    return filePath;
  }
  return join(clientDir, "index.html");
}
var server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const method = req.method ?? "GET";
  void (async () => {
    try {
      const handled = await handleApi(req, res, url.pathname, method);
      if (handled) {
        return;
      }
      if (url.pathname.startsWith("/api")) {
        sendJson(res, 404, { error: "\u672A\u627E\u5230\u63A5\u53E3" });
        return;
      }
      if (method !== "GET" && method !== "HEAD") {
        sendJson(res, 405, { error: "\u65B9\u6CD5\u4E0D\u5141\u8BB8" });
        return;
      }
      serveStatic(res, resolveStaticPath(url.pathname));
    } catch (err) {
      sendJson(res, 500, {
        error: err instanceof Error ? err.message : "\u670D\u52A1\u5668\u9519\u8BEF"
      });
    }
  })();
});
server.listen(WEB_API_PORT, "127.0.0.1", () => {
  console.log(`@flowweave/app-web API: http://127.0.0.1:${WEB_API_PORT}`);
  if (existsSync(clientDir)) {
    console.log(`\u9759\u6001\u8D44\u6E90: ${clientDir}`);
  }
});
export {
  WEB_API_PORT
};
