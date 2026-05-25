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
import { flowDocumentSchema } from "./schema.js";

export function parseFlowDocument(input: unknown) {
  return flowDocumentSchema.parse(input);
}
