export const PAGE_INTELLIGENCE_PHASE = "P3" as const;

export { analyzeFlowFragility, type FragilityIssue } from "./fragility.js";
export {
  buildPageSnapshotSummary,
  type PageSnapshotInput,
  type PageSnapshotSummary,
} from "./snapshot.js";
