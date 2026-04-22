"use client";

import { type CSSProperties, useState } from "react";
import type { ArchiveSessionItem, FeedbackDocumentListItem, MyArchiveQuestionItem, MyArchiveReviewItem, SessionState } from "@/shared/api/readmates";
import { BookCover } from "@/shared/ui/book-cover";
import { formatDateOnlyLabel } from "@/shared/ui/readmates-display";
import { SessionIdentity } from "@/shared/ui/session-identity";

export type ArchiveView = "sessions" | "reviews" | "questions" | "report";

type SessionRecord = {
  id: string;
  number: number;
  date: string;
  book: string;
  author: string;
  bookImageUrl: string | null;
  attendance: number;
  total: number;
  published: boolean;
  state: SessionState;
};

type ReportActionIconName = "read" | "download";

const archiveTabs: Array<{ key: ArchiveView; label: string }> = [
  { key: "sessions", label: "세션" },
  { key: "reviews", label: "내 서평" },
  { key: "questions", label: "내 질문" },
  { key: "report", label: "피드백 문서" },
];

const mobileArchiveTabs: Array<{ key: ArchiveView; label: string }> = [
  { key: "sessions", label: "세션" },
  { key: "reviews", label: "내 서평" },
  { key: "questions", label: "내 질문" },
  { key: "report", label: "피드백 문서" },
];

const UNKNOWN_SESSION_YEAR_LABEL = "미정";
const SESSION_YEAR_GROUP_PATTERN = /^(\d{4})(?:-(\d{2})(?:-(\d{2})(?:(?:T|\s).*)?)?)?$/;

function toSessionRecord(session: ArchiveSessionItem): SessionRecord {
  return {
    id: session.sessionId,
    number: session.sessionNumber,
    date: session.date,
    book: session.bookTitle,
    author: session.bookAuthor,
    bookImageUrl: session.bookImageUrl,
    attendance: session.attendance,
    total: session.total,
    published: session.published,
    state: session.state,
  };
}

function appSessionHref(sessionId: string, hash?: string) {
  return `/app/sessions/${encodeURIComponent(sessionId)}${hash ? `#${hash}` : ""}`;
}

function formatSessionMonthDayLabel(date: string) {
  return formatDateOnlyLabel(date).replace(/^\d{4}\./, "");
}

function isValidSessionYearGroupDate(year: string, month?: string, day?: string, rawDate?: string) {
  if (!month) {
    return true;
  }

  const monthNumber = Number(month);
  if (monthNumber < 1 || monthNumber > 12) {
    return false;
  }

  if (!day) {
    return true;
  }

  if (rawDate && rawDate.length > 10 && Number.isNaN(new Date(rawDate).getTime())) {
    return false;
  }

  const date = new Date(`${year}-${month}-${day}T00:00:00`);
  return (
    !Number.isNaN(date.getTime()) &&
    date.getFullYear() === Number(year) &&
    date.getMonth() + 1 === monthNumber &&
    date.getDate() === Number(day)
  );
}

function sessionYearGroupKey(date: string) {
  const trimmedDate = date.trim();
  const match = SESSION_YEAR_GROUP_PATTERN.exec(trimmedDate);
  if (!match) {
    return UNKNOWN_SESSION_YEAR_LABEL;
  }

  const [, year, month, day] = match;
  return isValidSessionYearGroupDate(year, month, day, trimmedDate) ? year : UNKNOWN_SESSION_YEAR_LABEL;
}

