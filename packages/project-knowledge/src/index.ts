export const PROJECT_KNOWLEDGE_PHASE = "P2" as const;

export type ProjectRef = {
  id: string;
  name: string;
  createdAt: string;
};

export function getDefaultDataDir(): string {
  return "~/.flowweave/projects";
}
