import type { CSSProperties, ReactElement } from "react";

export type JsonDiffKind = "added" | "removed" | "changed";

export type JsonDiffEntry = {
  kind: JsonDiffKind;
  path: string;
  before?: unknown;
  after?: unknown;
};

export type JsonDiffOptions = {
  maxChanges?: number;
};

export type JsonDiffResult = {
  entries: JsonDiffEntry[];
  totalChanges: number;
  truncated: boolean;
  maxChanges: number;
};

export type JsonDiffValueFormat = {
  text: string;
  truncated: boolean;
  originalLength: number;
};

export type JsonDiffViewProps = {
  before: unknown;
  after: unknown;
  maxChanges?: number;
  maxValueLength?: number;
  beforeLabel?: string;
  afterLabel?: string;
  emptyMessage?: string;
  ariaLabel?: string;
};

type IdentityKey = "id" | "name";

const DEFAULT_MAX_CHANGES = 500;
const DEFAULT_MAX_VALUE_LENGTH = 320;

const KIND_LABELS: Record<JsonDiffKind, string> = {
  added: "新增",
  removed: "删除",
  changed: "已修改",
};

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function escapeJsonPointerToken(token: string): string {
  return token.replaceAll("~", "~0").replaceAll("/", "~1");
}

function appendJsonPointer(path: string, token: string | number): string {
  return `${path}/${escapeJsonPointerToken(String(token))}`;
}

function normalizeLimit(value: number | undefined, fallback: number): number {
  if (value === undefined || Number.isNaN(value)) {
    return fallback;
  }
  if (!Number.isFinite(value)) {
    return value > 0 ? Number.MAX_SAFE_INTEGER : 0;
  }
  return Math.max(0, Math.floor(value));
}

function identityValue(value: unknown): string | null {
  if (typeof value === "string") {
    return `string:${value}`;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return `number:${value}`;
  }
  return null;
}

function hasUniqueIdentity(items: readonly unknown[], key: IdentityKey): boolean {
  const seen = new Set<string>();
  for (const item of items) {
    if (!isObject(item) || !Object.hasOwn(item, key)) {
      return false;
    }
    const identity = identityValue(item[key]);
    if (identity === null || seen.has(identity)) {
      return false;
    }
    seen.add(identity);
  }
  return true;
}

function findSharedIdentityKey(
  before: readonly unknown[],
  after: readonly unknown[],
): IdentityKey | null {
  if (before.length === 0 && after.length === 0) {
    return null;
  }
  for (const key of ["id", "name"] as const) {
    if (hasUniqueIdentity(before, key) && hasUniqueIdentity(after, key)) {
      return key;
    }
  }
  return null;
}

/**
 * 生成确定性的 JSON Pointer 差异。
 *
 * 调用方应先传入已经过可移植化与脱敏处理的 JSON 展示副本。算法不会修改
 * 输入，也不会执行 LCS；具有唯一 id/name 的对象数组以哈希表线性匹配。
 */
