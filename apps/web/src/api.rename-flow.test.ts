import { afterEach, describe, expect, it, vi } from "vitest";

import { getFlowVersion, renameFlow, restoreFlowVersion } from "./api.js";

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

  it("历史读取与恢复携带 flowId，恢复返回新 revision 与 schema", async () => {
    const responseBody = {
      document: {
        schemaVersion: 2,
        id: "flow-a",
        projectId: "project-a",
        name: "v2 历史",
        steps: [],
        meta: {
          createdAt: "2026-08-30T00:00:00.000Z",
          updatedAt: "2026-08-30T00:00:00.000Z",
          source: "manual",
        },
      },
      revision: 8,
      updatedAt: "2026-08-30T01:00:00.000Z",
    };
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify(responseBody), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await getFlowVersion("project-a", "flow-a", "version-a");
    await expect(
      restoreFlowVersion("project-a", "flow-a", "version-a", 7),
    ).resolves.toMatchObject({ revision: 8, document: { schemaVersion: 2 } });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/projects/project-a/flow-versions/version-a?flowId=flow-a",
      undefined,
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/projects/project-a/flow-versions/version-a/restore",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flowId: "flow-a", expectedRevision: 7 }),
      },
    );
  });
});
