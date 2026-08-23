import type { FlowDocument } from "@flowweave/flow-dsl";
import type { PageSnapshotSummary } from "@flowweave/page-intelligence";
import type {
  ExecutionResult,
  ExecutionWithProject,
  FlowImportResult,
  FlowVersionRecord,
  ProjectKnowledgeRepository,
  ProjectRef,
} from "@flowweave/project-knowledge";

const API_BASE = process.env.FLOWWEAVE_KNOWLEDGE_API ?? "http://127.0.0.1:3847";

let localRepository: ProjectKnowledgeRepository | undefined;

export function configureLocalKnowledgeRepository(repository?: ProjectKnowledgeRepository): void {
  localRepository = repository;
}

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

export async function apiListProjects(): Promise<Array<ProjectRef & { baseUrl?: string }>> {
  if (localRepository) {
    return localRepository.listProjects().map((project) => ({
      ...project,
      baseUrl: localRepository?.getDefaultEnvironment(project.id)?.baseUrl,
    }));
  }
  return request("/api/projects");
}

export async function apiCreateProject(name: string): Promise<ProjectRef> {
  if (localRepository) {
    return localRepository.createProject(name);
  }
  return request("/api/projects", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export async function apiListFlows(
  projectId: string,
): Promise<Array<{ id: string; name: string; createdAt: string }>> {
  if (localRepository) {
    return localRepository.listFlows(projectId);
  }
  return request(`/api/projects/${projectId}/flows`);
}

export async function apiRenameFlow(
  projectId: string,
  flowId: string,
  name: string,
): Promise<{ flowId: string; name: string; createdAt: string }> {
  if (localRepository) {
    const flow = localRepository.renameFlow(projectId, flowId, name);
    return {
      flowId: flow.id,
      name: flow.name,
      createdAt: flow.meta.createdAt,
    };
  }
  return request(`/api/projects/${projectId}/flows/${flowId}`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
}

export async function apiGetFlow(projectId: string, flowId: string): Promise<FlowDocument> {
  if (localRepository) {
    const flow = localRepository.getFlowInProject(projectId, flowId);
    if (!flow) {
      throw new Error("Flow 不存在");
    }
    return flow;
  }
  return request(`/api/projects/${projectId}/flows/${flowId}`);
}

export async function apiImportFlow(
  projectId: string,
  input: unknown,
): Promise<FlowImportResult> {
  if (localRepository) {
    return localRepository.importFlow(projectId, input);
  }
  return request(`/api/projects/${projectId}/flow-imports`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function apiSaveFlow(
  projectId: string,
  flow: FlowDocument,
  changeMessage?: string,
): Promise<void> {
  if (localRepository) {
    localRepository.saveFlow(projectId, flow, changeMessage);
    return;
  }
  await request(`/api/projects/${projectId}/flows`, {
    method: "POST",
    body: JSON.stringify({ flow, changeMessage }),
  });
}

export async function apiAllocateRunDirectory(
  projectId: string,
  executionId: string,
): Promise<string> {
  if (localRepository) {
    return localRepository.allocateRunDirectory(projectId, executionId);
  }
  const result = await request<{ artifactDir: string }>(`/api/projects/${projectId}/runs`, {
    method: "POST",
    body: JSON.stringify({ executionId }),
  });
  return result.artifactDir;
}

export async function apiSaveExecution(projectId: string, result: ExecutionResult): Promise<void> {
  if (localRepository) {
    localRepository.saveExecution(projectId, result);
    return;
  }
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
  if (localRepository) {
    localRepository.savePageSnapshot(projectId, summary, snapshotPath);
    return;
  }
  await request(`/api/projects/${projectId}/page-snapshots`, {
    method: "POST",
    body: JSON.stringify({ summary, snapshotPath }),
  });
}

export async function apiGetExecution(executionId: string): Promise<ExecutionWithProject | null> {
  if (localRepository) {
    return localRepository.getExecution(executionId);
  }
  try {
    return await request<ExecutionWithProject>(`/api/executions/${executionId}`);
  } catch {
    return null;
  }
}

export async function apiListExecutions(projectId: string): Promise<ExecutionResult[]> {
  if (localRepository) {
    return localRepository.listExecutions(projectId);
  }
  return request(`/api/projects/${projectId}/executions`);
}

export async function apiListFlowVersions(
  projectId: string,
  flowId: string,
): Promise<FlowVersionRecord[]> {
  if (localRepository) {
    return localRepository.listFlowVersions(projectId, flowId);
  }
  return request(`/api/projects/${projectId}/flows/${flowId}/versions`);
}

export async function apiGetFlowVersion(
  projectId: string,
  versionId: string,
): Promise<FlowDocument | null> {
  if (localRepository) {
    return localRepository.getFlowVersion(projectId, versionId);
  }
  try {
    return await request<FlowDocument>(`/api/projects/${projectId}/flow-versions/${versionId}`);
  } catch {
    return null;
  }
}

export async function apiRestoreFlowVersion(
  projectId: string,
  versionId: string,
): Promise<FlowDocument> {
  if (localRepository) {
    return localRepository.restoreFlowVersion(projectId, versionId);
  }
  return request(`/api/projects/${projectId}/flow-versions/${versionId}/restore`, {
    method: "POST",
  });
}
