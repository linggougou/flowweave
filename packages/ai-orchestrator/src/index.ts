export const AI_ORCHESTRATOR_PHASE = "P4" as const;

/** P4：自然语言 → Flow 草案（占位） */
export async function suggestFlowFromPrompt(
  _prompt: string,
): Promise<{ status: "pending" }> {
  return { status: "pending" };
}
