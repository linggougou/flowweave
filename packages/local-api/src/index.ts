import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import { parseFlowDocumentV1 } from "@flowweave/flow-dsl";
import {
  ProjectKnowledgeRepository,
  type ExecutionResult,
} from "@flowweave/project-knowledge";
import { FlowWeaveError } from "@flowweave/shared";

import {
  HttpBodyTooLargeError,
  InvalidJsonBodyError,
  readJsonBody,
} from "./http-utils.js";

const FLOW_IMPORT_BODY_LIMIT_BYTES = 1024 * 1024;

export interface KnowledgeApiOptions {
  repo?: ProjectKnowledgeRepository;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(body));
}

function sendApiError(
  res: ServerResponse,
  status: number,
  code: string,
  message: string,
): void {
  sendJson(res, status, { code, error: message });
}

function unwrapFlowImportBody(body: unknown): unknown {
  if (body && typeof body === "object" && !Array.isArray(body) && "flow" in body) {
    return (body as { flow?: unknown }).flow;
  }
  return body;
}

function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true;
  if (origin.startsWith("chrome-extension://")) return true;
  try {
    const url = new URL(origin);
    return (
      url.protocol === "http:" &&
      (url.hostname === "127.0.0.1" || url.hostname === "localhost")
    );
  } catch {
    return false;
  }
}