export function createJsonDiff(
  before: unknown,
  after: unknown,
  options: JsonDiffOptions = {},
): JsonDiffResult {
  const maxChanges = normalizeLimit(options.maxChanges, DEFAULT_MAX_CHANGES);
  const entries: JsonDiffEntry[] = [];
  let totalChanges = 0;

  const addEntry = (entry: JsonDiffEntry): void => {
    totalChanges += 1;
    if (entries.length < maxChanges) {
      entries.push(entry);
    }
  };

  const visit = (previous: unknown, current: unknown, path: string): void => {
    if (Object.is(previous, current)) {
      return;
    }

    if (Array.isArray(previous) && Array.isArray(current)) {
      const identityKey = findSharedIdentityKey(previous, current);
      if (identityKey !== null) {
        visitIdentityArray(previous, current, path, identityKey);
        return;
      }

      const length = Math.max(previous.length, current.length);
      for (let index = 0; index < length; index += 1) {
        const itemPath = appendJsonPointer(path, index);
        if (index >= previous.length) {
          addEntry({ kind: "added", path: itemPath, after: current[index] });
        } else if (index >= current.length) {
          addEntry({
            kind: "removed",
            path: itemPath,
            before: previous[index],
          });
        } else {
          visit(previous[index], current[index], itemPath);
        }
      }
      return;
    }

    if (isObject(previous) && isObject(current)) {
      const keys = new Set([...Object.keys(previous), ...Object.keys(current)]);
      // Object.keys / Set 的插入顺序由 ECMAScript 明确定义；先历史端、再当前端
      // 的新键，可在线性遍历中获得可重复顺序。
      for (const key of keys) {
        const itemPath = appendJsonPointer(path, key);
        const hasPrevious = Object.hasOwn(previous, key);
        const hasCurrent = Object.hasOwn(current, key);
        if (!hasPrevious) {
          addEntry({ kind: "added", path: itemPath, after: current[key] });
        } else if (!hasCurrent) {
          addEntry({
            kind: "removed",
            path: itemPath,
            before: previous[key],
          });
        } else {
          visit(previous[key], current[key], itemPath);
        }
      }
      return;
    }

    addEntry({ kind: "changed", path, before: previous, after: current });
  };

  const visitIdentityArray = (
    previous: readonly unknown[],
    current: readonly unknown[],
    path: string,
    identityKey: IdentityKey,
  ): void => {
    const previousItems = new Map<string, { index: number; value: Record<string, unknown> }>();
    const currentItems = new Map<string, { index: number; value: Record<string, unknown> }>();

    previous.forEach((item, index) => {
      const object = item as Record<string, unknown>;
      previousItems.set(identityValue(object[identityKey]) as string, {
        index,
        value: object,
      });
    });
    current.forEach((item, index) => {
      const object = item as Record<string, unknown>;
      currentItems.set(identityValue(object[identityKey]) as string, {
        index,
        value: object,
      });
    });

    // 先按当前数组顺序展示仍存在/新增的条目，再补历史数组中的删除条目。
    const identities = new Set([...currentItems.keys(), ...previousItems.keys()]);
    for (const identity of identities) {
      const previousItem = previousItems.get(identity);
      const currentItem = currentItems.get(identity);
      if (previousItem === undefined && currentItem !== undefined) {
        addEntry({
          kind: "added",
          path: appendJsonPointer(path, currentItem.index),
          after: currentItem.value,
        });
      } else if (previousItem !== undefined && currentItem === undefined) {
        addEntry({
          kind: "removed",
          path: appendJsonPointer(path, previousItem.index),
          before: previousItem.value,
        });
      } else if (previousItem !== undefined && currentItem !== undefined) {
        visit(previousItem.value, currentItem.value, appendJsonPointer(path, currentItem.index));
      }
    }
  };

  visit(before, after, "");

  return {
    entries,
    totalChanges,
    truncated: totalChanges > entries.length,
    maxChanges,
  };
}

