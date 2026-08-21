import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { buildHostSessionHistoryItemView } from "@/features/host/model/host-session-editor-view-model";
import { formatDateTimeLabel } from "@/shared/ui/readmates-display";
import type { SessionHistoryPanelItem } from "./session-history-model";

export type { SessionHistoryPanelItem } from "./session-history-model";

export function SessionHistoryPanel({
  items,
  expectedDraftRevision,
  restoring,
  nextCursor = null,
  loadingMore = false,
  onLoadMore,
  onRestore,
  onRestoreCompleted,
}: {
  items: SessionHistoryPanelItem[];
  expectedDraftRevision: number | null;
  restoring: boolean;
  nextCursor?: string | null;
  loadingMore?: boolean;
  onLoadMore?: (cursor: string) => void | Promise<void>;
  onRestore: (request: {
    revisionId: string;
    expectedDraftRevision: number | null;
  }) => Promise<void>;
  onRestoreCompleted: () => void;
}) {
  const [pending, setPending] = useState<SessionHistoryPanelItem | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const restoreTriggerRef = useRef<HTMLButtonElement | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const confirmRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (pending) {
      cancelRef.current?.focus();
    }
  }, [pending]);

  const closeRestoreDialog = () => {
    setPending(null);
    setRestoreError(null);
    queueMicrotask(() => restoreTriggerRef.current?.focus());
  };

  const handleDialogKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" && !restoring) {
      event.preventDefault();
      closeRestoreDialog();
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
      <div id="host-editor-panel-history">
        <div className="eyebrow">변경 기록</div>
        <h2 className="h3 editorial" style={{ margin: "6px 0 14px" }}>버전과 작업 기록</h2>
        <div className="stack" style={{ "--stack": "10px" } as CSSProperties}>
          {items.length === 0 ? (
            <div className="surface-quiet small" style={{ padding: 14 }}>아직 변경 기록이 없습니다</div>
          ) : items.map((item) => {
            const view = buildHostSessionHistoryItemView(item);
            const metadata = [
              view.sourceLabel,
              item.createdAt ? formatDateTimeLabel(item.createdAt) : null,
            ].filter(Boolean);
            return (
              <article key={item.id} className="surface-quiet" style={{ padding: 14 }}>
                <div className="row-between" style={{ gap: 10, flexWrap: "wrap" }}>
                  <div style={{ minWidth: 0 }}>
                    <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                      <strong className="body">{view.title}</strong>
                      {view.versionLabel ? <span className="badge">{view.versionLabel}</span> : null}
                    </div>
                    <div className="tiny" style={{ marginTop: 4, overflowWrap: "anywhere" }}>
                      {metadata.join(" · ")}
                    </div>
                    {view.detailItems.length > 0 ? (
                      <div className="row" style={{ gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                        {view.detailItems.map((detail) => (
                          <span key={detail} className="badge">{detail}</span>
                        ))}
                      </div>
                    ) : null}
                    {view.reasonNote ? (
                      <p className="small" style={{ margin: "8px 0 0", overflowWrap: "anywhere" }}>
                        {view.reasonNote}
                      </p>
                    ) : null}
                  </div>
                  {view.canCreateDraft && item.revisionId && item.revisionVersion !== null ? (
                    <button
                      className="btn btn-quiet btn-sm"
                      type="button"
                      disabled={restoring}
                      onClick={(event) => {
                        restoreTriggerRef.current = event.currentTarget;
                        setRestoreError(null);
                        setPending(item);
                      }}
                    >
                      이 버전으로 초안 만들기
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })}
          {nextCursor && onLoadMore ? (
            <button
              className="btn btn-quiet"
              type="button"
              disabled={loadingMore}
              onClick={async () => {
                setLoadMoreError(null);
                try {
                  await onLoadMore(nextCursor);
                } catch {
                  setLoadMoreError("변경 기록을 더 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
                }
              }}
            >
              {loadingMore ? "변경 기록 불러오는 중" : "변경 기록 더 보기"}
            </button>
          ) : null}
          {loadMoreError ? <p role="alert" className="small" style={{ color: "var(--danger)", margin: 0 }}>{loadMoreError}</p> : null}
        </div>
      </div>

      {pending?.revisionId && pending.revisionVersion !== null ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`버전 ${pending.revisionVersion}로 작업 초안을 만들까요?`}
          className="rm-host-action-dialog-backdrop"
          onKeyDown={handleDialogKeyDown}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !restoring) {
              closeRestoreDialog();
            }
          }}
        >
          <div className="rm-host-action-dialog-sheet stack" style={{ "--stack": "14px" } as CSSProperties}>
            <h2 className="h3" style={{ margin: 0 }}>
              버전 {pending.revisionVersion}로 작업 초안을 만들까요?
            </h2>
            <p className="small" style={{ margin: 0 }}>
              이 버전의 내용으로 새 작업 초안을 만듭니다.{" "}
              <span>현재 적용본은 바뀌지 않습니다</span>
            </p>
            {restoreError ? <p role="alert" className="small" style={{ color: "var(--danger)", margin: 0 }}>{restoreError}</p> : null}
            <div className="row" style={{ gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
              <button ref={cancelRef} className="btn btn-quiet" type="button" disabled={restoring} onClick={closeRestoreDialog}>
                취소
              </button>
              <button
                ref={confirmRef}
                className="btn btn-primary"
                type="button"
                disabled={restoring}
                onClick={async () => {
                  setRestoreError(null);
                  try {
                    await onRestore({
                      revisionId: pending.revisionId as string,
                      expectedDraftRevision,
                    });
                  } catch {
                    setRestoreError("복원하지 못했습니다. 최신 초안 상태를 확인한 뒤 다시 시도해 주세요.");
                    return;
                  }
                  closeRestoreDialog();
                  onRestoreCompleted();
                }}
              >
                {restoring ? "작업 초안 만드는 중" : "작업 초안 만들기"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
