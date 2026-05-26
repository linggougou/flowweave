export type HarEntrySummary = {
  method: string;
  url: string;
  status?: number;
};

export type HarSummary = {
  entryCount: number;
  entries: HarEntrySummary[];
};

/** 解析 Playwright 导出的 minimal HAR JSON */
export function parseHarSummary(harJson: string): HarSummary {
  const parsed = JSON.parse(harJson) as {
    log?: { entries?: Array<{ request?: { method?: string; url?: string }; response?: { status?: number } }> };
  };
  const entries = parsed.log?.entries ?? [];
  return {
    entryCount: entries.length,
    entries: entries.slice(0, 50).map((e) => ({
      method: e.request?.method ?? "GET",
      url: e.request?.url ?? "",
      status: e.response?.status,
    })),
  };
}
