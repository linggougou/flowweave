export {
  flowDocumentSchema,
  locatorStrategySchema,
  normalizedStepSchema,
  targetSchema,
  variableDefSchema,
  type FlowDocument,
  type NormalizedStep,
  type Target,
} from "./schema.js";
export {
  createPortableFlowDocument,
  type FlowPortabilityWarning,
  type FlowPortabilityWarningCode,
  type PortableFlowDocumentResult,
} from "./portability.js";
import { flowDocumentSchema } from "./schema.js";

export function parseFlowDocument(input: unknown) {
  return flowDocumentSchema.parse(input);
}
