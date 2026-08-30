import type { AnyFlowDocument, FlowDocument } from "@flowweave/flow-dsl";
import type {
  ExecutionResult,
  ExecutionWithProject,
  FlowRevisionRecord,
  FlowVersionRecord,
} from "@flowweave/project-knowledge";

import type {
  ExecutionStepLog,
  ExecutionSummary,
  RunFlowResult,
  StudioApi,
  StudioExecution,
  StudioFlowRef,
  StudioFlowVersion,
  StudioFlowRunInput,
  StudioProject,
  StudioProjectEnvironment,
} from "./shared/studio-api-types.js";
import { mapStoredExecutionToStudioExecution } from "./shared/execution-history.js";

const KNOWLEDGE_API = import.meta.env.VITE_FLOWWEAVE_KNOWLEDGE_API ?? "http://127.0.0.1:3847";

const HTTP_FALLBACK_METHODS = [
  "listProjects",
  "createProject",
  "listFlows",
  "renameFlow",
  "getFlow",
  "getFlowRunInput",
  "listExecutions",
  "getExecution",
  "listFlowVersions",
  "getFlowVersion",
  "restoreFlowVersion",
] as const satisfies ReadonlyArray<keyof StudioApi>;

type HttpFallbackMethod = (typeof HTTP_FALLBACK_METHODS)[number];

