import type { FlowDocument } from "@flowweave/flow-dsl";
import type { PageSnapshotSummary } from "@flowweave/page-intelligence";
import type {
  ExecutionResult,
  ExecutionWithProject,
  FlowVersionRecord,
  ProjectRef,
} from "@flowweave/project-knowledge";

const API_BASE =
  process.env.FLOWWEAVE_KNOWLEDGE_API ?? "http://127.0.0.1:3847";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE.replace(/\/$/, "")}${path}`, {
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
        : `知识库 API 失败: ${res.status}`,
    );
  }
  return body;
}

export async function apiListProjects(): Promise<
  Array<ProjectRef & { baseUrl?: string }>
> {
  return request("/api/projects");
}

export async function apiCreateProject(name: string): Promise<ProjectRef> {
  return request("/api/projects", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export async function apiListFlows(
  projectId: string,
): Promise<Array<{ id: string; name: string }>> {
  return request(`/api/projects/${projectId}/flows`);
}

export async function apiGetFlow(
  projectId: string,
  flowId: string,
): Promise<FlowDocument> {
  return request(`/api/projects/${projectId}/flows/${flowId}`);
}

export async function apiSaveFlow(
  projectId: string,
  flow: FlowDocument,
  changeMessage?: string,
): Promise<void> {
  await request(`/api/projects/${projectId}/flows`, {
    method: "POST",
    body: JSON.stringify({ flow, changeMessage }),
  });
}

export async function apiAllocateRunDirectory(
  projectId: string,
  executionId: string,
): Promise<string> {
  const result = await request<{ artifactDir: string }>(
    `/api/projects/${projectId}/runs`,
    {
      method: "POST",
      body: JSON.stringify({ executionId }),
    },
  );
  return result.artifactDir;
}

export async function apiSaveExecution(
  projectId: string,
  result: ExecutionResult,
): Promise<void> {
  await request(`/api/projects/${projectId}/executions`, {
    method: "POST",
    body: JSON.stringify(result),
  });
}

export async function apiSavePageSnapshot(
  projectId: string,
  summary: PageSnapshotSummary,
  snapshotPath?: string,
): Promise<void> {
  await request(`/api/projects/${projectId}/page-snapshots`, {
    method: "POST",
    body: JSON.stringify({ summary, snapshotPath }),
  });
}

export async function apiGetExecution(
  executionId: string,
): Promise<ExecutionWithProject | null> {
  try {
    return await request<ExecutionWithProject>(`/api/executions/${executionId}`);
  } catch {
    return null;
  }
}

export async function apiListExecutions(projectId: string): Promise<ExecutionResult[]> {
  return request(`/api/projects/${projectId}/executions`);
}

export async function apiListFlowVersions(
  projectId: string,
  flowId: string,
): Promise<FlowVersionRecord[]> {
  return request(`/api/projects/${projectId}/flows/${flowId}/versions`);
}

export async function apiGetFlowVersion(
  projectId: string,
  versionId: string,
): Promise<FlowDocument | null> {
  try {
    return await request<FlowDocument>(
      `/api/projects/${projectId}/flow-versions/${versionId}`,
    );
  } catch {
    return null;
  }
}

export async function apiRestoreFlowVersion(
  projectId: string,
  versionId: string,
): Promise<FlowDocument> {
  return request(`/api/projects/${projectId}/flow-versions/${versionId}/restore`, {
    method: "POST",
  });
}
