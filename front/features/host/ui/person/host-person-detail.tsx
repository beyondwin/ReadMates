import { useEffect, useId, useRef, useState, type ComponentType, type ReactNode } from "react";
import type { HostPersonDetailView as PersonDetail } from "@/features/host/model/host-person-detail-model";
import { AvatarChip } from "@/shared/ui/avatar-chip";
import { ReadmatesIcon, type ReadmatesIconName } from "@/shared/ui/icon";
import "./host-person-detail.css";

type PersonLinkProps = { to: string; className?: string; children: ReactNode };

const DefaultLink: ComponentType<PersonLinkProps> = ({ to, children, ...props }) => (
  <a {...props} href={to}>{children}</a>
);

export type HostPersonIdentityFacts = {
  folioLabel?: string;
  tenureLabel?: string;
  joinedLabel?: string;
  meetingTitle?: string;
  scheduleSeenLabel?: string;
  confirmedRevision?: number;
  membershipSummary?: string;
  attendanceTitles?: Readonly<Record<number, string>>;
};

export type HostPersonDetailLinks = {
  scheduleReviewHref?: string;
  historyHref?: string;
  rsvpHistoryHref?: string;
};

const statusLabels: Record<PersonDetail["status"], string> = {
  INVITED: "초대됨",
  VIEWER: "둘러보기",
  ACTIVE: "활동",
  SUSPENDED: "쉬는 중",
  LEFT: "탈퇴",
  INACTIVE: "비활성",
};

const rsvpLabels: Record<NonNullable<PersonDetail["currentRsvp"]>, string> = {
  NO_RESPONSE: "미응답",
  GOING: "참석 예정",
  MAYBE: "미정",
  DECLINED: "불참 예정",
};

const attendanceLabels = {
  UNKNOWN: "미확인",
  ATTENDED: "참석",
  ABSENT: "불참",
} as const;

function localDateLabel(value: string) {
  const [date] = value.split("T");
  const parts = date?.split("-") ?? [];
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  if (!month || !day) return value.replace("T", " ").slice(0, 16);
  return `${month}월 ${day}일`;
}

