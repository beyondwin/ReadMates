import { useEffect, useRef, type KeyboardEvent, type CSSProperties } from "react";
import type { HostSessionRestorePreviewItemView } from "@/features/host/model/host-session-editor-view-model";

export type WorkspacePendingUndo = {
  description: string;
  error?: string | null;
  onUndo: () => void;
  onOpenHistory: () => void;
  onDismiss: () => void;
};

export type WorkspaceUndoConfirm = {
  items: HostSessionRestorePreviewItemView[];
  submitting: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
};

export type WorkspaceRestoreNotice = {
  message: string;
  onRetry: () => void;
  onOpenHistory: () => void;
  onDismiss: () => void;
};

export function WorkspaceUndoBar({
  pendingUndo,
  confirm = null,
  restoreNotice = null,
}: {
  pendingUndo: WorkspacePendingUndo | null;
  confirm?: WorkspaceUndoConfirm | null;
  restoreNotice?: WorkspaceRestoreNotice | null;
}) {
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const confirmRef = useRef<HTMLButtonElement | null>(null);
  const undoTriggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (confirm) {
      cancelRef.current?.focus();
    }
  }, [confirm]);

  if (!pendingUndo && !confirm && !restoreNotice) {
    return null;
  }

  const closeConfirm = () => {
    if (confirm?.submitting) {
      return;
    }
    confirm?.onCancel();
    queueMicrotask(() => undoTriggerRef.current?.focus());
  };

  const handleDialogKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" && !confirm?.submitting) {
      event.preventDefault();
      closeConfirm();
      return;
    }
    if (event.key !== "Tab") {
      return;
    }
    if (event.shiftKey && document.activeElement === cancelRef.current) {
      event.preventDefault();
      confirmRef.current?.focus();
    } else if (!event.shiftKey && document.activeElement === confirmRef.current) {
      event.preventDefault();
      cancelRef.current?.focus();
    }
  };

  return (
    <>
      {pendingUndo ? (
        <div className="rm-workspace-undo-bar" role="status">
          <div>
            <p className="small" style={{ margin: 0 }}>{pendingUndo.description}</p>
            {pendingUndo.error ? (
              <p role="alert" className="small" style={{ color: "var(--danger)", margin: "6px 0 0" }}>
                {pendingUndo.error}
              </p>
            ) : null}
          </div>
          <div className="rm-workspace-undo-bar__actions">
            <button
              ref={undoTriggerRef}
              type="button"
              className="btn btn-quiet btn-sm"
              onClick={pendingUndo.onUndo}
            >
              되돌리기
            </button>
            <button type="button" className="btn btn-quiet btn-sm" onClick={pendingUndo.onOpenHistory}>
              변경 내역
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={pendingUndo.onDismiss}>
              닫기
            </button>
          </div>
        </div>
      ) : restoreNotice ? (
        <div className="rm-workspace-undo-bar" role="status">
          <div>
            <p role="alert" className="small" style={{ color: "var(--danger)", margin: 0 }}>
              {restoreNotice.message}
            </p>
          </div>
          <div className="rm-workspace-undo-bar__actions">
            <button type="button" className="btn btn-quiet btn-sm" onClick={restoreNotice.onRetry}>
              다시 시도
            </button>
            <button type="button" className="btn btn-quiet btn-sm" onClick={restoreNotice.onOpenHistory}>
              변경 내역
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={restoreNotice.onDismiss}>
              닫기
            </button>
          </div>
        </div>
      ) : null}

      {confirm ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="이 변경을 되돌릴까요?"
          className="rm-host-action-dialog-backdrop"
          onKeyDown={handleDialogKeyDown}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !confirm.submitting) {
              closeConfirm();
            }
          }}
        >
          <div className="rm-host-action-dialog-sheet stack" style={{ "--stack": "14px" } as CSSProperties}>
            <h2 className="h3" style={{ margin: 0 }}>이 변경을 되돌릴까요?</h2>
            <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
              {confirm.items.map((item) => (
                <li key={item.key}>
                  {item.sensitive
                    ? `${item.label}: 미리보기에 표시하지 않습니다`
                    : `${item.label}: ${item.currentValue ?? "없음"} → ${item.targetValue ?? "없음"}`}
                </li>
              ))}
            </ul>
            {confirm.error ? (
              <p role="alert" className="small" style={{ color: "var(--danger)", margin: 0 }}>
                {confirm.error}
              </p>
            ) : null}
            <div className="row" style={{ gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
              <button
                ref={cancelRef}
                className="btn btn-quiet"
                type="button"
                disabled={confirm.submitting}
                onClick={closeConfirm}
              >
                취소
              </button>
              <button
                ref={confirmRef}
                className="btn btn-primary"
                type="button"
                disabled={confirm.submitting}
                onClick={confirm.onConfirm}
              >
                {confirm.submitting ? "되돌리는 중" : "되돌리기"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
