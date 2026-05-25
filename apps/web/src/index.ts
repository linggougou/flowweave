import { PROJECT_KNOWLEDGE_PHASE } from "@flowweave/project-knowledge";

export const WEB_PHASE = "P2" as const;

export function getWebStatus(): string {
  return `web:${WEB_PHASE}, knowledge:${PROJECT_KNOWLEDGE_PHASE}`;
}
