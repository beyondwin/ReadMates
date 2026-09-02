import type { ComponentType, ReactNode } from "react";
import type { HostPersonDetailView as PersonDetail } from "@/features/host/model/host-person-detail-model";
import { hostMeetingLifecycleLabel } from "@/shared/model/meeting-language";
import { AvatarChip } from "@/shared/ui/avatar-chip";
import "./host-person-detail.css";

type PersonLinkProps = { to: string; className?: string; children: ReactNode };

const DefaultLink: ComponentType<PersonLinkProps> = ({ to, children, ...props }) => (
  <a {...props} href={to}>{children}</a>
);

export type HostPersonIdentityFacts = {
  folioLabel?: string;
  tenureLabel?: string;
  joinedLabel?: string;
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

function coarseClubAccessLabel(value: string | null, now = new Date()) {
  if (!value) return "접속 기록 없음";
  const observed = new Date(value);
  if (Number.isNaN(observed.getTime())) return "접속 기록 없음";
  const days = Math.max(0, Math.floor((now.getTime() - observed.getTime()) / 86_400_000));
  if (days <= 1) return "어제";
  if (days <= 7) return "최근 접속 7일 이내";
  if (days <= 30) return "최근 접속 30일 이내";
  if (days <= 90) return "최근 접속 90일 이내";
  return "최근 접속 90일 이전";
}

function localDateTime(value: string) {
  return value.replace("T", " ").slice(0, 16);
}

function BlockTitle({
  id,
  index,
  children,
}: {
  id: string;
  index: string;
  children: ReactNode;
}) {
  return (
    <h2 id={id} className="rm-host-person__block-title">
      <span className="rm-host-person__index" aria-hidden="true">{index}</span>
      {children}
    </h2>
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
  LinkComponent?: ComponentType<PersonLinkProps>;
}) {
  const scheduleSeen = person.currentSchedule
    ? `일정 ${person.currentSchedule.scheduleRevision}판 · ${hostMeetingLifecycleLabel(person.currentSchedule.state)}`
    : "일정 없음";
  const tenure = identity?.tenureLabel?.trim();
  const joined = identity?.joinedLabel?.trim();
  const roleLabel = person.role === "HOST" ? "공동 호스트" : "멤버";

  return (
    <main className="rm-host-person">
      <header className="rm-host-person__header">
        <LinkComponent to={peopleHref} className="rm-host-person__return">
          <span aria-hidden="true">← </span>사람 목록으로
        </LinkComponent>
        <div className="rm-host-person__identity">
          <AvatarChip avatarKey={person.avatarKey} name={person.displayName} label="" sizeRole="profile" />
          <div>
            <p className="rm-host-person__folio">{identity?.folioLabel ?? "FOLIO"}</p>
            <h1>{person.displayName}</h1>
            <p className="rm-host-person__tenure">
              {statusLabels[person.status]}
              {tenure ? ` · ${tenure}` : ""}
            </p>
            {joined ? <p className="rm-host-person__joined">{joined}</p> : null}
          </div>
        </div>
      </header>

      <div className="rm-host-person__body">
        <section className="rm-host-person__block" aria-labelledby="person-schedule-title">
          <BlockTitle id="person-schedule-title" index="01">현재 일정</BlockTitle>
          <dl>
            <div>
              <dt>일정</dt>
              <dd>
                {person.currentSchedule
                  ? localDateTime(person.currentSchedule.scheduledAt)
                  : "일정 없음"}
              </dd>
            </div>
            <div>
              <dt>일정 확인</dt>
              <dd>{scheduleSeen}</dd>
            </div>
            <div>
              <dt>최근 접속</dt>
              <dd>{coarseClubAccessLabel(person.lastClubAccessAt, now)}</dd>
            </div>
          </dl>
          <p className="small">페이지 열람 기록은 수집하지 않습니다.</p>
        </section>

        <section className="rm-host-person__block" aria-labelledby="person-rsvp-title">
          <BlockTitle id="person-rsvp-title" index="02">참석 응답</BlockTitle>
          <p>{person.currentRsvp ? rsvpLabels[person.currentRsvp] : "현재 응답 없음"}</p>
        </section>

        <section
          className="rm-host-person__attendance rm-host-person__block"
          role="region"
          aria-label="참석 기록"
        >
          <BlockTitle id="person-attendance-title" index="03">실제 출석</BlockTitle>
          {attendanceItems.length === 0 ? (
            <p className="small">아직 확인된 참석 기록이 없습니다.</p>
          ) : (
            <ol>
              {attendanceItems.map((item) => (
                <li key={`${item.sessionNumber}:${item.scheduledAt}:${item.attendanceStatus}`}>
                  <strong>{item.sessionNumber}회 모임 · {localDateTime(item.scheduledAt)}</strong>
                  <span>{attendanceLabels[item.attendanceStatus]}</span>
                </li>
              ))}
            </ol>
          )}
          {loadMoreError ? <p role="alert">참석 기록을 더 불러오지 못했습니다. 보이는 기록은 그대로 유지됩니다.</p> : null}
          {nextCursor ? (
            <button
              type="button"
              className="rm-host-person__text-link"
              disabled={loadingMore}
              onClick={onLoadMore}
            >
              {loadingMore ? "불러오는 중" : loadMoreError ? "참석 기록 다시 시도" : "참석 기록 더 보기"}
            </button>
          ) : null}
        </section>

        <section className="rm-host-person__management rm-host-person__block" aria-labelledby="person-management-title">
          <BlockTitle id="person-management-title" index="04">멤버십</BlockTitle>
          <p>{statusLabels[person.status]} · {roleLabel}</p>
          <LinkComponent to={peopleHref} className="rm-host-person__text-link">사람 관리 원장으로</LinkComponent>
          <details className="rm-host-person__aux">
            <summary>세부 조작</summary>
            <p>상태 변경은 서버가 허용한 현재 권한과 조건을 확인할 수 있는 사람 관리 원장에서 진행합니다.</p>
          </details>
        </section>
      </div>
    </main>
  );
}
