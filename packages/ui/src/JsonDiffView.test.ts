import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";

import { FlowVersionList } from "./FlowVersionList.js";
import { JsonDiffView, createJsonDiff, formatJsonDiffValue } from "./JsonDiffView.js";

function visitReactTree(node: ReactNode, visitor: (node: React.ReactElement) => void): void {
  if (Array.isArray(node)) {
    node.forEach((child) => visitReactTree(child, visitor));
    return;
  }

  if (node === null || node === undefined || typeof node !== "object") {
    return;
  }

  if ("props" in node) {
    const element = node as React.ReactElement<{ children?: ReactNode }>;
    visitor(element);
    if (typeof element.type === "function") {
      const render = element.type as (props: typeof element.props) => ReactNode;
      visitReactTree(render(element.props), visitor);
      return;
    }
    visitReactTree(element.props.children, visitor);
  }
}

function collectText(node: ReactNode): string {
  if (Array.isArray(node)) {
    return node.map(collectText).join("");
  }
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (node && typeof node === "object" && "props" in node) {
    const element = node as React.ReactElement<{ children?: ReactNode }>;
    if (typeof element.type === "function") {
      const render = element.type as (props: typeof element.props) => ReactNode;
      return collectText(render(element.props));
    }
    return collectText(element.props.children);
  }
  return "";
}

describe("createJsonDiff", () => {
  it("相同 JSON 返回明确空结果", () => {
    const result = createJsonDiff(
      { enabled: true, nested: { name: "任务" } },
      { enabled: true, nested: { name: "任务" } },
    );

    expect(result.entries).toEqual([]);
    expect(result.totalChanges).toBe(0);
    expect(result.truncated).toBe(false);
  });

  it("区分根 primitive 的修改并保留两端值", () => {
    expect(createJsonDiff("历史值", "当前值").entries).toEqual([
      {
        kind: "changed",
        path: "",
        before: "历史值",
        after: "当前值",
      },
    ]);
  });

  it("按 JSON Pointer 与键名确定顺序输出对象变化", () => {
    const result = createJsonDiff(
      { "a/b": 1, keep: true, removed: "旧" },
      { "a/b": 2, added: "新", keep: true, "til~de": false },
    );

    expect(result.entries).toEqual([
      {
        kind: "changed",
        path: "/a~1b",
        before: 1,
        after: 2,
      },
      { kind: "removed", path: "/removed", before: "旧" },
      { kind: "added", path: "/added", after: "新" },
      { kind: "added", path: "/til~0de", after: false },
    ]);
  });

  it("普通数组按索引比较", () => {
    expect(createJsonDiff(["a", "b"], ["a", "c", "d"]).entries).toEqual([
      { kind: "changed", path: "/1", before: "b", after: "c" },
      { kind: "added", path: "/2", after: "d" },
    ]);
  });

  it("唯一 id 对象数组按身份匹配，纯重排不产生噪声", () => {
    const before = [
      { id: "step-b", label: "第二步" },
      { id: "step-a", label: "第一步" },
    ];
    const after = [
      { id: "step-a", label: "第一步" },
      { id: "step-b", label: "第二步（新）" },
    ];

    expect(createJsonDiff(before, after).entries).toEqual([
      {
        kind: "changed",
        path: "/1/label",
        before: "第二步",
        after: "第二步（新）",
      },
    ]);
  });

  it("id 不唯一时回退到数组索引语义", () => {
    const result = createJsonDiff(
      [
        { id: "same", value: 1 },
        { id: "same", value: 2 },
      ],
      [
        { id: "same", value: 2 },
        { id: "same", value: 1 },
      ],
    );

    expect(result.entries.map((entry) => entry.path)).toEqual(["/0/value", "/1/value"]);
  });

  it("唯一 name 对象数组同样按身份匹配", () => {
    const result = createJsonDiff(
      [
        { name: "B", value: 2 },
        { name: "A", value: 1 },
      ],
      [
        { name: "A", value: 3 },
        { name: "B", value: 2 },
      ],
    );

    expect(result.entries).toEqual([{ kind: "changed", path: "/0/value", before: 1, after: 3 }]);
  });

  it("默认最多保留 500 条但继续统计完整变化数", () => {
    const before = Object.fromEntries(
      Array.from({ length: 620 }, (_, index) => [`key-${index}`, false]),
    );
    const after = Object.fromEntries(
      Array.from({ length: 620 }, (_, index) => [`key-${index}`, true]),
    );
    const result = createJsonDiff(before, after);

    expect(result.entries).toHaveLength(500);
    expect(result.totalChanges).toBe(620);
    expect(result.truncated).toBe(true);
    expect(result.maxChanges).toBe(500);
  });

  it("遇到不同但循环引用的对象时不会炸栈，并保留普通字段差异", () => {
    const before: Record<string, unknown> = { title: "历史标题" };
    before.self = before;
    const after: Record<string, unknown> = { title: "当前标题" };
    after.self = after;

    expect(createJsonDiff(before, after).entries).toEqual([
      {
        kind: "changed",
        path: "/title",
        before: "历史标题",
        after: "当前标题",
      },
    ]);
  });
});

describe("formatJsonDiffValue", () => {
  it("稳定排序对象键并明确报告长值截断", () => {
    const formatted = formatJsonDiffValue({ z: "1234567890", a: true }, { maxLength: 12 });

    expect(formatted.text.startsWith('{"a":true')).toBe(true);
    expect(formatted.text.endsWith("…")).toBe(true);
    expect(formatted.truncated).toBe(true);
    expect(formatted.originalLength).toBeGreaterThan(12);
  });

  it("循环引用使用安全占位文本输出", () => {
    const value: Record<string, unknown> = { title: "任务" };
    value.self = value;

    const formatted = formatJsonDiffValue(value);

    expect(formatted.text).toContain("[循环引用]");
    expect(formatted.truncated).toBe(false);
  });
});

describe("JsonDiffView", () => {
  it("用中文文字呈现状态、两端值和截断提示，保持只读", () => {
    const view = JsonDiffView({
      before: { title: "历史标题", secret: "很长的历史显示副本" },
      after: { title: "当前标题", added: true },
      maxValueLength: 8,
    });
    const elementTypes: unknown[] = [];
    const text = collectText(view);

    visitReactTree(view, (element) => elementTypes.push(element.type));

    expect(text).toContain("新增");
    expect(text).toContain("删除");
    expect(text).toContain("已修改");
    expect(text).toContain("历史值");
    expect(text).toContain("当前值");
    expect(text).toContain("值已截断");
    expect(elementTypes).not.toContain("textarea");
    expect(elementTypes).not.toContain("button");
  });

  it("无变化时显示中文空态", () => {
    expect(collectText(JsonDiffView({ before: [1], after: [1] }))).toContain("没有变化");
  });
});

describe("FlowVersionList", () => {
  it("通过 aria-pressed 暴露版本选中状态", () => {
    const tree = FlowVersionList({
      versions: [
        {
          id: "version-1",
          version: 1,
          name: "任务",
          stepCount: 2,
          createdAt: "2026-08-23T00:00:00.000Z",
        },
        {
          id: "version-2",
          version: 2,
          name: "任务",
          stepCount: 3,
          createdAt: "2026-08-23T01:00:00.000Z",
        },
      ],
      selectedVersionId: "version-2",
    });
    const pressedStates: unknown[] = [];

    visitReactTree(tree, (element) => {
      if (element.type === "button") {
        pressedStates.push((element.props as Record<string, unknown>)["aria-pressed"]);
      }
    });

    expect(pressedStates).toEqual([false, true]);
  });
});
