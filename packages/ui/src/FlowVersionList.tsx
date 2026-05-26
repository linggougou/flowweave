export type FlowVersionRow = {
  id: string;
  version: number;
  name: string;
  stepCount: number;
  createdAt: string;
  changeMessage?: string;
};

export type FlowVersionListProps = {
  versions: FlowVersionRow[];
  selectedVersionId?: string | null;
  onSelect?: (versionId: string) => void;
  onRestore?: (versionId: string) => void;
  restoringId?: string | null;
  emptyMessage?: string;
};

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function FlowVersionList({
  versions,
  selectedVersionId,
  onSelect,
  onRestore,
  restoringId,
  emptyMessage = "暂无历史版本",
}: FlowVersionListProps) {
  if (versions.length === 0) {
    return <p className="flow-version-empty">{emptyMessage}</p>;
  }

  return (
    <ul className="flow-version-list">
      {versions.map((item) => (
        <li key={item.id} className="flow-version-item">
          <button
            type="button"
            className={
              item.id === selectedVersionId
                ? "flow-version-summary active"
                : "flow-version-summary"
            }
            onClick={() => onSelect?.(item.id)}
          >
            <span className="flow-version-label">
              v{item.version} · {item.name}
            </span>
            <span className="flow-version-meta">
              {item.stepCount} 步 · {formatTime(item.createdAt)}
            </span>
            {item.changeMessage ? (
              <span className="flow-version-message">{item.changeMessage}</span>
            ) : null}
          </button>
          {onRestore ? (
            <button
              type="button"
              className="flow-version-restore"
              disabled={restoringId === item.id}
              onClick={() => onRestore(item.id)}
            >
              {restoringId === item.id ? "恢复中…" : "恢复"}
            </button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