function ReportActionIcon({ name }: { name: ReportActionIconName }) {
  const common = {
    width: 13,
    height: 13,
    viewBox: "0 0 20 20",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  if (name === "download") {
    return (
      <svg {...common}>
        <path d="M10 3v10M5 9l5 4 5-4M4 17h12" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <path d="M6 14L14 6M7 6h7v7" />
    </svg>
  );
}

function archiveSummary({
  sessions,
  questions,
  reviews,
}: {
  sessions: SessionRecord[];
  questions: MyArchiveQuestionItem[];
  reviews: MyArchiveReviewItem[];
}) {
  const bookCount = new Set(sessions.map((session) => session.book)).size;
  return `${sessions.length}회 · ${bookCount}권 · ${questions.length}개의 질문 · ${reviews.length}개의 서평`;
}

export default function ArchivePage({
  sessions,
  questions,
  reviews,
  reports,
  initialView = "sessions",
}: {
  sessions: ArchiveSessionItem[];
  questions: MyArchiveQuestionItem[];
  reviews: MyArchiveReviewItem[];
  reports: FeedbackDocumentListItem[];
  initialView?: ArchiveView;
}) {
  const [view, setView] = useState<ArchiveView>(initialView);
  const archiveSessions = sessions.map(toSessionRecord);

  return (
    <main className="rm-archive-page">
      <div className="desktop-only">
        <ArchiveDesktop
          view={view}
          setView={setView}
          sessions={archiveSessions}
          questions={questions}
          reviews={reviews}
          reports={reports}
        />
      </div>
      <div className="mobile-only">
        <ArchiveMobile
          view={view}
          setView={setView}
          sessions={archiveSessions}
          questions={questions}
          reviews={reviews}
          reports={reports}
        />
      </div>
    </main>
  );
}

function ArchiveDesktop({
  view,
  setView,
  sessions,
  questions,
  reviews,
  reports,
}: {
  view: ArchiveView;
  setView: (view: ArchiveView) => void;
  sessions: SessionRecord[];
  questions: MyArchiveQuestionItem[];
  reviews: MyArchiveReviewItem[];
  reports: FeedbackDocumentListItem[];
}) {
  return (
    <>
      <section className="page-header-compact">
        <div className="container">
          <div className="row-between" style={{ alignItems: "flex-end", flexWrap: "wrap" }}>
            <div>
              <p className="eyebrow" style={{ margin: 0 }}>
                아카이브
              </p>
              <h1 className="h1 editorial" style={{ margin: "6px 0 4px" }}>
                기록 저장소
              </h1>
              <p className="small" style={{ color: "var(--text-2)", margin: 0 }}>
                지난 모임과 내가 쓴 문장들을 회고합니다. 속도감보다 축적감.
              </p>
            </div>
            <div className="row" style={{ gap: "6px", flexWrap: "wrap" }} aria-label="아카이브 탭">
              {archiveTabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  aria-pressed={view === tab.key}
                  onClick={() => setView(tab.key)}
                  style={{
                    height: "32px",
                    padding: "0 14px",
                    fontSize: "13px",
                    borderRadius: "999px",
                    background: view === tab.key ? "var(--accent-soft)" : "transparent",
                    color: view === tab.key ? "var(--accent)" : "var(--text-2)",
                    border: `1px solid ${view === tab.key ? "var(--accent-line)" : "var(--line)"}`,
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section style={{ padding: "40px 0 80px" }}>
        <div className="container">
          {view === "sessions" ? <ArchiveSessions sessions={sessions} /> : null}
          {view === "reviews" ? <ArchiveReviews reviews={reviews} /> : null}
          {view === "questions" ? <ArchiveQuestions questions={questions} /> : null}
          {view === "report" ? <ArchiveReports reports={reports} /> : null}
        </div>
      </section>
    </>
  );
}

function ArchiveMobile({
  view,
  setView,
  sessions,
  questions,
  reviews,
  reports,
}: {
  view: ArchiveView;
  setView: (view: ArchiveView) => void;
  sessions: SessionRecord[];
  questions: MyArchiveQuestionItem[];
  reviews: MyArchiveReviewItem[];
  reports: FeedbackDocumentListItem[];
}) {
  return (
    <div className="rm-archive-mobile m-body">
      <section style={{ padding: "12px 18px 16px" }}>
        <div className="eyebrow">아카이브</div>
        <h1 className="h2 editorial" style={{ margin: "6px 0 6px" }}>
          읽어 온 자리
        </h1>
        <div className="small" style={{ color: "var(--text-2)" }}>
          {archiveSummary({ sessions, questions, reviews })}
        </div>
      </section>

      <div className="m-hscroll" style={{ padding: "0 18px 6px" }} aria-label="아카이브 모바일 탭">
        {mobileArchiveTabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            aria-pressed={view === tab.key}
            onClick={() => setView(tab.key)}
            className={`m-chip${view === tab.key ? " is-on" : ""}`}
            style={{ height: 32, padding: "0 14px" }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {view === "sessions" ? <ArchiveMobileSessions sessions={sessions} /> : null}
      {view === "reviews" ? <ArchiveMobileReviews reviews={reviews} /> : null}
      {view === "questions" ? <ArchiveMobileQuestions questions={questions} /> : null}
      {view === "report" ? <ArchiveMobileReports reports={reports} /> : null}
    </div>
  );
}

function ArchiveMobileSessions({ sessions }: { sessions: SessionRecord[] }) {
  if (sessions.length === 0) {
    return <MobileEmptyState message="아직 저장된 모임 기록이 없습니다." />;
  }

  return (
    <section className="m-sec">
      <div className="stack" style={{ "--stack": "10px" } as CSSProperties}>
        {sessions.map((session) => (
          <a
            key={session.id}
            href={appSessionHref(session.id)}
            className="rm-archive-session-card m-card"
            style={{ display: "grid", gridTemplateColumns: "52px minmax(0, 1fr)", gap: 14, width: "100%" }}
            aria-label={`No.${session.number} ${session.book} 열기`}
          >
            <BookCover title={session.book} author={session.author} imageUrl={session.bookImageUrl} width={52} />
            <div style={{ minWidth: 0 }}>
              <div className="tiny mono" style={{ color: "var(--text-3)" }}>
                No.{String(session.number).padStart(2, "0")} · {formatDateOnlyLabel(session.date)}
              </div>
              <div style={{ marginTop: 6 }}>
                <SessionIdentity
                  sessionNumber={session.number}
                  state={session.state}
                  date={session.date}
                  published={session.published}
                  feedbackDocumentAvailable={false}
                  compact
                />
              </div>
              <div className="editorial" style={{ fontSize: 16, margin: "4px 0 2px", lineHeight: 1.3 }}>
                {session.book}
              </div>
              <div className="tiny" style={{ color: "var(--text-3)" }}>
                {session.author}
              </div>
              <div className="m-row" style={{ gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                <span className="badge">
                  참석 {session.attendance}/{session.total}
                </span>
                {session.published ? <span className="badge badge-ok badge-dot">공개</span> : null}
                <span className="badge">문서</span>
              </div>
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}

function ArchiveMobileReviews({ reviews }: { reviews: MyArchiveReviewItem[] }) {
  if (reviews.length === 0) {
    return <MobileEmptyState message="아직 작성된 서평이 없습니다." />;
  }

  return (
    <section className="m-sec">
      <div className="stack" style={{ "--stack": "14px" } as CSSProperties}>
        {reviews.map((review) => (
          <a
            key={`${review.sessionId}-${review.kind}`}
            href={appSessionHref(review.sessionId, "mobile-my-records")}
            className="m-card"
            style={{ display: "block" }}
            aria-label={`No.${review.sessionNumber} ${review.bookTitle} 세션으로`}
          >
            <div className="tiny mono" style={{ color: "var(--text-3)" }}>
              {formatDateOnlyLabel(review.date)} · {review.bookTitle}
            </div>
            <div className="body editorial" style={{ fontSize: 15, marginTop: 8, lineHeight: 1.6 }}>
              {review.text}
            </div>
            <div className="m-row-between" style={{ marginTop: 12 }}>
              <span className="tiny" style={{ color: "var(--text-3)" }}>
                {review.kind === "ONE_LINE_REVIEW" ? "한줄평" : "장문 서평"}
              </span>
              <span aria-hidden style={{ color: "var(--text-3)" }}>
                ›
              </span>
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}

function ArchiveMobileQuestions({ questions }: { questions: MyArchiveQuestionItem[] }) {
  if (questions.length === 0) {
    return <MobileEmptyState message="아직 저장된 질문이 없습니다." />;
  }

  return (
    <section className="m-sec">
      <div className="stack" style={{ "--stack": "10px" } as CSSProperties}>
        {questions.map((question) => (
          <a
            key={`${question.sessionId}-${question.priority}-${question.text}`}
            href={appSessionHref(question.sessionId, "mobile-my-records")}
            className="m-card-quiet"
            style={{ display: "block" }}
            aria-label={`Q${question.priority} ${question.bookTitle} 세션으로`}
          >
            <div className="tiny mono" style={{ color: "var(--accent)" }}>
              Q{question.priority} · {formatDateOnlyLabel(question.date)}
            </div>
            <div className="body editorial" style={{ fontSize: 15, marginTop: 6, lineHeight: 1.55 }}>
              {question.text}
            </div>
            {question.draftThought ? (
              <div className="tiny" style={{ color: "var(--text-3)", marginTop: 8 }}>
                {question.draftThought}
              </div>
            ) : null}
          </a>
        ))}
      </div>
    </section>
  );
}

function ArchiveMobileReports({ reports }: { reports: FeedbackDocumentListItem[] }) {
  if (reports.length === 0) {
    return <MobileEmptyState message="아직 열람 가능한 피드백 문서가 없습니다." />;
  }

  return (
    <section className="m-sec">
      <div className="m-list">
        {reports.map((report) => {
          const label = `${report.bookTitle} · ${formatDateOnlyLabel(report.date)}`;

          return (
            <div key={report.sessionId} className="m-list-row" style={{ gridTemplateColumns: "40px minmax(0, 1fr) auto" }}>
              <span aria-hidden style={{ color: "var(--accent)", fontSize: 20 }}>
                ▤
              </span>
              <div style={{ minWidth: 0 }}>
                <div className="body" style={{ fontSize: 14 }}>
                  {label}
                </div>
                <div className="tiny mono" style={{ color: "var(--text-3)" }}>
                  No.{String(report.sessionNumber).padStart(2, "0")} · {report.title}
                </div>
              </div>
              <div className="m-row" style={{ gap: 4 }}>
                <a className="btn btn-quiet btn-sm" href={`/app/feedback/${report.sessionId}`} aria-label="읽기" title="읽기">
                  <ReportActionIcon name="read" />
                </a>
                <a
                  className="btn btn-quiet btn-sm"
                  href={`/app/feedback/${report.sessionId}/print`}
                  aria-label="PDF로 저장"
                  title="PDF로 저장"
                >
                  <ReportActionIcon name="download" />
                </a>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function MobileEmptyState({ message }: { message: string }) {
  return (
    <section className="m-sec">
      <div className="m-card-quiet">
        <p className="small" style={{ color: "var(--text-2)", margin: 0 }}>
          {message}
        </p>
      </div>
    </section>
  );
}

function ArchiveSessions({ sessions }: { sessions: SessionRecord[] }) {
  if (sessions.length === 0) {
    return <EmptyState message="아직 저장된 모임 기록이 없습니다." />;
  }

  const keyedSessions = sessions.map((session) => ({
    session,
    year: sessionYearGroupKey(session.date),
  }));
  const grouped = Array.from(new Set(keyedSessions.map(({ year }) => year))).map((year) => ({
    year,
    list: keyedSessions.filter((item) => item.year === year).map(({ session }) => session),
  }));

  return (
    <div>
      {grouped.map((group) => (
        <section key={group.year} style={{ marginBottom: "48px" }}>
          <div className="row" style={{ gap: "16px", alignItems: "baseline", marginBottom: "16px" }}>
            <h2
              className="display editorial"
              style={{ fontSize: "80px", letterSpacing: "-0.04em", color: "var(--text-4)", lineHeight: 1, margin: 0 }}
            >
              {group.year}
            </h2>
            <span className="tiny mono" style={{ color: "var(--text-3)" }}>
              {group.list.length}개 세션
            </span>
          </div>
          <div className="stack" style={{ "--stack": "0px" } as CSSProperties}>
            {group.list.map((session, index) => (
              <article
                key={session.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "90px minmax(0, 1fr) minmax(190px, auto) auto",
                  gap: "28px",
                  padding: "28px 0",
                  borderTop: index === 0 ? "1px solid var(--line)" : "1px solid var(--line-soft)",
                  alignItems: "center",
                }}
              >
                <div>
                  <SessionIdentity
                    sessionNumber={session.number}
                    state={session.state}
                    date={session.date}
                    published={session.published}
                    feedbackDocumentAvailable={false}
                    compact
                  />
                  <div className="tiny mono" style={{ color: "var(--text-4)", marginTop: "2px" }}>
                    {formatSessionMonthDayLabel(session.date)}
                  </div>
                </div>
                <div>
                  <h3 className="editorial" style={{ fontSize: "19px", margin: 0 }}>
                    {session.book}
                  </h3>
                  <div className="small" style={{ marginTop: "4px" }}>
                    {session.author}
                  </div>
                </div>
                <div className="row" style={{ gap: "10px", flexWrap: "wrap" }}>
                  <span className="badge">
                    참석 {session.attendance}/{session.total}
                  </span>
                  {session.published ? <span className="badge badge-ok badge-dot">공개</span> : null}
                  <span className="badge">문서</span>
                </div>
                <SessionAction session={session} />
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function SessionAction({ session }: { session: SessionRecord }) {
  const sessionLabel = `No.${session.number} ${session.book}`;

  return (
    <a className="btn btn-ghost btn-sm" href={appSessionHref(session.id)} aria-label={`${sessionLabel} 열기`}>
      열기 →
    </a>
  );
}

function ArchiveReviews({ reviews }: { reviews: MyArchiveReviewItem[] }) {
  if (reviews.length === 0) {
    return <EmptyState message="아직 작성된 서평이 없습니다." />;
  }

  return (
    <div className="grid-2">
      {reviews.map((review) => (
        <article key={`${review.sessionId}-${review.kind}`} className="surface" style={{ padding: "28px" }}>
          <div className="eyebrow">서평 · {formatDateOnlyLabel(review.date)}</div>
          <h2 className="h3 editorial" style={{ margin: "10px 0 0" }}>
            {review.bookTitle}
          </h2>
          <p className="body" style={{ color: "var(--text-2)", margin: "12px 0 0" }}>
            {review.text}
          </p>
          <div className="rule" style={{ marginTop: "16px" }}>
            <span className="mono">
              No.{String(review.sessionNumber).padStart(2, "0")} · {review.kind === "ONE_LINE_REVIEW" ? "한줄평" : "장문 서평"}
            </span>
            <a
              className="btn btn-ghost btn-sm"
              href={appSessionHref(review.sessionId, "my-records")}
              aria-label={`No.${review.sessionNumber} ${review.bookTitle} 세션으로`}
            >
              세션으로 →
            </a>
          </div>
        </article>
      ))}
    </div>
  );
}

function ArchiveQuestions({ questions }: { questions: MyArchiveQuestionItem[] }) {
  if (questions.length === 0) {
    return <EmptyState message="아직 저장된 질문이 없습니다." />;
  }

  return (
    <div className="stack" style={{ "--stack": "0px" } as CSSProperties}>
      {questions.map((question, index) => (
        <a
          key={`${question.sessionId}-${question.priority}-${question.text}`}
          href={appSessionHref(question.sessionId, "my-records")}
          aria-label={`Q${question.priority} ${question.bookTitle} 세션으로`}
          style={{
            display: "block",
            padding: "24px 0",
            borderTop: index === 0 ? "1px solid var(--line)" : "1px solid var(--line-soft)",
          }}
        >
          <div className="row-between" style={{ marginBottom: "8px" }}>
            <span className="tiny mono" style={{ color: "var(--text-3)" }}>
              Q{question.priority} · {formatDateOnlyLabel(question.date)}
            </span>
            <span className="tiny mono">
              No.{String(question.sessionNumber).padStart(2, "0")} · {question.bookTitle}
            </span>
          </div>
          <h2 className="body editorial" style={{ fontSize: "17px", margin: 0 }}>
            {question.text}
          </h2>
          {question.draftThought ? (
            <p className="small" style={{ color: "var(--text-3)", margin: "8px 0 0" }}>
              {question.draftThought}
            </p>
          ) : null}
        </a>
      ))}
    </div>
  );
}

function ArchiveReports({ reports }: { reports: FeedbackDocumentListItem[] }) {
  if (reports.length === 0) {
    return <EmptyState message="아직 열람 가능한 피드백 문서가 없습니다." />;
  }

  return (
    <div className="stack" style={{ "--stack": "0px" } as CSSProperties}>
      {reports.map((report, index) => (
          <article
            key={report.sessionId}
            style={{
              display: "grid",
              gridTemplateColumns: "64px minmax(0, 1fr) auto auto",
              gap: "20px",
              padding: "22px 0",
              borderTop: index === 0 ? "1px solid var(--line)" : "1px solid var(--line-soft)",
              alignItems: "center",
            }}
          >
            <span
              aria-hidden
              style={{
                width: "48px",
                height: "60px",
                border: "1px solid var(--line)",
                borderRadius: "3px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                background: "var(--bg-sub)",
                gap: "2px",
                color: "var(--accent)",
              }}
            >
              ▤
              <span className="tiny mono" style={{ fontSize: "9px", color: "var(--text-3)" }}>
                문서
              </span>
            </span>
            <div>
              <h2 className="editorial" style={{ fontSize: "16px", margin: 0 }}>
                {report.bookTitle} · {formatDateOnlyLabel(report.date)}
              </h2>
              <div className="tiny">No.{String(report.sessionNumber).padStart(2, "0")} · {report.title}</div>
              <div className="tiny mono" style={{ color: "var(--text-3)", marginTop: "4px" }}>
                {formatDateOnlyLabel(report.uploadedAt)} 등록
              </div>
            </div>
            <a className="btn btn-ghost btn-sm" href={`/app/feedback/${report.sessionId}`} aria-label="읽기" title="읽기">
              <ReportActionIcon name="read" />
            </a>
            <a
              className="btn btn-quiet btn-sm"
              href={`/app/feedback/${report.sessionId}/print`}
              aria-label="PDF로 저장"
              title="PDF로 저장"
            >
              <ReportActionIcon name="download" />
            </a>
          </article>
      ))}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="surface-quiet" style={{ padding: "28px" }}>
      <p className="small" style={{ color: "var(--text-2)", margin: 0 }}>
        {message}
      </p>
    </div>
  );
}
