import { Link } from "@/src/app/router-link";
import type { CurrentSessionResponse } from "@/shared/api/readmates";
import { safeExternalHttpsUrl } from "@/shared/security/safe-external-url";
import { BookCover } from "@/shared/ui/book-cover";
import { displayText, formatDateLabel, formatDeadlineLabel, rsvpLabel } from "@/shared/ui/readmates-display";

type CurrentSession = NonNullable<CurrentSessionResponse["currentSession"]>;

function goingCount(session: CurrentSession) {
  return session.attendees.filter((attendee) => attendee.rsvpStatus === "GOING").length;
}

function prepStepsFor(session: CurrentSession) {
  return [
    {
      label: "RSVP",
      hint: rsvpLabel(session.myRsvpStatus),
      done: session.myRsvpStatus !== "NO_RESPONSE",
    },
    {
      label: "읽기 체크인",
      hint: `${session.myCheckin?.readingProgress ?? 0}%`,
      done: session.myCheckin !== null,
    },
    {
      label: "질문 작성",
      hint: `${session.myQuestions.length}/5`,
      done: session.myQuestions.length > 0,
    },
    {
      label: "한줄평",
      hint: session.myOneLineReview ? "작성 완료" : "언제든",
      done: session.myOneLineReview !== null,
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
    return "오늘";
  }

  if (diffDays > 0) {
    return `${diffDays}일 후`;
  }

  return `${Math.abs(diffDays)}일 전`;
}

export function PrepCard({
  session,
  isHost = false,
}: {
  session: CurrentSession | null;
  isHost?: boolean;
}) {
  if (session === null) {
    return (
      <article className="surface rm-prep-card rm-prep-card--empty" style={{ padding: "36px", position: "relative" }}>
        <p className="eyebrow" style={{ margin: 0 }}>
          다음 모임
        </p>
        <h2 className="editorial" style={{ fontSize: "30px", lineHeight: 1.2, margin: "12px 0 6px" }}>
          아직 열린 세션이 없습니다
        </h2>
        <p className="body" style={{ color: "var(--text-2)", margin: 0 }}>
          호스트가 다음 세션을 등록하면 RSVP와 질문 작성이 열립니다.
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
  const attendance = {
    attended: goingCount(session),
    total: session.attendees.length,
  };

  return (
    <article className="surface rm-prep-card rm-prep-card--compact">
      <div className="rm-prep-card__main">
        <div className="rm-prep-card__head">
          <div style={{ minWidth: 0, overflowWrap: "anywhere" }}>
            <div className="rm-prep-card__meta-line">
              <p className="eyebrow" style={{ margin: 0 }}>
                이번 세션 · {sessionTimingLabel}
              </p>
              <span className="badge badge-accent badge-dot">No.{String(session.sessionNumber).padStart(2, "0")}</span>
            </div>
            <h2 className="h3 editorial rm-prep-card__title">{bookTitle}</h2>
            <p className="small" style={{ margin: "2px 0 0" }}>
              {bookAuthor}
            </p>
            <p className="small rm-prep-card__schedule">
              {dateLabel} {session.startTime} – {session.endTime} · {locationLabel}
            </p>
            {meetingUrl ? (
              <div className="rm-prep-card__meeting-row">
                <a className="btn btn-ghost btn-sm" href={meetingUrl} target="_blank" rel="noreferrer">
                  ↗ 모임 링크 열기
                </a>
                {session.meetingPasscode ? (
                  <span className="tiny mono" style={{ color: "var(--text-3)", alignSelf: "center" }}>
                    Passcode · {session.meetingPasscode}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <div className="rm-prep-card__steps">
          {prepSteps.map((step) => (
            <span key={step.label} className={`badge ${step.done ? "badge-ok" : ""} badge-dot`}>
              {step.label} · <span>{step.hint}</span>
            </span>
          ))}
        </div>

        <p className="tiny mono rm-prep-card__attendance">
          <span>
            참석 {attendance.attended} / 전체 {attendance.total}
          </span>
          <span aria-hidden> · </span>
          <span>현재 RSVP: {rsvpLabel(session.myRsvpStatus)}</span>
          <span aria-hidden> · </span>
          <span>질문 마감 {deadlineLabel}</span>
        </p>
      </div>

      <div className="rm-prep-card__cover-pane">
        <BookCover
          title={bookTitle}
          author={bookAuthor}
          imageUrl={session.bookImageUrl}
          width={124}
          className="rm-prep-card__cover"
        />
      </div>

      <Link to="/app/session/current" className="rm-prep-card__open-card" aria-label={`세션 열기: ${bookTitle}`}>
        <span className="rm-prep-card__open-text">세션 열기</span>
        <span className="rm-prep-card__open-chevron" aria-hidden>
          ›
        </span>
      </Link>
    </article>
  );
}
