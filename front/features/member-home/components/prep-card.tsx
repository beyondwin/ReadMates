import { Link } from "@/src/app/router-link";
import type { MemberHomeCurrentSessionResponse as CurrentSessionResponse } from "@/features/member-home/api/member-home-contracts";
import { safeExternalHttpsUrl } from "@/shared/security/safe-external-url";
import { BookCover } from "@/shared/ui/book-cover";
import { displayText, formatDateLabel, formatDeadlineLabel, rsvpLabel } from "@/shared/ui/readmates-display";

type CurrentSession = NonNullable<CurrentSessionResponse["currentSession"]>;

function activeAttendees(session: CurrentSession) {
  return session.attendees.filter((attendee) => (attendee.participationStatus ?? "ACTIVE") === "ACTIVE");
}

function goingCount(session: CurrentSession) {
  return activeAttendees(session).filter((attendee) => attendee.rsvpStatus === "GOING").length;
}

function prepStepsFor(session: CurrentSession) {
  return [
    {
      label: "RSVP",
      hint: rsvpLabel(session.myRsvpStatus),
      done: session.myRsvpStatus !== "NO_RESPONSE",
    },
    {
      label: "읽기 진행률",
      hint: session.myCheckin ? `${session.myCheckin.readingProgress}%` : "아직",
      done: session.myCheckin !== null,
    },
    {
      label: "질문 작성",
      hint: `${session.myQuestions.length}/5`,
      done: session.myQuestions.length > 0,
    },
    {
      label: "피드백 문서",
      hint: "세션 후",
      done: false,
    },
  ];
}

function daysUntilPhrase(dateValue: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateValue);

  if (!match) {
    return "일정 미정";
  }

  const [, year, month, day] = match;
  const target = new Date(Number(year), Number(month) - 1, Number(day));
  const today = new Date();
  const normalizedToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diffDays = Math.round((target.getTime() - normalizedToday.getTime()) / 86_400_000);

  if (diffDays === 0) {
    return "D-day";
  }

  if (diffDays > 0) {
    return `D-${diffDays}`;
  }

  return `D+${Math.abs(diffDays)}`;
}

export function PrepCard({
  session,
  isHost = false,
  isViewer = false,
}: {
  session: CurrentSession | null;
  isHost?: boolean;
  isViewer?: boolean;
}) {
  if (session === null) {
    return (
      <article className="rm-reading-desk rm-prep-card rm-prep-card--empty" style={{ padding: "36px", position: "relative" }}>
        <p className="eyebrow" style={{ margin: 0 }}>
          현재 세션 작업대
        </p>
        <h2 className="editorial" style={{ fontSize: "30px", lineHeight: 1.2, margin: "12px 0 6px" }}>
          아직 열린 세션이 없습니다
        </h2>
        <p className="body" style={{ color: "var(--text-2)", margin: 0 }}>
          다음 책이 등록되면 이곳에 책, 일정, 질문 마감, 준비 상태가 한 번에 표시됩니다.
        </p>
        {isHost ? (
          <Link to="/app/host/sessions/new" className="btn btn-primary" style={{ marginTop: "22px" }}>
            새 세션 만들기
          </Link>
        ) : null}
      </article>
    );
  }

  const bookTitle = displayText(session.bookTitle, "책 정보 준비 중");
  const bookAuthor = displayText(session.bookAuthor, "저자 미정");
  const dateLabel = formatDateLabel(session.date, "일정 미정");
  const deadlineLabel = formatDeadlineLabel(session.questionDeadlineAt, "마감 미정");
  const locationLabel = displayText(session.locationLabel, "장소 미정");
  const sessionTimingLabel = daysUntilPhrase(session.date);
  const meetingUrl = safeExternalHttpsUrl(session.meetingUrl);
  const prepSteps = prepStepsFor(session);
  const attendees = activeAttendees(session);
  const attendance = {
    attended: goingCount(session),
    total: attendees.length,
  };

  return (
    <article className="rm-reading-desk rm-prep-card rm-prep-card--desk" aria-label={`${bookTitle} 읽기 작업대`}>
      <div className="rm-prep-card__main">
        <div className="rm-prep-card__head">
          <BookCover
            title={bookTitle}
            author={bookAuthor}
            imageUrl={session.bookImageUrl}
            width={132}
            className="rm-prep-card__cover"
          />
          <div style={{ minWidth: 0, overflowWrap: "anywhere" }}>
            <div className="rm-prep-card__meta-line">
              <p className="eyebrow" style={{ margin: 0 }}>
                No.{String(session.sessionNumber).padStart(2, "0")} · {sessionTimingLabel}
              </p>
            </div>
            <h2 className="h3 editorial rm-prep-card__title">{bookTitle}</h2>
            <p className="small" style={{ margin: "2px 0 0" }}>
              {bookAuthor}
            </p>
            <p className="small rm-prep-card__schedule">
              {dateLabel} {session.startTime} – {session.endTime} · {locationLabel}
            </p>
            <p className="tiny mono rm-prep-card__deadline">질문 마감 {deadlineLabel}</p>
          </div>
        </div>

        <p className="tiny mono rm-prep-card__attendance">
          <span>
            참석 {attendance.attended} / 전체 {attendance.total}
          </span>
          <span aria-hidden> · </span>
          <span>현재 RSVP: {rsvpLabel(session.myRsvpStatus)}</span>
        </p>
        {isViewer ? (
          <div className="rm-locked-state rm-prep-card__viewer-note" role="note">
            <p className="eyebrow" style={{ margin: 0 }}>
              읽기 전용
            </p>
            <p className="small" style={{ margin: "6px 0 0" }}>
              둘러보기 멤버는 세션을 읽을 수 있고, RSVP와 읽기 진행률, 질문, 서평 작성은 정식 멤버에게 열립니다.
            </p>
          </div>
        ) : null}
      </div>

      <div className="rm-prep-card__ledger" aria-label="준비 진행 상태">
        <div className="eyebrow" style={{ marginBottom: "12px" }}>
          내 준비 현황
        </div>
        {prepSteps.map((step) => (
          <div key={step.label} className="rm-prep-card__ledger-row">
            <span className="small">{step.label}</span>
            <span className={`badge ${step.done ? "badge-ok" : isViewer ? "rm-state rm-state--readonly" : ""} badge-dot`}>
              {isViewer ? "제한" : step.hint}
            </span>
          </div>
        ))}
      </div>

      <div className="rm-prep-card__actions">
        <Link to="/app/session/current" className="btn btn-primary rm-prep-card__primary">
          세션 열기
        </Link>
        {meetingUrl ? (
          <a className="btn btn-ghost rm-prep-card__secondary" href={meetingUrl} target="_blank" rel="noreferrer">
            모임 링크 열기
          </a>
        ) : null}
        {session.meetingPasscode ? (
          <span className="tiny mono rm-prep-card__passcode">Passcode · {session.meetingPasscode}</span>
        ) : null}
        {isHost ? (
          <Link to={`/app/host/sessions/${session.sessionId}/edit`} className="btn btn-quiet btn-sm rm-prep-card__host-link">
            세션 운영으로
          </Link>
        ) : null}
      </div>
    </article>
  );
}
