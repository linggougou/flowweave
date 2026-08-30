/** 本地 Web API 基址（与 @flowweave/app-web 默认端口一致） */
export const DEFAULT_KNOWLEDGE_API_BASE = "http://127.0.0.1:3847";

export type KnowledgeProject = {
  id: string;
  name: string;
  createdAt: string;
  baseUrl?: string;
};

export type SaveFlowResult = {
  flowId: string;
  name: string;
  projectId: string;
  revision: number;
};

async function getFlowRevision(
  baseUrl: string,
  projectId: string,
  flowId: string,
): Promise<number | undefined> {
  const res = await fetch(
    `${baseUrl.replace(/\/$/, "")}/api/projects/${projectId}/flow-revisions/${flowId}`,
    { headers: { "Content-Type": "application/json" } },
  );
  if (res.status === 404) {
    return undefined;
  }
  const body = (await res.json().catch(() => ({}))) as { revision?: unknown; error?: string };
  if (!res.ok || !Number.isSafeInteger(body.revision) || (body.revision as number) < 1) {
    throw new Error(body.error ?? "无法读取 Flow revision");
  }
  return body.revision as number;
}

async function requestJson<T>(
  baseUrl: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error(
      typeof body === "object" && body && "error" in body && body.error
        ? String(body.error)
        : `请求失败: ${res.status}`,
    );
  }
  return body;
}

export async function checkKnowledgeApi(baseUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/health`);
    return res.ok;
  } catch {
    return false;
  }
}

export async function listKnowledgeProjects(baseUrl: string): Promise<KnowledgeProject[]> {
  return requestJson<KnowledgeProject[]>(baseUrl, "/api/projects");
}

export async function createKnowledgeProject(
  baseUrl: string,
  name: string,
): Promise<KnowledgeProject> {
  return requestJson<KnowledgeProject>(baseUrl, "/api/projects", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export async function saveFlowToKnowledge(
  baseUrl: string,
  projectId: string,
  flow: unknown,
  changeMessage?: string,
): Promise<SaveFlowResult> {
  const flowId =
    flow && typeof flow === "object" && !Array.isArray(flow)
      ? (flow as { id?: unknown }).id
      : undefined;
  if (typeof flowId !== "string" || !flowId) {
    throw new Error("Flow id 无效");
  }
  const expectedRevision = await getFlowRevision(baseUrl, projectId, flowId);
  return requestJson<SaveFlowResult>(baseUrl, `/api/projects/${projectId}/flows`, {
    method: "POST",
    body: JSON.stringify({ flow, changeMessage, expectedRevision }),
  });
}
