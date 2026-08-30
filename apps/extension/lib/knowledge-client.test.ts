import { afterEach, describe, expect, it, vi } from "vitest";

import { saveFlowToKnowledge } from "./knowledge-client.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Extension recorder Flow CAS 同步", () => {
  it("新 Flow 在 404 探测后使用 create-only 保存", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ status: 404, ok: false, json: vi.fn().mockResolvedValue({}) })
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: vi.fn().mockResolvedValue({
          flowId: "flow_new",
          name: "新录制",
          projectId: "project_a",
          revision: 1,
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    await saveFlowToKnowledge("http://127.0.0.1:3847", "project_a", {
      id: "flow_new",
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://127.0.0.1:3847/api/projects/project_a/flows",
      expect.objectContaining({ body: JSON.stringify({ flow: { id: "flow_new" } }) }),
    );
  });

  it("已有 Flow 将读取到的 caller revision 原样带入更新请求", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: vi.fn().mockResolvedValue({ revision: 7 }),
      })
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: vi.fn().mockResolvedValue({
          flowId: "flow_existing",
          name: "再次同步",
          projectId: "project_a",
          revision: 8,
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    await saveFlowToKnowledge(
      "http://127.0.0.1:3847",
      "project_a",
      { id: "flow_existing" },
      "再次同步",
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://127.0.0.1:3847/api/projects/project_a/flows",
      expect.objectContaining({
        body: JSON.stringify({
          flow: { id: "flow_existing" },
          changeMessage: "再次同步",
          expectedRevision: 7,
        }),
      }),
    );
  });
});
