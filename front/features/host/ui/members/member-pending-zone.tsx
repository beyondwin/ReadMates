import { type CSSProperties } from "react";
import type { HostMemberListItem } from "@/features/host/model/host-view-types";
import { AvatarChip } from "@/shared/ui/avatar-chip";
import {
  disabledViewerActivationReason,
  disabledViewerDeactivateReason,
} from "./member-action-rules";
import { requestMeta } from "./member-list-helpers";

export function MemberPendingZone({
  viewers,
  isRowPending,
  onActivate,
  onRelease,
}: {
  viewers: readonly HostMemberListItem[];
  isRowPending: (membershipId: string) => boolean;
  onActivate: (membershipId: string) => void;
  onRelease: (membershipId: string) => void;
}): JSX.Element | null {
  if (viewers.length === 0) {
    return null;
  }

  return (
    <section
      className="rm-document-panel"
      aria-label="가입 승인 대기"
      style={{ padding: "18px 22px" }}
    >
      <header className="stack" style={{ "--stack": "6px", marginBottom: 14 } as CSSProperties}>
        <div className="eyebrow" style={{ margin: 0 }}>
          가입 승인
        </div>
        <h2 className="h4 editorial" style={{ margin: 0 }}>
          가입 요청 {viewers.length}명
        </h2>
        <p className="small" style={{ margin: 0, color: "var(--text-2)" }}>
          승인·거절은 멤버에게 알림이 갑니다
        </p>
      </header>

      <div className="stack" style={{ "--stack": "10px" } as CSSProperties}>
        {viewers.map((member) => {
          const rowPending = isRowPending(member.membershipId);
          const activateReason = disabledViewerActivationReason(rowPending);
          const releaseReason = disabledViewerDeactivateReason(member, rowPending);
          const activateDisabled = rowPending;
          const releaseDisabled = !member.canDeactivate || rowPending;

          return (
            <article key={member.membershipId} className="surface" style={{ padding: "14px 16px" }}>
              <div className="row-between" style={{ alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                <div style={{ minWidth: 0 }}>
                  <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <AvatarChip avatarKey={member.avatarKey} name={member.displayName} label="" sizeRole="member" />
                    <span className="h4 editorial" style={{ margin: 0 }}>
                      {member.displayName}
                    </span>
                  </div>
                  <p className="small" style={{ margin: "4px 0 0", color: "var(--text-2)" }}>
                    {requestMeta(member)}
                  </p>
                </div>
                <div className="row" style={{ gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  <PendingActionButton
                    action="approve"
                    membershipId={member.membershipId}
                    label="승인"
                    tone="primary"
                    disabled={activateDisabled}
                    reason={activateReason}
                    onClick={() => onActivate(member.membershipId)}
                  />
                  <PendingActionButton
                    action="reject"
                    membershipId={member.membershipId}
                    label="거절"
                    tone="ghost"
                    disabled={releaseDisabled}
                    reason={releaseReason}
                    onClick={() => onRelease(member.membershipId)}
                  />
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function PendingActionButton({
  action,
  membershipId,
  label,
  tone,
  disabled,
  reason,
  onClick,
}: {
  action: "approve" | "reject";
  membershipId: string;
  label: string;
  tone: "primary" | "ghost";
  disabled: boolean;
  reason: string | null;
  onClick: () => void;
}) {
  const reasonId = `host-pending-${action}-reason-${membershipId}`;

  return (
    <span style={{ display: "inline-grid", gap: 4, justifyItems: "end" }}>
      <button
        className={`btn ${tone === "primary" ? "btn-primary" : "btn-ghost"} btn-sm`}
        type="button"
        disabled={disabled}
        aria-describedby={reason ? reasonId : undefined}
        onClick={onClick}
      >
        {label}
      </button>
      {reason ? (
        <span id={reasonId} className="tiny" style={{ maxWidth: 180, color: "var(--text-3)", textAlign: "right" }}>
          {reason}
        </span>
      ) : null}
    </span>
  );
}
