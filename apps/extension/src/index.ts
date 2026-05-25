import { RECORDER_PHASE } from "@flowweave/recorder";

export const EXTENSION_PHASE = "P1" as const;

export function getExtensionStatus(): string {
  return `extension:${EXTENSION_PHASE}, recorder:${RECORDER_PHASE}`;
}
