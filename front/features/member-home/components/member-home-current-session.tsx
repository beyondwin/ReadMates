import { Link } from "@/src/app/router-link";
import { type CSSProperties } from "react";
import type { CurrentSessionResponse } from "@/shared/api/readmates";
import { safeExternalHttpsUrl } from "@/shared/security/safe-external-url";
import { BookCover } from "@/shared/ui/book-cover";
import { displayText, formatDateLabel, formatDeadlineLabel, rsvpLabel } from "@/shared/ui/readmates-display";

type CurrentSession = NonNullable<CurrentSessionResponse["currentSession"]>;

export type MobileIconName = "archive" | "arrow-right" | "arrow-up-right" | "book" | "check" | "host" | "link" | "notes" | "sparkle";

function mobilePrepStepsFor(session: CurrentSession) {
  return [
    {
      id: "rsvp",
      label: "참석",
      done: session.myRsvpStatus !== "NO_RESPONSE",
      hint: rsvpLabel(session.myRsvpStatus),
    },
    {
      id: "read",
      label: "읽기",
      done: session.myCheckin !== null,
      hint: `${session.myCheckin?.readingProgress ?? 0}%`,
    },
    {
      id: "q",
      label: "질문",
      done: session.myQuestions.length > 0,
      hint: `${session.myQuestions.length}/5`,
    },
    {
      id: "one",
      label: "한줄평",
      done: session.myOneLineReview !== null,
      hint: session.myOneLineReview ? "완료" : "언제든",
    },
  ];
}

function daysUntilLabel(dateValue: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateValue);

  if (!match) {
    return null;
  }

  const [, year, month, day] = match;
  const target = new Date(Number(year), Number(month) - 1, Number(day));
  const today = new Date();
  const normalizedToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diffDays = Math.round((target.getTime() - normalizedToday.getTime()) / 86_400_000);

  if (diffDays === 0) {
    return "오늘";
  }

  return diffDays > 0 ? `${diffDays}일 후` : `${Math.abs(diffDays)}일 전`;
}

export function MobileIcon({ name, size = 18, style }: { name: MobileIconName; size?: number; style?: CSSProperties }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    style,
  };

  if (name === "archive") {
    return (
      <svg {...common}>
        <rect x="3" y="3" width="18" height="4" rx="1" />
        <path d="M5 7v13a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V7M10 11h4" />
      </svg>
    );
  }

  if (name === "arrow-right") {
    return (
      <svg {...common}>
        <path d="M5 12h14M13 6l6 6-6 6" />
      </svg>
    );
  }

  if (name === "arrow-up-right") {
    return (
      <svg {...common}>
        <path d="M7 17 17 7M9 7h8v8" />
      </svg>
    );
  }

  if (name === "book") {
    return (
      <svg {...common}>
        <path d="M5 4a2 2 0 0 1 2-2h12v18H7a2 2 0 0 0-2 2V4z" />
        <path d="M5 20a2 2 0 0 0 2-2h12" />
      </svg>
    );
  }

  if (name === "check") {
    return (
      <svg {...common}>
        <path d="M4 12l5 5L20 6" />
      </svg>
    );
  }

  if (name === "host") {
    return (
      <svg {...common}>
        <path d="M4 20V10l8-6 8 6v10a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z" />
      </svg>
    );
  }

  if (name === "link") {
    return (
      <svg {...common}>
        <path d="M10 14a5 5 0 0 0 7.07 0l3-3a5 5 0 1 0-7.07-7.07l-1.5 1.5" />
        <path d="M14 10a5 5 0 0 0-7.07 0l-3 3a5 5 0 1 0 7.07 7.07l1.5-1.5" />
      </svg>
    );
  }

  if (name === "notes") {
    return (
      <svg {...common}>
        <rect x="4" y="3" width="16" height="18" rx="2" />
        <path d="M8 8h8M8 12h8M8 16h5" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <path d="M12 3v5M12 16v5M3 12h5M16 12h5" />
      <path d="M6 6l3 3M15 15l3 3M18 6l-3 3M9 15l-3 3" />
    </svg>
  );
}

