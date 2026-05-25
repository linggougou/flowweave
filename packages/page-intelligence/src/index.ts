export const PAGE_INTELLIGENCE_PHASE = "P3" as const;

export type PageSnapshotRef = {
  projectId: string;
  pageId: string;
  capturedAt: string;
};
