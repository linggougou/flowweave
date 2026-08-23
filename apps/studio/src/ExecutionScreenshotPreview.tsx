import { useEffect, useId, useRef } from "react";

export type ExecutionScreenshotPreviewStatus = "loading" | "available" | "unavailable";

type ExecutionScreenshotPreviewProps = {
  status: ExecutionScreenshotPreviewStatus;
  blobUrl: string | null;
  stepIndex: number;
  stepLabel: string;
  onClose: () => void;
};

function isBlobUrl(value: string | null): value is string {
  return value !== null && value.startsWith("blob:");
}

export function ExecutionScreenshotPreview({
  status,
  blobUrl,
  stepIndex,
  stepLabel,
  onClose,
}: ExecutionScreenshotPreviewProps) {
  const titleId = useId();
  const descriptionId = useId();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const stepNumber = Number.isSafeInteger(stepIndex) && stepIndex >= 0 ? stepIndex + 1 : 1;
  const readableStepLabel = stepLabel.trim() || "未命名步骤";
  const canRenderImage = status === "available" && isBlobUrl(blobUrl);

  useEffect(() => {
    returnFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();

    return () => {
      if (returnFocusRef.current?.isConnected) {
        returnFocusRef.current.focus();
      }
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="execution-screenshot-preview-backdrop">
      <section
        className="execution-screenshot-preview"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        aria-busy={status === "loading" ? "true" : undefined}
      >
        <header className="execution-screenshot-preview-header">
          <div>
            <p className="business-eyebrow">执行证据</p>
            <h3 id={titleId}>第 {stepNumber} 步截图</h3>
            <p id={descriptionId} className="execution-screenshot-preview-label">
              {readableStepLabel}
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className="execution-screenshot-preview-close"
            aria-label={`关闭第 ${stepNumber} 步截图预览`}
            onClick={onClose}
          >
            关闭
          </button>
        </header>

        <div className="execution-screenshot-preview-content">
          {status === "loading" ? (
            <p className="execution-screenshot-preview-state" role="status" aria-live="polite">
              正在加载截图…
            </p>
          ) : canRenderImage ? (
            <figure className="execution-screenshot-preview-figure">
              <img
                src={blobUrl}
                alt={`第 ${stepNumber} 步“${readableStepLabel}”的执行截图`}
                draggable={false}
              />
            </figure>
          ) : (
            <p className="execution-screenshot-preview-state" role="status">
              该步骤没有可预览的截图。
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
