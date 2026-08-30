import { afterEach, describe, expect, it, vi } from "vitest";

import { renameFlow } from "./api.js";

describe("Web Flow 重命名 API", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("复用现有 PATCH 路由并发送修剪后的名称", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            flowId: "flow-a",
            name: "新任务名称",
            createdAt: "2026-08-23T08:00:00.000Z",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(renameFlow("project-a", "flow-a", "  新任务名称  ", 7)).resolves.toMatchObject({
      flowId: "flow-a",
      name: "新任务名称",
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/projects/project-a/flows/flow-a", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "新任务名称", expectedRevision: 7 }),
    });
  });
});
