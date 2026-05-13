import type { CSSProperties, MouseEvent as ReactMouseEvent, ReactNode } from "react";
import type { HostMemberListItem, MembershipStatus } from "@/features/host/model/host-view-types";
import { isMembershipPending, memberActionPendingReason } from "./member-action-rules";
import type { HostMemberLifecyclePath } from "./types";

const statusBadgeLabels: Record<MembershipStatus, string> = {
  INVITED: "초대됨",
  VIEWER: "둘러보기",
  ACTIVE: "활성",
  SUSPENDED: "정지",
  LEFT: "탈퇴",
  INACTIVE: "비활성",
};

function statusBadgeClass(status: MembershipStatus) {
  if (status === "ACTIVE") {
    return "badge badge-ok badge-dot";
  }

  if (status === "VIEWER" || status === "INVITED") {
    return "badge badge-accent badge-dot";
  }

  if (status === "SUSPENDED") {
    return "badge badge-warn badge-dot";
  }

  return "badge";
}

function currentSessionBadge(member: HostMemberListItem) {
  if (member.currentSessionParticipationStatus === "ACTIVE") {
    return { label: "이번 세션 참여", className: "badge badge-ok badge-dot" };
  }

  if (member.currentSessionParticipationStatus === "REMOVED") {
    return { label: "이번 세션 제외", className: "badge badge-warn badge-dot" };
  }

  return { label: "이번 세션 미포함", className: "badge" };
}

export function MemberActionButton({
  action,
  member,
  label,
  tone = "ghost",
  disabled,
  reason,
  onClick,
}: {
  action: string;
  member: HostMemberListItem;
  label: string;
  tone?: "ghost" | "primary";
  disabled: boolean;
  reason: string | null;
  onClick: (event: ReactMouseEvent<HTMLButtonElement>) => void;
}) {
  const reasonId = `host-member-${action}-reason-${member.membershipId}`;

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

export function CurrentSessionAction({
  member,
  pendingActions,
  onSubmit,
}: {
  member: HostMemberListItem;
  pendingActions: Set<string>;
  onSubmit: (member: HostMemberListItem, path: HostMemberLifecyclePath) => Promise<void>;
}) {
  const isParticipating = member.currentSessionParticipationStatus === "ACTIVE";
  const path: HostMemberLifecyclePath = isParticipating ? "/current-session/remove" : "/current-session/add";
  const enabled = isParticipating ? member.canRemoveFromCurrentSession : member.canAddToCurrentSession;
  const label = isParticipating ? "세션 제외" : "이번 세션 추가";
  const rowPending = isMembershipPending(member.membershipId, pendingActions);
  const reasonId = `current-session-action-reason-${member.membershipId}`;
  const reason = rowPending ? memberActionPendingReason : !enabled ? disabledCurrentSessionReason(member, isParticipating) : null;

  return (
    <span style={{ display: "inline-grid", gap: 4, justifyItems: "end" }}>
      <button
        className="btn btn-ghost btn-sm"
        type="button"
        disabled={!enabled || rowPending}
        aria-describedby={reason ? reasonId : undefined}
        onClick={() => void onSubmit(member, path)}
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

export function MemberList({
  members,
  emptyText,
  sectionDescription,
  renderMeta,
  renderProfileAction,
  renderActions,
  renderCurrentSessionBadge = currentSessionBadge,
}: {
  members: HostMemberListItem[];
  emptyText: string;
  sectionDescription: string;
  renderMeta: (member: HostMemberListItem) => string;
  renderProfileAction: (member: HostMemberListItem) => ReactNode;
  renderActions: (member: HostMemberListItem) => ReactNode;
  renderCurrentSessionBadge?: (member: HostMemberListItem) => { label: string; className: string };
}) {
  if (members.length === 0) {
    return (
      <div className="surface" style={{ padding: 28 }}>
        <p className="small" style={{ color: "var(--text-2)", margin: "0 0 10px" }}>
          {sectionDescription}
        </p>
        <p className="body" style={{ margin: 0 }}>
          {emptyText}
        </p>
      </div>
    );
  }

  return (
    <div className="stack" style={{ "--stack": "12px" } as CSSProperties}>
      <p className="small" style={{ color: "var(--text-2)", margin: 0 }}>
        {sectionDescription}
      </p>
      {members.map((member) => (
        <article key={member.membershipId} className="surface" style={{ padding: "18px 22px" }}>
          <div className="row-between" style={{ alignItems: "center", gap: 18, flexWrap: "wrap" }}>
            <div style={{ minWidth: 0 }}>
              <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <h2 className="h4 editorial" style={{ margin: 0 }}>
                  {member.displayName}
                </h2>
                <span className={statusBadgeClass(member.status)}>{statusBadgeLabels[member.status]}</span>
                <span className={renderCurrentSessionBadge(member).className}>{renderCurrentSessionBadge(member).label}</span>
                {member.role === "HOST" ? <span className="badge badge-accent badge-dot">호스트</span> : null}
              </div>
              <p className="small" style={{ margin: "4px 0 0", color: "var(--text-2)" }}>
                {renderMeta(member)}
              </p>
            </div>
            <div className="row" style={{ gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
              {renderProfileAction(member)}
              {renderActions(member)}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

function disabledCurrentSessionReason(member: HostMemberListItem, isParticipating: boolean) {
  if (isParticipating) {
    return member.role === "HOST" ? null : "이 멤버는 현재 정책상 이번 세션에서 제외할 수 없습니다.";
  }

  if (member.status !== "ACTIVE") {
    return "정식 활성 멤버만 이번 세션에 추가할 수 있습니다.";
  }

  return "현재 세션이 없거나 이미 다음 세션부터 반영되도록 처리되었습니다.";
}