function localTimeLabel(value: string) {
  const time = value.split("T")[1] ?? "";
  const [hourText, minuteText] = time.split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return "";
  const period = hour < 12 ? "오전" : "오후";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${period} ${hour12}:${String(minute).padStart(2, "0")}`;
}

function scheduleWhenLabel(scheduledAt: string) {
  const dateLabel = localDateLabel(scheduledAt);
  const timeLabel = localTimeLabel(scheduledAt);
  return timeLabel ? `${dateLabel} ${timeLabel}` : dateLabel;
}

function coarseClubAccessLabel(value: string | null, now = new Date()) {
  if (!value) return "없음";
  const observed = new Date(value);
  if (Number.isNaN(observed.getTime())) return "없음";
  const days = Math.max(0, Math.floor((now.getTime() - observed.getTime()) / 86_400_000));
  if (days <= 1) return "어제";
  if (days <= 7) return "7일 이내";
  if (days <= 30) return "30일 이내";
  if (days <= 90) return "90일 이내";
  return "90일 이전";
}

function rsvpPresentation(rsvp: PersonDetail["currentRsvp"]): {
  label: string;
  icon: ReadmatesIconName;
  tone?: "warn" | "ok" | "danger";
  detail?: string;
} {
  if (!rsvp) {
    return { label: "현재 응답 없음", icon: "question-circle" };
  }
  if (rsvp === "NO_RESPONSE") {
    return { label: rsvpLabels[rsvp], icon: "question-circle", tone: "warn", detail: "최종 응답 없음" };
  }
  if (rsvp === "GOING") {
    return { label: rsvpLabels[rsvp], icon: "check-circle", tone: "ok" };
  }
  if (rsvp === "DECLINED") {
    return { label: rsvpLabels[rsvp], icon: "x-circle", tone: "danger" };
  }
  return { label: rsvpLabels[rsvp], icon: "question-circle", tone: "warn" };
}

function attendancePresentation(status: keyof typeof attendanceLabels): {
  label: string;
  icon: ReadmatesIconName;
  tone?: "ok" | "danger";
} {
  if (status === "ATTENDED") return { label: attendanceLabels[status], icon: "check-circle", tone: "ok" };
  if (status === "ABSENT") return { label: attendanceLabels[status], icon: "x-circle", tone: "danger" };
  return { label: attendanceLabels[status], icon: "question-circle" };
}

function PersonActionLink({
  to,
  children,
  LinkComponent,
}: {
  to: string;
  children: ReactNode;
  LinkComponent: ComponentType<PersonLinkProps>;
}) {
  return (
    <LinkComponent to={to}>
      {children}
      <ReadmatesIcon name="chevron-right" size={16} />
    </LinkComponent>
  );
}

function PersonMoreMenu({
  renameDisabled,
  excludeDisabled,
  renameUnavailableReason,
  excludeUnavailableReason,
  onRename,
  onExclude,
}: {
  renameDisabled: boolean;
  excludeDisabled: boolean;
  renameUnavailableReason: string | null;
  excludeUnavailableReason: string | null;
  onRename?: () => void;
  onExclude?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
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

  const select = (disabled: boolean, action?: () => void) => {
    if (disabled || !action) return;
    setOpen(false);
    action();
  };

  return (
    <div className="rm-person-detail__more-wrap" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="rm-person-detail__more"
        aria-label="더 보기"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((current) => !current)}
      >
        <ReadmatesIcon name="more" size={20} />
      </button>
      {open ? (
        <div id={menuId} className="rm-person-detail__menu" role="menu" aria-label="사람 관리">
          <button
            type="button"
            role="menuitem"
            disabled={renameDisabled || !onRename}
            aria-description={renameUnavailableReason ?? undefined}
            onClick={() => select(renameDisabled || !onRename, onRename)}
          >
            이름 변경
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={excludeDisabled || !onExclude}
            aria-description={excludeUnavailableReason ?? undefined}
            onClick={() => select(excludeDisabled || !onExclude, onExclude)}
          >
            모임 제외
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function HostPersonDetail({
  person,
  attendanceItems,
  nextCursor,
  loadingMore,
  loadMoreError,
  onLoadMore,
  peopleHref,
  now,
  identity,
  links,
  onRename,
  onExclude,
  renameDisabled = false,
  excludeDisabled = false,
  renameUnavailableReason = null,
  excludeUnavailableReason = null,
  LinkComponent = DefaultLink,
}: {
  person: PersonDetail;
  attendanceItems: PersonDetail["attendanceHistory"]["items"];
  nextCursor: string | null;
  loadingMore: boolean;
  loadMoreError: string | null;
  onLoadMore: () => void;
  peopleHref: string;
  now?: Date;
  identity?: HostPersonIdentityFacts;
  links?: HostPersonDetailLinks;
  onRename?: () => void;
  onExclude?: () => void;
  renameDisabled?: boolean;
  excludeDisabled?: boolean;
  renameUnavailableReason?: string | null;
  excludeUnavailableReason?: string | null;
  LinkComponent?: ComponentType<PersonLinkProps>;
}) {
  const tenure = identity?.tenureLabel?.trim();
  const joined = identity?.joinedLabel?.trim();
  const meetingTitle = identity?.meetingTitle?.trim();
  const scheduleSeen = identity?.scheduleSeenLabel?.trim();
  const membershipSummary = identity?.membershipSummary?.trim();
  const roleLabel = person.role === "HOST" ? "공동 호스트" : "멤버";
  const statusLabel = statusLabels[person.status];
  const rsvp = rsvpPresentation(person.currentRsvp);
  const loadMoreLabel = loadingMore
    ? "불러오는 중"
    : loadMoreError
      ? "참석 기록 다시 시도"
      : "전체 출석 보기";
  const membershipLine = membershipSummary
    ?? `${statusLabel} · ${roleLabel}`;

  return (
    <main className="rm-person-detail rm-host-person">
      <LinkComponent to={peopleHref} className="rm-person-detail__back">
        <ReadmatesIcon name="arrow-left" size={20} />
        사람
      </LinkComponent>

      <header className="rm-person-detail__header rm-host-person__header">
        <AvatarChip avatarKey={person.avatarKey} name={person.displayName} label="" sizeRole="profile" />
        <div>
          <span className="rm-person-detail__folio rm-host-person__folio">{identity?.folioLabel?.trim() || "FOLIO"}</span>
          <h1>{person.displayName}</h1>
          <p className="rm-person-detail__tenure rm-host-person__tenure">
            <span data-tone={person.status === "ACTIVE" ? "ok" : undefined}>{statusLabel}</span>
            {tenure ? ` · ${tenure}` : ""}
          </p>
          {joined ? <p className="rm-person-detail__joined">{joined}</p> : null}
        </div>
        <PersonMoreMenu
          renameDisabled={renameDisabled}
          excludeDisabled={excludeDisabled}
          renameUnavailableReason={renameUnavailableReason}
          excludeUnavailableReason={excludeUnavailableReason}
          onRename={onRename}
          onExclude={onExclude}
        />
      </header>

      <section className="rm-person-detail__section" aria-labelledby="person-schedule-title">
        <span aria-hidden="true">01</span>
        <div>
          <h2 id="person-schedule-title">현재 일정</h2>
          {person.currentSchedule ? (
            <p className="rm-person-detail__row">
              <ReadmatesIcon name="calendar" size={20} />
              <span>
                {meetingTitle ? `${meetingTitle} · ` : "모임 · "}
                {scheduleWhenLabel(person.currentSchedule.scheduledAt)}
              </span>
            </p>
          ) : (
            <p className="rm-person-detail__row">
              <ReadmatesIcon name="calendar" size={20} />
              <span>일정 없음</span>
            </p>
          )}
          {scheduleSeen ? (
            <p className="rm-person-detail__row" data-tone="warn">
              <ReadmatesIcon name="alert-circle" size={20} />
              <strong>{scheduleSeen}</strong>
            </p>
          ) : null}
          {person.currentSchedule ? (
            <p>현재 일정 revision {person.currentSchedule.scheduleRevision}</p>
          ) : null}
          {identity?.confirmedRevision != null ? (
            <p>{person.displayName}이 확인한 일정 revision {identity.confirmedRevision}</p>
          ) : null}
          <p>최근 접속 · {coarseClubAccessLabel(person.lastClubAccessAt, now)}</p>
          <p className="rm-person-detail__row">
            <ReadmatesIcon name="info" size={20} />
            <span>페이지 열람 기록은 수집하지 않습니다.</span>
          </p>
          {links?.scheduleReviewHref || links?.historyHref ? (
            <div className="rm-person-detail__links">
              {links.scheduleReviewHref ? (
                <PersonActionLink to={links.scheduleReviewHref} LinkComponent={LinkComponent}>
                  일정 안내 검토
                </PersonActionLink>
              ) : null}
              {links.historyHref ? (
                <PersonActionLink to={links.historyHref} LinkComponent={LinkComponent}>
                  변경 이력 보기
                </PersonActionLink>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>

      <section className="rm-person-detail__section" aria-labelledby="person-rsvp-title">
        <span aria-hidden="true">02</span>
        <div>
          <h2 id="person-rsvp-title">참석 응답</h2>
          <p className="rm-person-detail__row" data-tone={rsvp.tone}>
            <ReadmatesIcon name={rsvp.icon} size={20} />
            <span>{rsvp.label}</span>
          </p>
          {rsvp.detail ? <p>{rsvp.detail}</p> : null}
          {links?.rsvpHistoryHref ? (
            <div className="rm-person-detail__links">
              <PersonActionLink to={links.rsvpHistoryHref} LinkComponent={LinkComponent}>
                응답 내역
              </PersonActionLink>
            </div>
          ) : null}
        </div>
      </section>

      <section
        className="rm-person-detail__section"
        role="region"
        aria-label="참석 기록"
      >
        <span aria-hidden="true">03</span>
        <div>
          <h2 id="person-attendance-title">실제 출석</h2>
          {attendanceItems.length === 0 ? (
            <p>아직 확인된 참석 기록이 없습니다.</p>
          ) : (
            <ol className="rm-person-detail__attendance">
              {attendanceItems.map((item) => {
                const state = attendancePresentation(item.attendanceStatus);
                const title = identity?.attendanceTitles?.[item.sessionNumber];
                return (
                  <li key={`${item.sessionNumber}:${item.scheduledAt}:${item.attendanceStatus}`}>
                    <strong>
                      {localDateLabel(item.scheduledAt)} · {title ?? `${item.sessionNumber}회 모임`}
                    </strong>
                    <span data-tone={state.tone}>
                      <ReadmatesIcon name={state.icon} size={20} />
                      {state.label}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
          {loadMoreError ? <p role="alert">참석 기록을 더 불러오지 못했습니다. 보이는 기록은 그대로 유지됩니다.</p> : null}
          {nextCursor ? (
            <div className="rm-person-detail__links">
              <button type="button" disabled={loadingMore} onClick={onLoadMore}>
                {loadMoreLabel}
                {loadingMore ? null : <ReadmatesIcon name="chevron-right" size={16} />}
              </button>
            </div>
          ) : null}
        </div>
      </section>

      <section className="rm-person-detail__section" aria-labelledby="person-management-title">
        <span aria-hidden="true">04</span>
        <div>
          <h2 id="person-management-title">멤버십</h2>
          <details>
            <summary className="rm-person-detail__row">
              <span>{membershipLine}</span>
              <ReadmatesIcon name="chevron-down" size={20} />
            </summary>
          </details>
          <div className="rm-person-detail__links rm-host-person__management">
            <PersonActionLink to={peopleHref} LinkComponent={LinkComponent}>
              멤버 정보 관리
            </PersonActionLink>
          </div>
        </div>
      </section>
    </main>
  );
}
