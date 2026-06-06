import type { FlowDocument } from "@flowweave/flow-dsl";
import type {
  FragilityAnalysisContext,
  FragilityIssue,
} from "@flowweave/page-intelligence";
import { analyzeFlowFragility } from "@flowweave/page-intelligence";

import type {
  StudioExecutionCompatibilityWarning,
  StudioExecutionRunContext,
} from "./studio-api-types.js";

export function resolveExecutionFlow(
  flowSnapshot?: FlowDocument,
  fallbackFlow?: FlowDocument,
): FlowDocument | undefined {
  return flowSnapshot ?? fallbackFlow;
}

function flowNeedsIssue(
  flowSnapshot: FlowDocument | undefined,
  context: FragilityAnalysisContext,
  code: FragilityIssue["code"],
): boolean {
  if (!flowSnapshot) {
    return false;
  }

  return analyzeFlowFragility(flowSnapshot, context).some((issue) => issue.code === code);
}

export function hasFragilityRelevantRunContext(
  runContext?: StudioExecutionRunContext,
  flowSnapshot?: FlowDocument,
): boolean {
  const needsBaseUrl = flowNeedsIssue(flowSnapshot, { baseUrl: "" }, "MISSING_ENVIRONMENT");
  const needsVariables = flowNeedsIssue(flowSnapshot, { variables: {} }, "MISSING_VARIABLE");

  if (!needsBaseUrl && !needsVariables) {
    return true;
  }

  if (!runContext) {
    return false;
  }

  const hasBaseUrl = Boolean(runContext.baseUrl?.trim());
  const hasVariables = runContext.variables !== undefined;

  if (needsBaseUrl && !hasBaseUrl) {
    return false;
  }

  if (needsVariables && !hasVariables) {
    return false;
  }

  return hasBaseUrl || hasVariables;
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

export function buildExecutionCompatibilityWarnings(input: {
  flowSnapshot?: FlowDocument;
  runContext?: StudioExecutionRunContext;
}): StudioExecutionCompatibilityWarning[] {
  const warnings: StudioExecutionCompatibilityWarning[] = [];
  const hasStoredRunContext = input.runContext !== undefined;

  if (!input.flowSnapshot) {
    warnings.push({
      code: "FLOW_SNAPSHOT_MISSING",
      severity: "warning",
      message:
        "该执行生成时尚未保存 Flow 快照，当前步骤标签与脆弱性诊断会回退到当前 Flow，可能与执行当时不完全一致。",
    });
  }

  if (
    (!input.flowSnapshot && !hasStoredRunContext) ||
    (input.flowSnapshot &&
      !hasFragilityRelevantRunContext(input.runContext, input.flowSnapshot))
  ) {
    warnings.push({
      code: "RUN_CONTEXT_MISSING",
      severity: "warning",
      message:
        "该执行未保存运行环境与变量输入，环境相关脆弱性诊断可能不完整。",
    });
  }

  return warnings;
}
