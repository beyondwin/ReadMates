import type { Ref } from "react";
import type { HostSessionEditorLinkComponent } from "@/features/host/ui/session-editor/session-editor-links";
import { DefaultLinkComponent } from "@/features/host/ui/session-editor/session-editor-links";

export type WorkspaceTrashRestoreConflict = {
  openSessionHref: string;
  message: string;
};

export type WorkspaceTrashTombstoneProps = {
  sessionId: string;
  sessionNumber: number;
  title: string;
  deletedAtLabel: string;
  remainingCopy: string;
  restoreDisabled?: boolean;
  restoreDisabledReason?: string | null;
  restoreError?: string | null;
  restoreConflict?: WorkspaceTrashRestoreConflict | null;
  restoring?: boolean;
  restoreSuccess?: boolean;
  onRestore: () => void;
  onRetry?: () => void;
  listHref?: string;
  headingRef?: Ref<HTMLHeadingElement>;
  LinkComponent?: HostSessionEditorLinkComponent;
};

export function WorkspaceTrashTombstone({
  sessionId,
  sessionNumber,
  title,
  deletedAtLabel,
  remainingCopy,
  restoreDisabled = false,
  restoreDisabledReason = null,
  restoreError = null,
  restoreConflict = null,
  restoring = false,
  restoreSuccess = false,
  onRestore,
  onRetry,
  listHref,
  headingRef,
  LinkComponent = DefaultLinkComponent,
}: WorkspaceTrashTombstoneProps) {
  const restoreLabel = "방금 삭제한 모임 복구";
  const alertMessage = restoreDisabledReason ?? restoreError ?? restoreConflict?.message ?? null;

  return (
    <div className="rm-host-session-workspace" data-session-id={sessionId}>
      <div className="rm-host-session-workspace__frame">
        <header className="rm-host-session-workspace__header">
          {listHref ? (
            <LinkComponent to={listHref} className="btn btn-quiet btn-sm">
              휴지통
            </LinkComponent>
          ) : null}
          <div className="rm-host-session-workspace__identity">
            <span className="rm-host-session-workspace__number">No.{sessionNumber}</span>
            <h1
              ref={headingRef}
              tabIndex={-1}
              className="h1 editorial rm-host-session-workspace__title"
            >
              {title}
            </h1>
          </div>
          <p className="small rm-host-session-workspace__meta">이 모임은 휴지통에 있습니다.</p>
          <p className="small rm-host-session-workspace__meta">{deletedAtLabel}</p>
        </header>

        <div className="rm-host-session-workspace__layout">
          <div className="rm-host-session-workspace__main">
            <section className="rm-host-session-workspace__focus surface" aria-labelledby="workspace-trash-title">
              <div className="eyebrow">휴지통</div>
              <h2 id="workspace-trash-title" className="h3 editorial" style={{ margin: "6px 0 0" }}>
                휴지통에서 복원
              </h2>
              <p className="small rm-host-session-workspace__focus-copy">{remainingCopy}</p>
              {restoreSuccess ? (
                <div className="small" role="status" aria-live="polite" style={{ marginTop: 12 }}>
                  모임을 복원했습니다.
                </div>
              ) : null}
              {alertMessage ? (
                <div className="rm-host-session-workspace__focus-error" role="alert">
                  <p className="small" style={{ margin: 0 }}>{alertMessage}</p>
                  {restoreConflict ? (
                    <p className="small" style={{ margin: "10px 0 0" }}>
                      <LinkComponent to={restoreConflict.openSessionHref}>
                        진행 중인 모임 열기
                      </LinkComponent>
                    </p>
                  ) : null}
                  {restoreError && onRetry ? (
                    <button className="btn btn-quiet btn-sm" type="button" onClick={onRetry}>
                      다시 시도
                    </button>
                  ) : null}
                </div>
              ) : null}
              <div className="rm-host-session-workspace__focus-actions">
                <button
                  type="button"
                  className="btn btn-primary rm-host-session-workspace__cta--desktop"
                  disabled={restoreDisabled || restoring}
                  onClick={onRestore}
                >
                  {restoreLabel}
                </button>
              </div>
            </section>
          </div>
        </div>
      </div>

      <div className="rm-host-session-workspace__sticky-cta rm-host-session-workspace__footer-cta">
        <button
          type="button"
          className="btn btn-primary rm-host-session-workspace__cta--mobile"
          disabled={restoreDisabled || restoring}
          onClick={onRestore}
        >
          {restoreLabel}
        </button>
      </div>
    </div>
  );
}
