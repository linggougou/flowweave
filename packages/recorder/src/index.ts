export { RECORDER_PHASE } from "./constants.js";
export {
  buildFlowFromEvents,
  normalizeRecordedEvent,
  type BuildFlowFromEventsMeta,
} from "./normalize.js";
export {
  buildInteractionPayload,
  buildRecordedFillValue,
  isVisibleElement,
  resolveClickTarget,
  shouldRecordClick,
  shouldRecordFill,
  type InteractionRecordingPayload,
} from "./target-from-dom.js";
export { filterNoisyInteractionSteps, mergeConsecutiveFillSteps } from "./step-filter.js";
