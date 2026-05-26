import { FLOW_SCHEMA_VERSION } from "@flowweave/shared";
import type { FlowDocument } from "@flowweave/flow-dsl";

export type HeuristicFlowOptions = {
  projectId: string;
  baseUrl?: string;
};

/** 无 LLM API Key 时的规则化 Flow 草案（P4 回退） */
export function buildHeuristicFlow(prompt: string, options: HeuristicFlowOptions): FlowDocument {
  const now = new Date().toISOString();
  const baseUrl = options.baseUrl ?? "https://example.com";
  const lower = prompt.toLowerCase();

  const steps: FlowDocument["steps"] = [
    {
      id: "s1",
      type: "navigate",
      url: baseUrl,
      waitUntil: "domcontentloaded",
    },
  ];

  if (lower.includes("登录") || lower.includes("login")) {
    steps.push(
      {
        id: "s2",
        type: "fill",
        target: { strategies: [{ kind: "css", selector: "#username" }] },
        value: "demo",
      },
      {
        id: "s3",
        type: "fill",
        target: { strategies: [{ kind: "css", selector: "#password" }] },
        value: "secret",
      },
      {
        id: "s4",
        type: "click",
        target: { strategies: [{ kind: "css", selector: "#submit" }] },
      },
    );
  }

  return {
    schemaVersion: FLOW_SCHEMA_VERSION,
    id: `flow_ai_${Date.now()}`,
    projectId: options.projectId,
    name: prompt.slice(0, 40) || "AI 生成流程",
    description: "由启发式编排生成（未调用 LLM）",
    variables: [],
    steps,
    meta: {
      createdAt: now,
      updatedAt: now,
      source: "ai",
    },
  };
}