async function knowledgeRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${KNOWLEDGE_API.replace(/\/$/, "")}${path}`, {
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

export function mapExecutionStatusToStudio(
  status: ExecutionResult["status"],
): StudioExecution["status"] {
  if (status === "success") {
    return "passed";
  }
  if (status === "cancelled") {
    return "cancelled";
  }
  return "failed";
}

function toExecutionSummary(item: ExecutionResult): ExecutionSummary {
  return {
    executionId: item.executionId,
    flowId: item.flowId,
    status: mapExecutionStatusToStudio(item.status),
    startedAt: item.startedAt,
    finishedAt: item.finishedAt,
    environmentName: item.runContext?.environmentName,
  };
}

function toStudioFlowRunInput(item: ExecutionResult): StudioFlowRunInput | null {
  if (!item.runContext) {
    return null;
  }
  return {
    executionId: item.executionId,
    finishedAt: item.finishedAt,
    environmentName: item.runContext.environmentName,
    baseUrl: item.runContext.baseUrl,
    storageStatePath: item.runContext.storageStatePath,
    variables: item.runContext.variables
      ? Object.fromEntries(
          Object.entries(item.runContext.variables).map(([name, value]) => [name, String(value)]),
        )
      : undefined,
  };
}

function toStudioFlowVersion(record: FlowVersionRecord): StudioFlowVersion {
  return {
    id: record.id,
    flowId: record.flowId,
    version: record.version,
    name: record.name,
    stepCount: record.stepCount,
    createdAt: record.createdAt,
    changeMessage: record.changeMessage,
  };
}

function buildFallbackEnvironments(baseUrl?: string): StudioProjectEnvironment[] {
  if (!baseUrl) {
    return [];
  }
  return [
    {
      name: "默认环境",
      baseUrl,
      isDefault: true,
    },
  ];
}

const knowledgeHttpClient: Pick<StudioApi, HttpFallbackMethod> = {
  listProjects: async (): Promise<StudioProject[]> => {
    const projects =
      await knowledgeRequest<Array<StudioProject & { baseUrl?: string }>>("/api/projects");
    return projects.map((project) => ({
      id: project.id,
      name: project.name,
      createdAt: project.createdAt,
      baseUrl: project.baseUrl,
      environments: project.environments ?? buildFallbackEnvironments(project.baseUrl),
    }));
  },

  createProject: async (name: string): Promise<StudioProject> => {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new Error("项目名称不能为空");
    }
    return knowledgeRequest<StudioProject>("/api/projects", {
      method: "POST",
      body: JSON.stringify({ name: trimmed }),
    }).then((project) => ({
      ...project,
      environments: project.environments ?? buildFallbackEnvironments(project.baseUrl),
    }));
  },

  listFlows: (projectId: string): Promise<StudioFlowRef[]> =>
    knowledgeRequest(`/api/projects/${projectId}/flows`),

  renameFlow: async (
    projectId: string,
    flowId: string,
    name: string,
    expectedRevision: number,
  ): Promise<StudioFlowRef> => {
    const result = await knowledgeRequest<{
      flowId: string;
      name: string;
      createdAt: string;
      revision: number;
      schemaVersion: number;
    }>(
      `/api/projects/${projectId}/flows/${flowId}`,
      {
        method: "PATCH",
        body: JSON.stringify({ name, expectedRevision }),
      },
    );
    return {
      id: result.flowId,
      name: result.name,
      createdAt: result.createdAt,
      revision: result.revision,
      schemaVersion: result.schemaVersion,
    };
  },

  getFlow: (projectId: string, flowId: string): Promise<FlowDocument> =>
    knowledgeRequest(`/api/projects/${projectId}/flows/${flowId}`),

  getFlowRunInput: async (
    projectId: string,
    flowId: string,
  ): Promise<StudioFlowRunInput | null> => {
    const items = await knowledgeRequest<ExecutionResult[]>(
      `/api/projects/${projectId}/executions`,
    );
    const recent = items.find((item) => item.flowId === flowId && item.runContext);
    return recent ? toStudioFlowRunInput(recent) : null;
  },

  listExecutions: async (projectId: string): Promise<ExecutionSummary[]> => {
    const items = await knowledgeRequest<ExecutionResult[]>(
      `/api/projects/${projectId}/executions`,
    );
    return items.slice(0, 5).map(toExecutionSummary);
  },

  getExecution: async (executionId: string): Promise<StudioExecution | null> => {
    try {
      const stored = await knowledgeRequest<ExecutionWithProject>(`/api/executions/${executionId}`);
      let flow: FlowDocument | undefined;
      if (!stored.flowSnapshot) {
        try {
          flow = await knowledgeRequest<FlowDocument>(
            `/api/projects/${stored.projectId}/flows/${stored.flowId}`,
          );
        } catch {
          flow = undefined;
        }
      }
      return mapStoredExecutionToStudioExecution(stored, {
        fallbackFlow: flow,
        decorateStep: (step) => {
          const storedStep = step as ExecutionWithProject["steps"][number] &
            Partial<ExecutionStepLog>;
          return {
            diagnostic: storedStep.diagnostic,
            hasDiagnostic: Boolean(storedStep.diagnostic),
            hasPageSnapshot: Boolean(storedStep.pageSnapshot),
            pageSnapshot: storedStep.pageSnapshot,
          };
        },
      });
    } catch {
      return null;
    }
  },

  listFlowVersions: async (projectId: string, flowId: string): Promise<StudioFlowVersion[]> => {
    const list = await knowledgeRequest<FlowVersionRecord[]>(
      `/api/projects/${projectId}/flows/${flowId}/versions`,
    );
    return list.map(toStudioFlowVersion);
  },

  getFlowVersion: async (
    projectId: string,
    flowId: string,
    versionId: string,
  ): Promise<AnyFlowDocument | null> => {
    try {
      return await knowledgeRequest<AnyFlowDocument>(
        `/api/projects/${projectId}/flow-versions/${versionId}?flowId=${encodeURIComponent(flowId)}`,
      );
    } catch {
      return null;
    }
  },

  restoreFlowVersion: (
    projectId: string,
    flowId: string,
    versionId: string,
    expectedRevision: number,
  ): Promise<FlowRevisionRecord> =>
    knowledgeRequest(`/api/projects/${projectId}/flow-versions/${versionId}/restore`, {
      method: "POST",
      body: JSON.stringify({ flowId, expectedRevision }),
    }),
};

function isHttpFallbackMethod(prop: string): prop is HttpFallbackMethod {
  return (HTTP_FALLBACK_METHODS as readonly string[]).includes(prop);
}

function createBrowserStudioApi(): StudioApi {
  return {
    nativeFilePortability: false,
    nativeExecutionDeletion: false,
    nativeExecutionScreenshotPreview: false,
    ...knowledgeHttpClient,
    getFlowRunInput: knowledgeHttpClient.getFlowRunInput,
    runFlow: async (): Promise<RunFlowResult> => {
      throw new Error("流程运行需在 Electron Studio 中执行，请先运行 pnpm dev:studio");
    },
    importFlowFile: async () => {
      throw new Error("导入 JSON 仅支持 Electron Studio");
    },
    exportFlowFile: async () => {
      throw new Error("导出 JSON 仅支持 Electron Studio");
    },
    getExecutionScreenshotPreview: async () => {
      throw new Error("执行截图预览仅支持 Electron Studio");
    },
  };
}

function createHybridStudioApi(electron: StudioApi): StudioApi {
  return new Proxy(electron, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value === "function") {
        return value.bind(target);
      }
      const methodName = String(prop);
      if (isHttpFallbackMethod(methodName)) {
        return knowledgeHttpClient[methodName].bind(knowledgeHttpClient);
      }
      return value;
    },
  });
}

/** 获取 Studio API：优先 Electron IPC；缺失方法时回退知识库 HTTP（需 dev:web） */
export function getStudioApi(): StudioApi {
  const electron = window.flowweaveStudio;
  if (!electron) {
    return createBrowserStudioApi();
  }
  const missing = HTTP_FALLBACK_METHODS.filter((method) => typeof electron[method] !== "function");
  if (missing.length === 0) {
    return electron;
  }
  return createHybridStudioApi(electron);
}
