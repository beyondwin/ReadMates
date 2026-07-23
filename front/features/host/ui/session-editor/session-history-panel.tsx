import { useState, type CSSProperties } from "react";
import type { MobileEditorSection } from "./mobile-editor-tabs";
import { Panel } from "./session-editor-panel";

export type SessionHistoryPanelItem = {
  id: string;
  type:
    | "BASIC_INFO_UPDATED"
    | "ATTENDANCE_UPDATED"
    | "RECORD_REVISION_APPLIED"
    | "RECORD_REVISION_RESTORED"
    | "NOTIFICATION_SENT"
    | "NOTIFICATION_SKIPPED";
  createdAt: string;
  actorMembershipId: string;
  changedFields: string[];
  attendanceTransitions: Array<{ membershipId: string; from: string; to: string }>;
  revisionId: string | null;
  revisionVersion: number | null;
  revisionSource: "BASELINE" | "MANUAL" | "JSON_IMPORT" | "AI_GENERATED" | "RESTORED" | null;
  restoredFromRevisionId: string | null;
  notificationEventId: string | null;
};

const historyTypeLabels: Record<SessionHistoryPanelItem["type"], string> = {
  BASIC_INFO_UPDATED: "기본 정보 수정",
  ATTENDANCE_UPDATED: "출석 수정",
  RECORD_REVISION_APPLIED: "공개 기록 반영",
  RECORD_REVISION_RESTORED: "과거 revision 복원",
  NOTIFICATION_SENT: "알림과 함께 반영",
  NOTIFICATION_SKIPPED: "알림 없이 반영",
};

export function SessionHistoryPanel({
  activeMobileSection,
  items,
  expectedDraftRevision,
  restoring,
  onRestore,
}: {
  activeMobileSection: MobileEditorSection;
  items: SessionHistoryPanelItem[];
  expectedDraftRevision: number | null;
  restoring: boolean;
  onRestore: (request: {
    revisionId: string;
    expectedDraftRevision: number | null;
  }) => void | Promise<void>;
}) {
  const [pending, setPending] = useState<SessionHistoryPanelItem | null>(null);

  return (
    <>
      <Panel
        eyebrow="변경 이력"
        title="revision과 작업 이력"
        mobileSection="history"
        panelId="host-editor-panel-history"
        activeMobileSection={activeMobileSection}
      >
        <div className="stack" style={{ "--stack": "10px" } as CSSProperties}>
          {items.length === 0 ? (
            <div className="surface-quiet small" style={{ padding: 14 }}>아직 기록된 변경 이력이 없습니다.</div>
          ) : items.map((item) => (
            <article key={item.id} className="surface-quiet" style={{ padding: 14 }}>
              <div className="row-between" style={{ gap: 10, flexWrap: "wrap" }}>
                <div style={{ minWidth: 0 }}>
                  <strong className="body">{historyTypeLabels[item.type]}</strong>
                  <div className="tiny" style={{ marginTop: 4, overflowWrap: "anywhere" }}>
                    {item.revisionVersion !== null ? `revision ${item.revisionVersion}` : "metadata audit"}
                    {" · "}{item.createdAt}
                  </div>
                </div>
                {item.revisionId && item.revisionVersion !== null ? (
                  <button
                    className="btn btn-quiet btn-sm"
                    type="button"
                    disabled={restoring}
                    onClick={() => setPending(item)}
                  >
                    revision {item.revisionVersion} 복원
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </Panel>

      {pending?.revisionId && pending.revisionVersion !== null ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`revision ${pending.revisionVersion}를 새 초안으로 복원`}
          className="modal-backdrop"
        >
          <div className="modal-card stack" style={{ "--stack": "14px" } as CSSProperties}>
            <h2 className="h3" style={{ margin: 0 }}>
              revision {pending.revisionVersion}를 새 초안으로 복원
            </h2>
            <p className="small" style={{ margin: 0 }}>
              과거 revision의 내용을 공유 초안으로 가져옵니다. live 기록은 변경되지 않습니다.
            </p>
            <div className="row" style={{ gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
              <button className="btn btn-quiet" type="button" disabled={restoring} onClick={() => setPending(null)}>
                복원 취소
              </button>
              <button
                className="btn btn-primary"
                type="button"
                disabled={restoring}
                onClick={async () => {
                  await onRestore({
                    revisionId: pending.revisionId as string,
                    expectedDraftRevision,
                  });
                  setPending(null);
                }}
              >
                {restoring ? "복원 중" : "새 초안으로 복원"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
