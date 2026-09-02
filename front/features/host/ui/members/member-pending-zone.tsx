import { type CSSProperties, type ReactElement } from "react";
import type { HostMemberListItem } from "@/features/host/model/host-view-types";
import { AvatarChip } from "@/shared/ui/avatar-chip";
import {
  disabledViewerActivationReason,
  disabledViewerDeactivateReason,
} from "./member-action-rules";
import { formatPendingRequestTime, requestMeta } from "./member-list-helpers";
import type { HostMembersLinkComponent } from "./types";

export function MemberPendingZone({
  viewers,
  isRowPending,
  onActivate,
  onRelease,
  onReview,
  personHref,
  LinkComponent,
  now,
}: {
  viewers: readonly HostMemberListItem[];
  isRowPending: (membershipId: string) => boolean;
  onActivate: (membershipId: string) => void;
  onRelease: (membershipId: string) => void;
  onReview?: () => void;
  personHref?: (membershipId: string) => string;
  LinkComponent?: HostMembersLinkComponent;
  now?: Date;
}): ReactElement | null {
  if (viewers.length === 0) {
    return null;
  }

  return (
    <section
      className="rm-document-panel rm-host-pending"
      aria-label="가입 승인 대기"
    >
      <header className="rm-host-pending__header">
        <div className="stack" style={{ "--stack": "6px" } as CSSProperties}>
          <h2 className="h4 editorial" style={{ margin: 0 }}>
            가입 승인 대기 {viewers.length}명
          </h2>
          <p className="small" style={{ margin: 0, color: "var(--text-2)" }}>
            승인과 거절은 결과 안내를 포함해요.
          </p>
        </div>
        <button
          className="btn btn-primary"
          type="button"
          onClick={() => onReview?.()}
        >
          가입 승인 검토
        </button>
      </header>

      <div className="stack" style={{ "--stack": "10px" } as CSSProperties}>
        {viewers.map((member) => {
          const rowPending = isRowPending(member.membershipId);
          const activateReason = disabledViewerActivationReason(rowPending);
          const releaseReason = disabledViewerDeactivateReason(member, rowPending);
          const activateDisabled = rowPending;
          const releaseDisabled = !member.canDeactivate || rowPending;
          const requestTime = formatPendingRequestTime(member.createdAt, now);

          return (
            <article key={member.membershipId} className="rm-host-pending__row">
              <div className="row-between" style={{ alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                <div className="rm-host-pending__identity">
                  <AvatarChip avatarKey={member.avatarKey} name={member.displayName} label="" sizeRole="member" />
                  <span className="h4 editorial" style={{ margin: 0 }}>
                    {personHref && LinkComponent ? (
                      <LinkComponent
                        to={personHref(member.membershipId)}
                        className="rm-host-member-ledger__person-link"
                      >
                        {member.displayName}
                      </LinkComponent>
                    ) : member.displayName}
                  </span>
                  {requestTime ? (
                    <span className="small rm-host-pending__time">{requestTime}</span>
                  ) : null}
                  <span className="rm-sr-only">{requestMeta(member)}</span>
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
