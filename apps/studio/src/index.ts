import { APP_DISPLAY_NAME } from "@flowweave/ui";
import { RUNTIME_PHASE } from "@flowweave/runtime";

export const STUDIO_PHASE = "P1" as const;

export function getStudioStatus(): string {
  return `${APP_DISPLAY_NAME} studio:${STUDIO_PHASE}, runtime:${RUNTIME_PHASE}`;
}