export function MobileCurrentSessionCard({
  session,
  isHost,
}: {
  session: CurrentSession | null;
  isHost: boolean;
}) {
  if (!session) {
    return (
      <article className="m-card rm-member-session-card rm-member-session-card--empty">
        <div className="eyebrow">다음 모임</div>
        <h2 className="h3 editorial" style={{ margin: "8px 0 6px" }}>
          아직 열린 세션이 없습니다
        </h2>
        <p className="small" style={{ color: "var(--text-2)", margin: 0 }}>
          호스트가 다음 세션을 등록하면 RSVP와 질문 작성이 열립니다.
        </p>
        {isHost ? (
          <Link to="/app/host/sessions/new" className="btn btn-primary" style={{ marginTop: 16, width: "100%" }}>
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
  const meetingUrl = safeExternalHttpsUrl(session.meetingUrl);
  const dday = daysUntilLabel(session.date);
  const attendance = {
    attended: session.attendees.filter((attendee) => attendee.rsvpStatus === "GOING").length,
    total: session.attendees.length,
  };

  return (
    <article className="m-card rm-member-session-card">
      <div className="rm-member-session-card__head">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="rm-member-session-card__meta-line">
            <div className="eyebrow">이번 세션{dday ? ` · ${dday}` : ""}</div>
            <span className="badge badge-accent badge-dot">No.{String(session.sessionNumber).padStart(2, "0")}</span>
          </div>
          <h2 className="h3 editorial rm-member-session-card__title">{bookTitle}</h2>
          <div className="tiny" style={{ color: "var(--text-2)" }}>
            {bookAuthor}
          </div>
          <div className="tiny rm-member-session-card__meta">
            {dateLabel} · {session.startTime} – {session.endTime}
          </div>
          <div className="tiny" style={{ color: "var(--text-3)", marginTop: 2 }}>
            {locationLabel}
          </div>
        </div>
        <BookCover title={bookTitle} author={bookAuthor} imageUrl={session.bookImageUrl} width={92} className="rm-member-session-card__cover" />
      </div>

      <div className="rm-member-session-card__body">
        <div className="m-row-between" style={{ alignItems: "baseline", gap: 10 }}>
          <div className="eyebrow" style={{ fontSize: 10 }}>
            내 준비
          </div>
          <div className="tiny mono" style={{ color: "var(--text-3)" }}>
            질문 마감 {deadlineLabel}
          </div>
        </div>
        <div className="m-chips rm-member-session-card__prep">
          {mobilePrepStepsFor(session).map((step) => (
            <span key={step.id} className={`m-chip${step.done ? " m-chip-done" : ""}`}>
              {step.done ? <MobileIcon name="check" size={11} /> : null}
              {step.label}
              <span style={{ color: "var(--text-3)", fontWeight: 400 }}> · {step.hint}</span>
            </span>
          ))}
        </div>
        <div className="tiny" style={{ color: "var(--text-3)", marginTop: 12 }}>
          참석 {attendance.attended}/{attendance.total} · 현재 RSVP {rsvpLabel(session.myRsvpStatus)}
        </div>
        <Link to="/app/session/current" className="btn btn-primary rm-member-session-card__primary">
          세션 열기 <MobileIcon name="arrow-right" size={14} />
        </Link>
        {meetingUrl ? (
          <a className="rm-member-session-card__meeting" href={meetingUrl} target="_blank" rel="noreferrer">
            <span className="m-row" style={{ gap: 6 }}>
              <MobileIcon name="arrow-up-right" size={13} />
              모임 링크 열기
            </span>
            {session.meetingPasscode ? (
              <span className="tiny mono" style={{ color: "var(--text-3)" }}>
                · {session.meetingPasscode}
              </span>
            ) : null}
          </a>
        ) : null}
      </div>
    </article>
  );
}

export function MobileTodayActions({ session }: { session: CurrentSession | null }) {
  if (!session) {
    return (
      <section className="m-sec">
        <div className="m-eyebrow-row">
          <span className="eyebrow">오늘 할 일</span>
          <span className="tiny mono" style={{ color: "var(--text-3)" }}>
            0 actions
          </span>
        </div>
        <div className="m-card-quiet">
          <p className="small" style={{ color: "var(--text-2)", margin: 0 }}>
            현재 열려 있는 준비 항목이 없습니다.
          </p>
        </div>
      </section>
    );
  }

  const readingProgress = session.myCheckin?.readingProgress ?? 0;
  const meetingUrl = safeExternalHttpsUrl(session.meetingUrl);
  const meetingHref = meetingUrl ?? "/app/session/current";
  const meetingSub = session.meetingPasscode ?? session.locationLabel;

  return (
    <section className="m-sec">
      <div className="m-eyebrow-row">
        <span className="eyebrow">오늘 할 일</span>
        <span className="tiny mono" style={{ color: "var(--text-3)" }}>
          3 actions
        </span>
      </div>
      <div className="m-action-grid">
        <MobileActionTile label="읽기 체크인" sub={`${readingProgress}%`} href="/app/session/current" icon="01" />
        <MobileActionTile label="질문 쓰기" sub={`${session.myQuestions.length}/5 작성`} href="/app/session/current" icon="02" />
        <MobileActionTile
          label="모임 확인"
          sub={meetingSub}
          href={meetingHref}
          icon="03"
          external={Boolean(meetingUrl)}
        />
      </div>
    </section>
  );
}

function MobileActionTile({
  label,
  sub,
  href,
  icon,
  external = false,
}: {
  label: string;
  sub: string;
  href: string;
  icon: string;
  external?: boolean;
}) {
  const content = (
    <>
      <span className="tiny mono" aria-hidden>
        {icon}
      </span>
      <span className="m-action-tile__text">
        <span className="body m-action-tile__label" style={{ display: "block", fontSize: 13.5, fontWeight: 600, lineHeight: 1.35 }}>
          {label}
        </span>
        <span className="tiny m-action-tile__sub" style={{ display: "block", color: "var(--text-3)", marginTop: 3 }}>
          {sub}
        </span>
      </span>
    </>
  );

  if (external) {
    return (
      <a className="m-action-tile" href={href} target="_blank" rel="noreferrer" aria-label={`${label} ${sub}`}>
        {content}
      </a>
    );
  }

  return (
    <Link className="m-action-tile" to={href} aria-label={`${label} ${sub}`}>
      {content}
    </Link>
  );
}
