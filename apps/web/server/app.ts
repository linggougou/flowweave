import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { parseFlowDocument } from "@flowweave/flow-dsl";
import {
  ProjectKnowledgeRepository,
  type ExecutionResult,
} from "@flowweave/project-knowledge";
import { FlowWeaveError } from "@flowweave/shared";

import { readJsonBody } from "./http-utils.js";

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

async function handleApi(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  method: string,
  repo: ProjectKnowledgeRepository,
): Promise<boolean> {
  if (method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return true;
  }

  const segments = pathname.split("/").filter(Boolean);

  if (segments[0] === "api" && segments[1] === "health" && method === "GET") {
    sendJson(res, 200, { ok: true });
    return true;
  }

  if (segments[0] === "api" && segments[1] === "projects") {
    if (segments.length === 2 && method === "GET") {
      const projects = repo.listProjects().map((project) => {
        const env = repo.getDefaultEnvironment(project.id);
        return { ...project, baseUrl: env?.baseUrl };
      });
      sendJson(res, 200, projects);
      return true;
    }

    if (segments.length === 2 && method === "POST") {
      const body = (await readJsonBody(req)) as { name?: string };
      const project = repo.createProject(body.name?.trim() || "新项目");
      sendJson(res, 201, project);
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

    if (segments[3] === "flows" && segments.length === 4 && method === "POST") {
      try {
        const body = (await readJsonBody(req)) as {
          flow?: unknown;
          changeMessage?: string;
        };
        const rawFlow = body.flow ?? body;
        const flow = parseFlowDocument(rawFlow);
        repo.saveFlow(projectId, flow, body.changeMessage ?? "扩展录制同步");
        sendJson(res, 200, { flowId: flow.id, name: flow.name, projectId });
      } catch (err: unknown) {
        const message =
          err instanceof FlowWeaveError
            ? err.message
            : err instanceof Error
              ? err.message
              : "保存 Flow 失败";
        sendJson(res, 400, { error: message });
      }
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

    if (segments[3] === "flows" && segments.length === 5 && method === "PATCH") {
      const flowId = segments[4];
      if (!flowId) {
        sendJson(res, 400, { error: "缺少 flowId" });
        return true;
      }
      try {
        const body = (await readJsonBody(req)) as { name?: string };
        if (!body.name?.trim()) {
          sendJson(res, 400, { error: "缺少 name" });
          return true;
        }
        const flow = repo.renameFlow(projectId, flowId, body.name);
        sendJson(res, 200, { flowId: flow.id, name: flow.name, createdAt: flow.meta.createdAt });
      } catch (err: unknown) {
        sendJson(res, 400, {
          error: err instanceof Error ? err.message : "重命名失败",
        });
      }
      return true;
    }

    if (segments[3] === "runs" && segments.length === 4 && method === "POST") {
      const body = (await readJsonBody(req)) as { executionId?: string };
      if (!body.executionId) {
        sendJson(res, 400, { error: "缺少 executionId" });
        return true;
      }
      const artifactDir = repo.allocateRunDirectory(projectId, body.executionId);
      sendJson(res, 200, { artifactDir });
      return true;
    }

    if (segments[3] === "executions" && segments.length === 4 && method === "GET") {
      sendJson(res, 200, repo.listExecutions(projectId, 50));
      return true;
    }

    if (segments[3] === "executions" && segments.length === 4 && method === "POST") {
      try {
        const body = (await readJsonBody(req)) as ExecutionResult;
        if (!body.executionId || !body.flowId) {
          sendJson(res, 400, { error: "执行记录格式无效" });
          return true;
        }
        repo.saveExecution(projectId, body);
        sendJson(res, 200, { executionId: body.executionId });
      } catch (err: unknown) {
        sendJson(res, 400, {
          error: err instanceof Error ? err.message : "保存执行失败",
        });
      }
      return true;
    }

    if (segments[3] === "page-snapshots" && segments.length === 4 && method === "POST") {
      try {
        const body = (await readJsonBody(req)) as {
          summary?: unknown;
          snapshotPath?: string;
        };
        if (!body.summary || typeof body.summary !== "object") {
          sendJson(res, 400, { error: "缺少 summary" });
          return true;
        }
        const record = repo.savePageSnapshot(
          projectId,
          body.summary as Parameters<typeof repo.savePageSnapshot>[1],
          body.snapshotPath,
        );
        sendJson(res, 200, record);
      } catch (err: unknown) {
        sendJson(res, 400, {
          error: err instanceof Error ? err.message : "保存快照失败",
        });
      }
      return true;
    }

    if (segments[3] === "flow-versions") {
      const versionId = segments[4];
      if (!versionId) {
        sendJson(res, 400, { error: "缺少 versionId" });
        return true;
      }

      if (segments.length === 5 && method === "GET") {
        const doc = repo.getFlowVersion(projectId, versionId);
        if (!doc) {
          sendJson(res, 404, { error: "版本不存在" });
          return true;
        }
        sendJson(res, 200, doc);
        return true;
      }

      if (segments.length === 6 && segments[5] === "restore" && method === "POST") {
        const doc = repo.getFlowVersion(projectId, versionId);
        if (!doc) {
          sendJson(res, 404, { error: "版本不存在" });
          return true;
        }
        const restored = repo.restoreFlowVersion(projectId, versionId);
        sendJson(res, 200, restored);
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
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const method = req.method ?? "GET";

    void (async () => {
      try {
        const handled = await handleApi(req, res, url.pathname, method, repo);
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

        serveStatic(res, resolveStaticPath(url.pathname, clientDir));
      } catch (err: unknown) {
        sendJson(res, 500, {
          error: err instanceof Error ? err.message : "服务器错误",
        });
      }
    })();
  });
}
