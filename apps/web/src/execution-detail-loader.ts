import type { ExecutionResult } from "@flowweave/project-knowledge";

type DetailHandlers = {
  onSuccess: (executionId: string, detail: ExecutionResult) => void;
  onError: (executionId: string, error: unknown) => void;
};

export function createExecutionDetailLoader(
  fetchExecution: (executionId: string) => Promise<ExecutionResult>,
) {
  let latestRequest = 0;

  return {
    load(executionId: string, handlers: DetailHandlers): () => void {
      const requestId = ++latestRequest;
      let cancelled = false;

      void fetchExecution(executionId)
        .then((detail) => {
          if (detail.executionId !== executionId) {
            throw new Error("运行详情与当前选择不一致");
          }
          if (!cancelled && requestId === latestRequest) {
            handlers.onSuccess(executionId, detail);
          }
        })
        .catch((error: unknown) => {
          if (!cancelled && requestId === latestRequest) {
            handlers.onError(executionId, error);
          }
        });

      return () => {
        cancelled = true;
        if (requestId === latestRequest) latestRequest += 1;
      };
    },
  };
}
