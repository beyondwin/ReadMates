import type { ComponentType, ReactNode } from "react";
import type { HostPersonDetailView as PersonDetail } from "@/features/host/model/host-person-detail-model";
import { hostMeetingLifecycleLabel } from "@/shared/model/meeting-language";
import { AvatarChip } from "@/shared/ui/avatar-chip";
import "./host-person-detail.css";

type PersonLinkProps = { to: string; className?: string; children: ReactNode };

const DefaultLink: ComponentType<PersonLinkProps> = ({ to, children, ...props }) => (
  <a {...props} href={to}>{children}</a>
);

const statusLabels: Record<PersonDetail["status"], string> = {
  INVITED: "초대됨",
  VIEWER: "둘러보기",
  ACTIVE: "활동",
  SUSPENDED: "쉬는 중",
  LEFT: "탈퇴",
  INACTIVE: "비활성",
};

const rsvpLabels: Record<NonNullable<PersonDetail["currentRsvp"]>, string> = {
  NO_RESPONSE: "응답 없음",
  GOING: "참석 예정",
  MAYBE: "미정",
  DECLINED: "불참 예정",
};

const attendanceLabels = {
  UNKNOWN: "출석 미확인",
  ATTENDED: "참석",
  ABSENT: "불참",
} as const;

function coarseClubAccessLabel(value: string | null, now = new Date()) {
  if (!value) return "접속 기록 없음";
  const observed = new Date(value);
  if (Number.isNaN(observed.getTime())) return "접속 기록 없음";
  const days = Math.max(0, Math.floor((now.getTime() - observed.getTime()) / 86_400_000));
  if (days <= 7) return "최근 접속 7일 이내";
  if (days <= 30) return "최근 접속 30일 이내";
  if (days <= 90) return "최근 접속 90일 이내";
  return "최근 접속 90일 이전";
}

function localDateTime(value: string) {
  return value.replace("T", " ").slice(0, 16);
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
  LinkComponent?: ComponentType<PersonLinkProps>;
}) {
  return (
    <main className="rm-host-person">
      <header className="rm-host-person__header">
        <LinkComponent to={peopleHref} className="rm-host-person__return">사람 목록으로</LinkComponent>
        <div className="rm-host-person__identity">
          <AvatarChip avatarKey={person.avatarKey} name={person.displayName} label="" sizeRole="profile" />
          <div>
            <h1>{person.displayName}</h1>
            <p>{person.role === "HOST" ? "공동 호스트" : "멤버"} · {statusLabels[person.status]}</p>
          </div>
        </div>
      </header>

      <div className="rm-host-person__body">
        <section className="rm-host-person__facts" aria-labelledby="person-current-title">
          <h2 id="person-current-title">현재 상태</h2>
          <dl>
            <div><dt>최근 접속</dt><dd>{coarseClubAccessLabel(person.lastClubAccessAt, now)}</dd></div>
            <div>
              <dt>현재 일정</dt>
              <dd>
                {person.currentSchedule
                  ? `일정 ${person.currentSchedule.scheduleRevision}판 · ${hostMeetingLifecycleLabel(person.currentSchedule.state)} · ${localDateTime(person.currentSchedule.scheduledAt)}`
                  : "현재 일정 없음"}
              </dd>
            </div>
            <div><dt>참석 응답</dt><dd>{person.currentRsvp ? rsvpLabels[person.currentRsvp] : "현재 응답 없음"}</dd></div>
          </dl>
          <p className="small">페이지 열람 기록은 수집하지 않습니다.</p>
        </section>

        <section className="rm-host-person__attendance" aria-label="참석 기록">
          <h2>참석 기록</h2>
          {attendanceItems.length === 0 ? (
            <p className="small">아직 확인된 참석 기록이 없습니다.</p>
          ) : (
            <ol>
              {attendanceItems.map((item) => (
                <li key={`${item.sessionNumber}:${item.scheduledAt}:${item.attendanceStatus}`}>
                  <strong>{item.sessionNumber}회 모임</strong>
                  <span>{localDateTime(item.scheduledAt)}</span>
                  <span>{attendanceLabels[item.attendanceStatus]}</span>
                </li>
              ))}
            </ol>
          )}
          {loadMoreError ? <p role="alert">참석 기록을 더 불러오지 못했습니다. 보이는 기록은 그대로 유지됩니다.</p> : null}
          {nextCursor ? (
            <button
              type="button"
              className="btn btn-ghost"
              disabled={loadingMore}
              onClick={onLoadMore}
            >
              {loadingMore ? "불러오는 중" : loadMoreError ? "참석 기록 다시 시도" : "참석 기록 더 보기"}
            </button>
          ) : null}
        </section>

        <section className="rm-host-person__management" aria-labelledby="person-management-title">
          <h2 id="person-management-title">멤버십 관리</h2>
          <p>상태 변경은 서버가 허용한 현재 권한과 조건을 확인할 수 있는 사람 관리 원장에서 진행합니다.</p>
          <LinkComponent to={peopleHref} className="btn btn-quiet">사람 관리 원장으로</LinkComponent>
        </section>
      </div>
    </main>
  );
}