export async function handleKnowledgeApiRequest(
  req: IncomingMessage,
  res: ServerResponse,
  repo: ProjectKnowledgeRepository,
): Promise<boolean> {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const method = req.method ?? "GET";
  const pathname = url.pathname;

  if (!isAllowedOrigin(req.headers.origin)) {
    res.writeHead(403, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "不允许的请求来源" }));
    return true;
  }

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
          expectedRevision?: unknown;
        };
        const flow = parseFlowDocumentV1(body.flow ?? body);
        if (body.expectedRevision === undefined) {
          repo.saveFlow(projectId, flow, body.changeMessage ?? "扩展录制同步");
        } else {
          repo.saveFlowRevision({
            projectId,
            flowId: flow.id,
            document: { ...flow, projectId },
            expectedRevision: body.expectedRevision as number,
            changeMessage: body.changeMessage ?? "扩展录制同步",
          });
        }
        const revision = repo.getFlowRevision(projectId, flow.id);
        sendJson(res, 200, {
          flowId: flow.id,
          name: flow.name,
          projectId,
          revision: revision?.revision,
        });
      } catch (error: unknown) {
        if (error instanceof FlowWeaveError && error.code === "FLOW_REVISION_CONFLICT") {
          sendApiError(res, 409, error.code, "Flow revision 已变化");
        } else {
          sendApiError(res, 400, "INVALID_FLOW", "保存 Flow 失败");
        }
      }
      return true;
    }

    if (segments[3] === "flow-imports" && segments.length === 4 && method === "POST") {
      try {
        const body = await readJsonBody(req, {
          maxBytes: FLOW_IMPORT_BODY_LIMIT_BYTES,
        });
        const result = repo.importFlow(projectId, unwrapFlowImportBody(body));
        sendJson(res, 201, result);
      } catch (error: unknown) {
        if (error instanceof HttpBodyTooLargeError) {
          sendApiError(res, 413, "PAYLOAD_TOO_LARGE", "请求体不能超过 1 MiB");
        } else if (error instanceof InvalidJsonBodyError) {
          sendApiError(res, 400, "INVALID_JSON", "请求 JSON 格式无效");
        } else if (error instanceof FlowWeaveError && error.code === "PROJECT_NOT_FOUND") {
          sendApiError(res, 404, "PROJECT_NOT_FOUND", "目标项目不存在");
        } else if (error instanceof FlowWeaveError && error.code === "VALIDATION_FAILED") {
          sendApiError(res, 400, "INVALID_FLOW", "Flow 文档格式无效");
        } else {
          sendApiError(res, 500, "FLOW_IMPORT_FAILED", "导入 Flow 失败");
        }
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

    if (
      segments[3] === "flows" &&
      segments[5] === "export" &&
      segments.length === 6 &&
      method === "GET"
    ) {
      const flowId = segments[4];
      if (!flowId) {
        sendApiError(res, 400, "INVALID_FLOW", "缺少 flowId");
        return true;
      }
      try {
        sendJson(res, 200, repo.exportFlow(projectId, flowId));
      } catch (error: unknown) {
        if (error instanceof FlowWeaveError && error.code === "VALIDATION_FAILED") {
          sendApiError(res, 400, "INVALID_FLOW", "Flow 无法安全导出");
        } else {
          sendApiError(res, 500, "FLOW_EXPORT_FAILED", "导出 Flow 失败");
        }
      }
      return true;
    }

    if (
      segments[3] === "flow-revisions" &&
      segments.length === 5 &&
      method === "GET"
    ) {
      const flowId = segments[4];
      const revision = flowId ? repo.getFlowRevision(projectId, flowId) : null;
      if (!revision) {
        sendJson(res, 404, { error: "Flow 不存在" });
        return true;
      }
      sendJson(res, 200, revision);
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
        const body = (await readJsonBody(req)) as {
          name?: string;
          expectedRevision?: unknown;
        };
        if (!body.name?.trim()) {
          sendJson(res, 400, { error: "缺少 name" });
          return true;
        }
        if (!Number.isSafeInteger(body.expectedRevision) || (body.expectedRevision as number) < 1) {
          sendApiError(res, 400, "INVALID_EXPECTED_REVISION", "缺少 expectedRevision");
          return true;
        }
        const flow = repo.renameFlow(
          projectId,
          flowId,
          body.name,
          body.expectedRevision as number,
        );
        const revision = repo.getFlowRevision(projectId, flowId);
        sendJson(res, 200, {
          flowId: flow.id,
          name: flow.name,
          createdAt: flow.meta.createdAt,
          revision: revision?.revision,
          schemaVersion: flow.schemaVersion,
        });
      } catch (error: unknown) {
        if (error instanceof FlowWeaveError && error.code === "FLOW_REVISION_CONFLICT") {
          sendApiError(res, 409, error.code, "Flow revision 已变化");
        } else {
          sendApiError(res, 400, "FLOW_RENAME_FAILED", "重命名失败");
        }
      }
      return true;
    }

    if (segments[3] === "runs" && segments.length === 4 && method === "POST") {
      try {
        const body = await readJsonBody(req);
        const executionId =
          body && typeof body === "object" && !Array.isArray(body)
            ? (body as { executionId?: unknown }).executionId
            : undefined;
        if (typeof executionId !== "string" || !executionId) {
          sendApiError(res, 400, "INVALID_RUN_REQUEST", "运行目录请求无效");
          return true;
        }
        const artifactDir = repo.allocateRunDirectory(projectId, executionId);
        sendJson(res, 200, { artifactDir });
      } catch (error: unknown) {
        if (error instanceof FlowWeaveError && error.code === "PROJECT_NOT_FOUND") {
          sendApiError(res, 404, "PROJECT_NOT_FOUND", "目标项目不存在");
        } else if (error instanceof FlowWeaveError && error.code === "VALIDATION_FAILED") {
          sendApiError(res, 400, "INVALID_RUN_REQUEST", "运行目录请求无效");
        } else {
          sendApiError(res, 500, "RUN_ALLOCATION_FAILED", "运行目录分配失败");
        }
      }
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
      } catch (error: unknown) {
        sendJson(res, 400, { error: error instanceof Error ? error.message : "保存执行失败" });
      }
      return true;
    }

    if (segments[3] === "page-snapshots" && segments.length === 4 && method === "POST") {
      try {
        const body = (await readJsonBody(req)) as { summary?: unknown; snapshotPath?: string };
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
      } catch (error: unknown) {
        sendJson(res, 400, { error: error instanceof Error ? error.message : "保存快照失败" });
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
        const flow = repo.getFlowVersion(projectId, versionId);
        if (!flow) {
          sendJson(res, 404, { error: "版本不存在" });
          return true;
        }
        sendJson(res, 200, flow);
        return true;
      }
      if (segments.length === 6 && segments[5] === "restore" && method === "POST") {
        const flow = repo.getFlowVersion(projectId, versionId);
        if (!flow) {
          sendJson(res, 404, { error: "版本不存在" });
          return true;
        }
        const body = (await readJsonBody(req)) as { expectedRevision?: unknown };
        if (!Number.isSafeInteger(body.expectedRevision) || (body.expectedRevision as number) < 1) {
          sendApiError(res, 400, "INVALID_EXPECTED_REVISION", "缺少 expectedRevision");
          return true;
        }
        try {
          sendJson(
            res,
            200,
            repo.restoreFlowVersion(projectId, versionId, body.expectedRevision as number),
          );
        } catch (error: unknown) {
          if (error instanceof FlowWeaveError && error.code === "FLOW_REVISION_CONFLICT") {
            sendApiError(res, 409, error.code, "Flow revision 已变化");
          } else {
            sendApiError(res, 400, "FLOW_RESTORE_FAILED", "恢复 Flow 失败");
          }
        }
        return true;
      }
    }
  }

  if (
    segments[0] === "api" &&
    segments[1] === "executions" &&
    segments.length === 3 &&
    method === "GET"
  ) {
    const detail = repo.getExecution(segments[2] ?? "");
    if (!detail) {
      sendJson(res, 404, { error: "执行记录不存在" });
      return true;
    }
    sendJson(res, 200, detail);
    return true;
  }

  return false;
}

export function createKnowledgeApiServer(options: KnowledgeApiOptions = {}): Server {
  const repo = options.repo ?? new ProjectKnowledgeRepository();

  return createServer((req, res) => {
    void (async () => {
      try {
        const handled = await handleKnowledgeApiRequest(req, res, repo);
        if (!handled) {
          sendJson(res, 404, { error: "未找到接口" });
        }
      } catch (error: unknown) {
        sendJson(res, 500, { error: error instanceof Error ? error.message : "服务器错误" });
      }
    })();
  });
}
