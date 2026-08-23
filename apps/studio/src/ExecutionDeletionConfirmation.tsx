import { useEffect, useRef } from "react";
import type { ExecutionSummary } from "./shared/studio-api-types.js";

type ExecutionDeletionConfirmationProps = {
  execution: ExecutionSummary;
  taskName: string;
  disabled: boolean;
  error: string | null;
  returnFocusTo: HTMLElement | null;
  onConfirm: () => void;
  onCancel: () => void;
};

function formatTime(iso?: string): string {
  if (!iso) return "时间未知";
  try {
    return new Date(iso).toLocaleString("zh-CN");
  } catch {
    return iso;
  }
}

function formatStatus(status: ExecutionSummary["status"]): string {
  if (status === "passed") return "成功";
  if (status === "failed") return "失败";
  if (status === "cancelled") return "已取消";
  if (status === "running") return "运行中";
  return "等待运行";
}

export function ExecutionDeletionConfirmation({
  execution,
  taskName,
  disabled,
  error,
  returnFocusTo,
  onConfirm,
  onCancel,
}: ExecutionDeletionConfirmationProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
    return () => returnFocusTo?.focus();
  }, [returnFocusTo]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !disabled) {
        event.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [disabled, onCancel]);

  return (
    <div className="run-confirmation-backdrop">
      <section
        className="run-confirmation execution-delete-confirmation"
        role="dialog"
        aria-modal="true"
        aria-labelledby="execution-delete-title"
      >
        <p className="business-eyebrow">删除运行记录</p>
        <h3 id="execution-delete-title">确认删除「{taskName}」的这次运行？</h3>
        <dl className="run-confirmation-facts">
          <div>
            <dt>运行时间</dt>
            <dd>{formatTime(execution.startedAt)}</dd>
          </div>
          <div>
            <dt>运行状态</dt>
            <dd>{formatStatus(execution.status)}</dd>
          </div>
        </dl>
        <p>
          将删除这条运行记录，以及关联的截图、诊断 JSON、页面快照和 HAR 产物。
          不会删除自动化任务（Flow）或其他运行记录。
        </p>
        <p>运行记录删除后无法恢复；受控产物会被永久清理，若清理未完成则留在本地隔离区。</p>
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="run-confirmation-actions">
          <button
            ref={cancelRef}
            type="button"
            className="secondary-btn"
            disabled={disabled}
            onClick={onCancel}
          >
            取消
          </button>
          <button type="button" className="danger-btn" disabled={disabled} onClick={onConfirm}>
            {disabled ? "删除中…" : "永久删除这条记录"}
          </button>
        </div>
      </section>
    </div>
  );
}
