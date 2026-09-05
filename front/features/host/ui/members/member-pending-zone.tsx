import { type CSSProperties, type ReactElement, useState } from "react";
import type { HostMemberListItem } from "@/features/host/model/host-view-types";
import { AvatarChip } from "@/shared/ui/avatar-chip";
import {
  disabledViewerActivationReason,
  disabledViewerDeactivateReason,
} from "./member-action-rules";
import { matchesHostPeopleNameQuery, useHostPeopleNameQuery } from "./host-people-name-query";
import { formatPendingRequestTime, requestMeta } from "./member-list-helpers";
import type { HostMembersLinkComponent } from "./types";

const DefaultPersonLink: HostMembersLinkComponent = ({ to, children, ...props }) => (
  <a {...props} href={to}>{children}</a>
);

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
  onReview?: (membershipId: string) => void;
  personHref?: (membershipId: string) => string;
  LinkComponent?: HostMembersLinkComponent;
  now?: Date;
}): ReactElement | null {
  const [reviewingIds, setReviewingIds] = useState<ReadonlySet<string>>(() => new Set());
  const PersonLink = LinkComponent ?? DefaultPersonLink;
  const nameQuery = useHostPeopleNameQuery();
  const visibleViewers = viewers.filter((member) => matchesHostPeopleNameQuery(member.displayName, nameQuery));

  if (visibleViewers.length === 0) {
    return null;
  }

  const startReview = (membershipId: string) => {
    setReviewingIds((current) => new Set([...current, membershipId]));
    onReview?.(membershipId);
  };

  return (
    <section
      className="rm-member-ledger__pending"
      aria-label="가입 승인 대기"
    >
      <header className="rm-host-pending__header rm-member-ledger__pending-head">
        <div className="stack" style={{ "--stack": "6px" } as CSSProperties}>
          <h2 className="h4 editorial" style={{ margin: 0 }}>
            가입 승인 대기 {visibleViewers.length}명
          </h2>
          <p className="small" style={{ margin: 0, color: "var(--text-2)" }}>
            승인과 거절은 결과 안내를 포함해요.
          </p>
        </div>
        <button
          className="btn btn-primary"
          type="button"
          onClick={() => startReview(visibleViewers[0].membershipId)}
        >
          가입 승인 검토
        </button>
      </header>

      <ul className="rm-member-ledger__pending-list">
        {visibleViewers.map((member) => {
          const rowPending = isRowPending(member.membershipId);
          const activateReason = disabledViewerActivationReason(rowPending);
          const releaseReason = disabledViewerDeactivateReason(member, rowPending);
          const activateDisabled = rowPending;
          const releaseDisabled = !member.canDeactivate || rowPending;
          const requestTime = formatPendingRequestTime(member.createdAt, now);
          const reviewing = reviewingIds.has(member.membershipId);
          const personTo = personHref?.(member.membershipId)
            ?? `/app/host/people/${encodeURIComponent(member.membershipId)}`;

          return (
            <li key={member.membershipId} className="rm-member-ledger__pending-row">
              <AvatarChip avatarKey={member.avatarKey} name={member.displayName} label="" size={44} />
              <div className="rm-host-pending__identity">
                <span className="rm-host-pending__name">
                  <PersonLink
                    to={personTo}
                    className="rm-host-member-ledger__person-link"
                  >
                    {member.displayName}
                  </PersonLink>
                </span>
                <span className="rm-member-ledger__pending-path">—</span>
                {requestTime ? (
                  <span className="small rm-host-pending__time">{requestTime}</span>
                ) : null}
                <span className="rm-sr-only">{requestMeta(member)}</span>
              </div>
              <div className="rm-member-ledger__pending-actions">
                {reviewing ? (
                  <>
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
                  </>
                ) : (
                  <button
                    className="rm-member-ledger__review"
                    type="button"
                    onClick={() => startReview(member.membershipId)}
                  >
                    검토
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
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
