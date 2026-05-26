export type PageSnapshotSummary = {
  url: string;
  title: string;
  formCount: number;
  buttonCount: number;
  linkCount: number;
  capturedAt: string;
};

export type PageSnapshotInput = {
  url: string;
  title: string;
  formCount: number;
  buttonCount: number;
  linkCount: number;
};

/** 由 runtime 传入 page.evaluate 结果，生成可持久化的页面摘要 */
export function buildPageSnapshotSummary(input: PageSnapshotInput): PageSnapshotSummary {
  return {
    url: input.url,
    title: input.title,
    formCount: input.formCount,
    buttonCount: input.buttonCount,
    linkCount: input.linkCount,
    capturedAt: new Date().toISOString(),
  };
}
