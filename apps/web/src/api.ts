import type { FlowDocument } from "@flowweave/flow-dsl";
import type { ExecutionResult, FlowVersionRecord, ProjectRef } from "@flowweave/project-knowledge";

export type WebProject = ProjectRef & { baseUrl?: string };
export type RenameFlowResult = {
  flowId: string;
  name: string;
  createdAt: string;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `请求失败: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function listProjects(): Promise<WebProject[]> {
  return request<WebProject[]>("/api/projects");
}

export function listFlows(
  projectId: string,
): Promise<Array<{ id: string; name: string; createdAt: string }>> {
  return request(`/api/projects/${projectId}/flows`);
}

export function getFlow(projectId: string, flowId: string): Promise<FlowDocument> {
  return request(`/api/projects/${projectId}/flows/${flowId}`);
}

export function renameFlow(
  projectId: string,
  flowId: string,
  name: string,
): Promise<RenameFlowResult> {
  return request(`/api/projects/${projectId}/flows/${flowId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: name.trim() }),
  });
}

export function listFlowVersions(projectId: string, flowId: string): Promise<FlowVersionRecord[]> {
  return request(`/api/projects/${projectId}/flows/${flowId}/versions`);
}

export function getFlowVersion(projectId: string, versionId: string): Promise<FlowDocument> {
  return request(`/api/projects/${projectId}/flow-versions/${versionId}`);
}

export function restoreFlowVersion(projectId: string, versionId: string): Promise<FlowDocument> {
  return request(`/api/projects/${projectId}/flow-versions/${versionId}/restore`, {
    method: "POST",
  });
}

export function listExecutions(projectId: string): Promise<ExecutionResult[]> {
  return request(`/api/projects/${projectId}/executions`);
}

export function getExecution(executionId: string): Promise<ExecutionResult> {
  return request(`/api/executions/${executionId}`);
}