function stableStringify(value: unknown, ancestors: Set<object>): string {
  if (value === null) {
    return "null";
  }
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "null";
  }
  if (typeof value === "boolean") {
    return String(value);
  }
  if (typeof value === "undefined") {
    return "undefined";
  }
  if (typeof value === "bigint") {
    return `${value}n`;
  }
  if (typeof value === "symbol" || typeof value === "function") {
    return "[不支持的非 JSON 值]";
  }

  if (ancestors.has(value)) {
    return "[循环引用]";
  }
  ancestors.add(value);

  let result: string;
  if (Array.isArray(value)) {
    result = `[${value.map((item) => stableStringify(item, ancestors)).join(",")}]`;
  } else {
    const objectValue = value as Record<string, unknown>;
    result = `{${Object.keys(objectValue)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(objectValue[key], ancestors)}`)
      .join(",")}}`;
  }

  ancestors.delete(value);
  return result;
}

export function formatJsonDiffValue(
  value: unknown,
  options: { maxLength?: number } = {},
): JsonDiffValueFormat {
  const maxLength = normalizeLimit(options.maxLength, DEFAULT_MAX_VALUE_LENGTH);
  const serialized = stableStringify(value, new Set());
  if (serialized.length <= maxLength) {
    return {
      text: serialized,
      truncated: false,
      originalLength: serialized.length,
    };
  }

  return {
    text: `${serialized.slice(0, maxLength)}…`,
    truncated: true,
    originalLength: serialized.length,
  };
}

const rootStyle: CSSProperties = {
  boxSizing: "border-box",
  maxWidth: "100%",
  minWidth: 0,
  overflowX: "hidden",
  width: "100%",
};

const entryStyle: CSSProperties = {
  borderBlockStart: "1px solid currentColor",
  boxSizing: "border-box",
  maxWidth: "100%",
  paddingBlock: "0.75rem",
};

const headerStyle: CSSProperties = {
  alignItems: "baseline",
  display: "flex",
  flexWrap: "wrap",
  gap: "0.5rem",
  minWidth: 0,
};

const valuesStyle: CSSProperties = {
  display: "grid",
  gap: "0.75rem",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 16rem), 1fr))",
  marginBlockStart: "0.5rem",
  maxWidth: "100%",
  minWidth: 0,
};

const valueStyle: CSSProperties = {
  margin: 0,
  maxWidth: "100%",
  minWidth: 0,
  overflowWrap: "anywhere",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};

function JsonValueBlock({
  label,
  value,
  exists,
  maxLength,
}: {
  label: string;
  value: unknown;
  exists: boolean;
  maxLength: number | undefined;
}): ReactElement {
  const formatted = exists
    ? formatJsonDiffValue(value, { maxLength })
    : { text: "（不存在）", truncated: false, originalLength: 0 };

  return (
    <div className="json-diff-value" style={{ maxWidth: "100%", minWidth: 0 }}>
      <strong>{label}</strong>
      <pre style={valueStyle}>{formatted.text}</pre>
      {formatted.truncated ? <small>值已截断（原始 {formatted.originalLength} 字符）</small> : null}
    </div>
  );
}

export function JsonDiffView({
  before,
  after,
  maxChanges,
  maxValueLength,
  beforeLabel = "历史值",
  afterLabel = "当前值",
  emptyMessage = "历史版本与当前任务没有变化",
  ariaLabel = "历史版本与当前任务差异",
}: JsonDiffViewProps): ReactElement {
  const result = createJsonDiff(before, after, { maxChanges });

  return (
    <section className="json-diff" style={rootStyle} aria-label={ariaLabel}>
      {result.totalChanges === 0 ? (
        <p className="json-diff-empty">{emptyMessage}</p>
      ) : (
        <>
          <p className="json-diff-summary" aria-live="polite">
            共 {result.totalChanges} 处变化
            {result.truncated ? `，仅显示前 ${result.entries.length} 处变化` : ""}
          </p>
          <ol
            className="json-diff-list"
            style={{ listStyle: "none", margin: 0, padding: 0 }}
          >
            {result.entries.map((entry, index) => (
              <li
                // 同一路径可能同时出现删除与新增，序号保证 key 唯一。
                key={`${entry.kind}:${entry.path}:${index}`}
                className={`json-diff-entry json-diff-entry-${entry.kind}`}
                style={entryStyle}
              >
                <article>
                  <header style={headerStyle}>
                    <strong className="json-diff-status">{KIND_LABELS[entry.kind]}</strong>
                    <code style={{ overflowWrap: "anywhere" }}>{entry.path || "（根）"}</code>
                  </header>
                  <div style={valuesStyle}>
                    <JsonValueBlock
                      label={beforeLabel}
                      value={entry.before}
                      exists={entry.kind !== "added"}
                      maxLength={maxValueLength}
                    />
                    <JsonValueBlock
                      label={afterLabel}
                      value={entry.after}
                      exists={entry.kind !== "removed"}
                      maxLength={maxValueLength}
                    />
                  </div>
                </article>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
