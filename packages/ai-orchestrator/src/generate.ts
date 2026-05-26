import { parseFlowDocument, type FlowDocument } from "@flowweave/flow-dsl";
import { FlowWeaveError } from "@flowweave/shared";

import { buildHeuristicFlow } from "./heuristic.js";

export type GenerateFlowOptions = {
  projectId: string;
  baseUrl?: string;
  /** 未来接入 AI SDK；当前仅启发式 */
  preferLlm?: boolean;
};

export type GenerateFlowResult = {
  flow: FlowDocument;
  source: "heuristic" | "llm";
};

/**
 * 自然语言 → Flow 草案，输出经 Zod 校验。
 * P4：无 API Key 时使用启发式；配置 LLM 后扩展 preferLlm 分支。
 */
export async function generateFlowFromPrompt(
  prompt: string,
  options: GenerateFlowOptions,
): Promise<GenerateFlowResult> {
  const trimmed = prompt.trim();
  if (!trimmed) {
    throw new FlowWeaveError("VALIDATION_FAILED", "prompt 不能为空");
  }

  const draft = buildHeuristicFlow(trimmed, {
    projectId: options.projectId,
    baseUrl: options.baseUrl,
  });

  const flow = parseFlowDocument(draft);
  return { flow, source: "heuristic" };
}
