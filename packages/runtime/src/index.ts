import type { FlowDocument } from "@flowweave/flow-dsl";

export const RUNTIME_PHASE = "P1" as const;

export type ExecutionOptions = {
  headless?: boolean;
  timeoutMs?: number;
};

/** P1：基于 Playwright 执行 Flow（占位） */
export async function executeFlow(
  _flow: FlowDocument,
  _options: ExecutionOptions = {},
): Promise<{ status: "pending" }> {
  return { status: "pending" };
}
