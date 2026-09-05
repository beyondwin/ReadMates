import {
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import type { HostMemberListItem } from "@/features/host/model/host-view-types";
import { AvatarChip } from "@/shared/ui/avatar-chip";
import { ReadmatesIcon } from "@/shared/ui/icon";
import { isMembershipPending, memberActionPendingReason } from "./member-action-rules";
import {
  clubAccessMeta,
  defaultScheduleSeenLabel,
  formatMembershipTenure,
  formatRecentClubAccess,
  rosterStatusLabels,
  rsvpIconName,
  scheduleSeenIconName,
  statusPillTone,
} from "./member-list-helpers";
import { matchesHostPeopleNameQuery, useHostPeopleNameQuery } from "./host-people-name-query";
import type { HostMemberLifecyclePath } from "./types";
import type { HostMembersLinkComponent } from "./types";
import "./member-ledger.css";

const DefaultPersonLink: HostMembersLinkComponent = ({ to, children, ...props }) => (
  <a {...props} href={to}>{children}</a>
);

const HOST_PEOPLE_FOCUS_KEY = "readmates.host-people.focus-restore";

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
  const label = isParticipating ? "모임 제외" : "이번 모임 추가";
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

export function MemberOverflowMenu({
  member,
  disabled,
  reason,
  items,
}: {
  member: HostMemberListItem;
  disabled: boolean;
  reason: string | null;
  items: Array<{
    key: string;
    label: string;
    disabled: boolean;
    reason: string | null;
    onSelect: (trigger: HTMLElement) => void;
  }>;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const reasonId = `host-member-overflow-reason-${member.membershipId}`;

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  if (items.length === 0) {
    return null;
  }

  return (
    <div ref={rootRef} className="rm-host-member-ledger__overflow">
      <span style={{ display: "inline-grid", gap: 4, justifyItems: "end" }}>
        <button
          ref={triggerRef}
          type="button"
          className="btn btn-ghost btn-sm"
          aria-label="멤버 관리 메뉴"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={menuId}
          aria-describedby={reason ? reasonId : undefined}
          disabled={disabled}
          onClick={() => setOpen((current) => !current)}
        >
          ⋯
        </button>
        {reason ? (
          <span id={reasonId} className="tiny" style={{ maxWidth: 180, color: "var(--text-3)", textAlign: "right" }}>
            {reason}
          </span>
        ) : null}
      </span>
      {open ? (
        <div id={menuId} className="rm-host-member-ledger__menu" role="menu" aria-label={`${member.displayName} 관리`}>
          {items.map((item) => {
            const itemReasonId = `host-member-overflow-${item.key}-reason-${member.membershipId}`;
            return (
              <button
                key={item.key}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                aria-describedby={item.reason ? itemReasonId : undefined}
                onClick={() => {
                  if (item.disabled) {
                    return;
                  }
                  setOpen(false);
                  item.onSelect(triggerRef.current ?? document.body);
                }}
              >
                {item.label}
                {item.reason ? (
                  <span id={itemReasonId} className="rm-sr-only">
                    {item.reason}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export type MemberLedgerFacts = {
  scheduleSeenLabel?: string;
  rsvpLabel?: string;
  lastAccessLabel?: string;
};

export function MemberList({
  members,
  emptyText,
  sectionDescription,
  sectionMeta,
  renderProfileAction,
  renderActions,
  renderOverflow,
  factsByMembershipId,
  personHref,
  LinkComponent,
  now,
}: {
  members: HostMemberListItem[];
  emptyText: string;
  sectionDescription: string;
  sectionMeta?: string;
  renderProfileAction?: (member: HostMemberListItem) => ReactNode;
  renderActions: (member: HostMemberListItem) => ReactNode;
  renderOverflow?: (member: HostMemberListItem) => ReactNode;
  factsByMembershipId?: Readonly<Record<string, MemberLedgerFacts>>;
  personHref?: (membershipId: string) => string;
  LinkComponent?: HostMembersLinkComponent;
  now?: Date;
}) {
  const PersonLink = LinkComponent ?? DefaultPersonLink;
  const nameQuery = useHostPeopleNameQuery();
  const visibleMembers = members.filter((member) => matchesHostPeopleNameQuery(member.displayName, nameQuery));
  const visibleMembershipIds = visibleMembers.map((member) => member.membershipId).join("\0");
  useEffect(() => {
    const membershipId = sessionStorage.getItem(HOST_PEOPLE_FOCUS_KEY);
    if (!membershipId) return;
    const target = document.querySelector<HTMLElement>(
      `.rm-host-member-ledger__person-link[href*="${membershipId}"]`,
    );
    if (!target) return;
    let inner = 0;
    const outer = window.requestAnimationFrame(() => {
      inner = window.requestAnimationFrame(() => {
        if (!document.contains(target)) return;
        target.focus();
        sessionStorage.removeItem(HOST_PEOPLE_FOCUS_KEY);
      });
    });
    return () => {
      window.cancelAnimationFrame(outer);
      window.cancelAnimationFrame(inner);
    };
  }, [visibleMembershipIds]);
  if (visibleMembers.length === 0) {
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
    <section
      className="rm-member-ledger"
      aria-label={sectionDescription}
      onClick={(event) => {
        const heading = (event.target as HTMLElement).closest("[data-membership-id]");
        const membershipId = heading?.getAttribute("data-membership-id");
        if (
          membershipId
          && (event.target as HTMLElement).closest(".rm-host-member-ledger__person-link")
        ) {
          sessionStorage.setItem(HOST_PEOPLE_FOCUS_KEY, membershipId);
        }
      }}
    >
      <header className="rm-member-ledger__heading">
        <h2 className="rm-host-member-ledger__title">멤버 원장</h2>
        {sectionMeta ? <p className="rm-host-member-ledger__caption-meta">{sectionMeta}</p> : null}
      </header>
      <div
        className="stack"
        style={{ "--stack": "12px" } as CSSProperties}
      >
      <table className="rm-host-member-ledger">
        <caption className="rm-sr-only">{sectionDescription}</caption>
        <thead>
          <tr>
            <th scope="col">멤버</th>
            <th scope="col">상태</th>
            <th scope="col">최신 일정</th>
            <th scope="col">참석 응답</th>
            <th scope="col">최근 접속</th>
            <th scope="col" className="rm-host-member-ledger__num">
              함께한 기간
            </th>
            <th scope="col">관리</th>
          </tr>
        </thead>
        <tbody>
          {visibleMembers.map((member) => {
            const facts = factsByMembershipId?.[member.membershipId];
            const scheduleSeenLabel = facts?.scheduleSeenLabel ?? defaultScheduleSeenLabel(member);
            const rsvpLabel = facts?.rsvpLabel ?? "—";
            const lastAccessLabel = facts?.lastAccessLabel
              ?? formatRecentClubAccess(member.lastClubAccessAt, now);
            const scheduleIcon = scheduleSeenIconName(scheduleSeenLabel);
            const rsvpIcon = rsvpIconName(rsvpLabel);
            const pillTone = statusPillTone(member.status);
            const personTo = personHref?.(member.membershipId)
              ?? `/app/host/people/${encodeURIComponent(member.membershipId)}`;

            return (
              <tr key={member.membershipId} className="rm-host-member-ledger__row">
                <td className="rm-host-member-ledger__fact">
                  <div className="rm-host-member-ledger__name">
                    <AvatarChip
                      avatarKey={member.status === "LEFT" ? "cloud-green-book" : member.avatarKey}
                      name={member.displayName}
                      label=""
                      sizeRole="member"
                    />
                    <h2 className="rm-host-member-ledger__display-name" data-membership-id={member.membershipId}>
                      <PersonLink
                        to={personTo}
                        className="rm-host-member-ledger__person-link"
                        onClick={() => sessionStorage.setItem(HOST_PEOPLE_FOCUS_KEY, member.membershipId)}
                      >
                        {member.displayName}
                      </PersonLink>
                    </h2>
                    {member.role === "HOST" ? <span className="rm-member-ledger__host">호스트</span> : null}
                  </div>
                </td>
                <td className="rm-host-member-ledger__status">
                  <span className="rm-member-ledger__pill" data-tone={pillTone}>{rosterStatusLabels[member.status]}</span>
                </td>
                <td className="rm-host-member-ledger__schedule">
                  <span className="rm-member-ledger__schedule">
                    <ReadmatesIcon name={scheduleIcon} size={16} />
                    {scheduleSeenLabel}
                  </span>
                </td>
                <td className="rm-host-member-ledger__meta">
                  <span className="rm-member-ledger__rsvp">
                    {rsvpIcon ? <ReadmatesIcon name={rsvpIcon} size={16} /> : null}
                    {rsvpLabel}
                  </span>
                </td>
                <td className="rm-host-member-ledger__access">
                  <span>{lastAccessLabel}</span>
                  {clubAccessMeta(member) !== lastAccessLabel ? (
                    <span className="rm-sr-only">{clubAccessMeta(member)}</span>
                  ) : null}
                </td>
                <td className="rm-host-member-ledger__num rm-host-member-ledger__time">
                  <span className="mono">{formatMembershipTenure(member.joinedAt, now)}</span>
                </td>
                <td className="rm-host-member-ledger__manage">
                  <div className="rm-host-member-ledger__actions">
                    <PersonLink
                      to={personTo}
                      className="rm-host-member-ledger__open rm-member-ledger__open"
                      onClick={() => sessionStorage.setItem(HOST_PEOPLE_FOCUS_KEY, member.membershipId)}
                    >
                      열기
                      <ReadmatesIcon name="chevron-right" size={16} />
                    </PersonLink>
                    {renderProfileAction?.(member)}
                    {renderActions(member)}
                    {renderOverflow?.(member)}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </section>
  );
}

function disabledCurrentSessionReason(member: HostMemberListItem, isParticipating: boolean) {
  if (isParticipating) {
    return member.role === "HOST" ? null : "이 멤버는 현재 정책상 이번 모임에서 제외할 수 없습니다.";
  }

  if (member.status !== "ACTIVE") {
    return "정식 활성 멤버만 이번 모임에 추가할 수 있습니다.";
  }

  return "현재 모임이 없거나 이미 다음 모임부터 반영되도록 처리되었습니다.";
}
