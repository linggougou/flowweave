import type { FlowDocument } from "@flowweave/flow-dsl";
import type {
  FragilityAnalysisContext,
  FragilityIssue,
} from "@flowweave/page-intelligence";
import { analyzeFlowFragility } from "@flowweave/page-intelligence";

import type { StudioExecutionRunContext } from "./studio-api-types.js";

export function resolveExecutionFlow(
  flowSnapshot?: FlowDocument,
  fallbackFlow?: FlowDocument,
): FlowDocument | undefined {
  return flowSnapshot ?? fallbackFlow;
}

export function toExecutionFragilityContext(
  runContext?: StudioExecutionRunContext,
): FragilityAnalysisContext | undefined {
  if (!runContext) {
    return undefined;
  }
  return {
    baseUrl: runContext.baseUrl,
    variables: runContext.variables,
  };
}

export function buildExecutionFragilityIssues(
  flow?: FlowDocument,
  runContext?: StudioExecutionRunContext,
): FragilityIssue[] | undefined {
  if (!flow) {
    return undefined;
  }
  return analyzeFlowFragility(flow, toExecutionFragilityContext(runContext));
}
