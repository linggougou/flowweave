import { describe, expect, it, vi } from "vitest";

import { registerWindowFocusRefresh, resolveRefreshedFlowSelection } from "./refresh-state.js";

const oldFlow = {
  id: "flow_old",
  name: "旧任务",
  createdAt: "2026-07-15",
  revision: 1,
  schemaVersion: 1,
};
const newFlow = {
  id: "flow_new",
  name: "新任务",
  createdAt: "2026-07-16",
  revision: 1,
  schemaVersion: 1,
};

describe("Studio 同步刷新状态", () => {
  it("发现新任务时优先选择新内容", () => {
    expect(resolveRefreshedFlowSelection([oldFlow], [newFlow, oldFlow], "flow_old", true)).toBe(
      "flow_new",
    );
  });

  it("没有新任务时保持当前选择，失效时回退到第一条", () => {
    expect(resolveRefreshedFlowSelection([oldFlow], [oldFlow], "flow_old", true)).toBe("flow_old");
    expect(resolveRefreshedFlowSelection([oldFlow], [newFlow], "flow_old", false)).toBe("flow_new");
  });

  it("窗口重新聚焦时触发刷新，并可正确注销监听", () => {
    const target = new EventTarget();
    const refresh = vi.fn();
    const dispose = registerWindowFocusRefresh(target, refresh);

    target.dispatchEvent(new Event("focus"));
    expect(refresh).toHaveBeenCalledTimes(1);

    dispose();
    target.dispatchEvent(new Event("focus"));
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
