export const IPC_CHANNELS = {
  listProjects: "studio:list-projects",
  listFlows: "studio:list-flows",
  getFlow: "studio:get-flow",
  renameFlow: "studio:rename-flow",
  runFlow: "studio:run-flow",
  getExecution: "studio:get-execution",
  createProject: "studio:create-project",
  listExecutions: "studio:list-executions",
  listFlowVersions: "studio:list-flow-versions",
  getFlowVersion: "studio:get-flow-version",
  restoreFlowVersion: "studio:restore-flow-version",
  openPath: "studio:open-path",
} as const;
