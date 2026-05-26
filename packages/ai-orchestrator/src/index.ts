export const AI_ORCHESTRATOR_PHASE = "P4" as const;

export {
  generateFlowFromPrompt,
  type GenerateFlowOptions,
  type GenerateFlowResult,
} from "./generate.js";
export { buildHeuristicFlow, type HeuristicFlowOptions } from "./heuristic.js";

import { generateFlowFromPrompt } from "./generate.js";

/** @deprecated 使用 generateFlowFromPrompt */
export async function suggestFlowFromPrompt(prompt: string, projectId: string) {
  return generateFlowFromPrompt(prompt, { projectId });
}
