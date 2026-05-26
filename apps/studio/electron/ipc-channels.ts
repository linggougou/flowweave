export const IPC_CHANNELS = {
  listProjects: "studio:list-projects",
  listFlows: "studio:list-flows",
  runFlow: "studio:run-flow",
  getExecution: "studio:get-execution",
  listExecutions: "studio:list-executions",
  listFlowVersions: "studio:list-flow-versions",
  getFlowVersion: "studio:get-flow-version",
  restoreFlowVersion: "studio:restore-flow-version",
} as const;
