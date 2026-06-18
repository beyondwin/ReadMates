import { type CSSProperties, type KeyboardEvent } from "react";
import type {
  ArchiveQuestionItem,
  ArchiveReviewItem,
  ArchiveSessionRecord,
  ArchiveView,
  FeedbackDocumentListItem,
} from "@/features/archive/model/archive-model";
import {
  archiveSummary,
  feedbackArchiveBadgeClass,
  feedbackDocumentCopy,
  feedbackReportActionLabel,
  mobileArchiveTabs,
  publicationLabel,
  selectedArchiveSectionMeta,
} from "@/features/archive/model/archive-model";
import {
  appFeedbackHref,
  appSessionHref,
  archiveViewHref,
  readmatesReturnState,
} from "@/features/archive/ui/archive-route-continuity";
import { Link } from "@/features/archive/ui/archive-link";
import { feedbackDocumentPdfDownloadsEnabled } from "@/shared/config/readmates-feature-flags";
import { BookCover } from "@/shared/ui/book-cover";
import { formatDateOnlyLabel } from "@/shared/ui/readmates-display";
import { MobileEmptyState, MobileLoadMoreButton, type LoadMoreCallback } from "./archive-empty-state";

type ReportActionIconName = "read" | "download";

function archiveReturnState(view: ArchiveView, label = "아카이브로") {
  return readmatesReturnState({ href: archiveViewHref(view), label });
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
      <path d="M8 5l5 5-5 5" />
    </svg>
  );
}

function reportNumberLabel(sessionNumber: number) {
  return `No.${String(sessionNumber).padStart(2, "0")}`;
}

export function ArchiveMobile({
  view,
  setView,
  onTabKeyDown,
  sessions,
  questions,
  reviews,
  reports,
  hasMoreSessions,
  hasMoreQuestions,
  hasMoreReviews,
  hasMoreReports,
  onLoadMoreSessions,
  onLoadMoreQuestions,
  onLoadMoreReviews,
  onLoadMoreReports,
}: {
  view: ArchiveView;
  setView: (view: ArchiveView) => void;
  onTabKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
  sessions: ArchiveSessionRecord[];
  questions: ArchiveQuestionItem[];
  reviews: ArchiveReviewItem[];
  reports: FeedbackDocumentListItem[];
  hasMoreSessions: boolean;
  hasMoreQuestions: boolean;
  hasMoreReviews: boolean;
  hasMoreReports: boolean;
  onLoadMoreSessions?: LoadMoreCallback;
  onLoadMoreQuestions?: LoadMoreCallback;
  onLoadMoreReviews?: LoadMoreCallback;
  onLoadMoreReports?: LoadMoreCallback;
}) {
  return (
    <div className="rm-archive-mobile m-body">
      <section style={{ padding: "24px 18px 16px" }}>
        <div className="eyebrow">아카이브</div>
        <h1 className="h2 editorial" style={{ margin: "6px 0 6px" }}>
          읽어 온 자리
        </h1>
        <div className="small" style={{ color: "var(--text-2)" }}>
          {archiveSummary({ sessions, questions, reviews })}
        </div>
      </section>

      <div
        className="m-hscroll"
        style={{ padding: "0 18px 6px" }}
        aria-label="아카이브 모바일 탭"
        onKeyDown={onTabKeyDown}
      >
        {mobileArchiveTabs.map((tab) => {
          const selected = view === tab.key;

          return (
            <button
              key={tab.key}
              id={`archive-mobile-tab-${tab.key}`}
              type="button"
              aria-pressed={selected}
              onClick={() => setView(tab.key)}
              className={`m-chip${selected ? " is-on" : ""}`}
              style={{
                minHeight: 32,
                height: 32,
                padding: "0 14px",
                fontSize: 13,
                borderColor: selected ? "var(--text)" : "var(--line)",
                background: selected ? "var(--text)" : "transparent",
                color: selected ? "var(--bg)" : "var(--text-2)",
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <MobileArchiveSectionIntro view={view} />
      {view === "sessions" ? (
        <>
          <ArchiveMobileSessions sessions={sessions} />
          <MobileLoadMoreButton visible={hasMoreSessions} onLoadMore={onLoadMoreSessions} />
        </>
      ) : null}
      {view === "reviews" ? (
        <>
          <ArchiveMobileReviews reviews={reviews} />
          <MobileLoadMoreButton visible={hasMoreReviews} onLoadMore={onLoadMoreReviews} />
        </>
      ) : null}
      {view === "questions" ? (
        <>
          <ArchiveMobileQuestions questions={questions} />
          <MobileLoadMoreButton visible={hasMoreQuestions} onLoadMore={onLoadMoreQuestions} />
        </>
      ) : null}
      {view === "report" ? (
        <>
          <ArchiveMobileReports reports={reports} sessions={sessions} />
          <MobileLoadMoreButton visible={hasMoreReports} onLoadMore={onLoadMoreReports} />
        </>
      ) : null}
    </div>
  );
}

function MobileArchiveSectionIntro({ view }: { view: ArchiveView }) {
  const meta = selectedArchiveSectionMeta(view);

  return (
    <section style={{ padding: "8px 18px 0px" }}>
      <div className="m-card-quiet" style={{ padding: "14px 16px" }}>
        <h2 className="h3 editorial" style={{ margin: 0 }}>
          {meta.title}
        </h2>
        <p className="small" style={{ color: "var(--text-2)", margin: "6px 0 0" }}>
          {meta.body}
        </p>
      </div>
    </section>
  );
}

function ArchiveMobileSessions({ sessions }: { sessions: ArchiveSessionRecord[] }) {
  if (sessions.length === 0) {
    return <MobileEmptyState message="아직 저장된 모임 기록이 없습니다." />;
  }

  return (
    <section className="m-sec">
      <div className="stack" style={{ "--stack": "10px" } as CSSProperties}>
        {sessions.map((session) => {
          const feedbackCopy = feedbackDocumentCopy(session.feedbackDocument);

          return (
            <Link
              key={session.id}
              to={appSessionHref(session.id)}
              state={archiveReturnState("sessions")}
              className="rm-archive-session-card m-card"
              style={{ display: "grid", gridTemplateColumns: "52px minmax(0, 1fr) 20px", gap: 10, alignItems: "center", width: "100%" }}
              aria-label={`No.${session.number} ${session.book} 열기`}
            >
              <BookCover title={session.book} author={session.author} imageUrl={session.bookImageUrl} width={52} />
              <div style={{ minWidth: 0 }}>
                <div className="tiny mono" style={{ color: "var(--text-3)" }}>
                  No.{String(session.number).padStart(2, "0")} · {formatDateOnlyLabel(session.date)}
                </div>
                <div className="editorial" style={{ fontSize: 16, margin: "6px 0 2px", lineHeight: 1.3 }}>
                  {session.book}
                </div>
                <div className="tiny" style={{ color: "var(--text-3)" }}>
                  {session.author}
                </div>
                <div className="m-row rm-archive-session-card__meta" style={{ marginTop: 10 }}>
                  <span className="badge">
                    {session.attendance}/{session.total} 참석
                  </span>
                  <span className={session.published ? "badge badge-ok badge-dot" : "badge badge-readonly badge-dot"}>
                    {publicationLabel(session.published, "mobile")}
                  </span>
                  <span
                    className={feedbackArchiveBadgeClass(session.feedbackDocument)}
                    title={feedbackCopy.ariaLabel}
                    aria-label={feedbackCopy.ariaLabel}
                  >
                    {feedbackCopy.badge}
                  </span>
                </div>
              </div>
              <SessionAction />
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function SessionAction() {
  return (
    <span className="rm-archive-session-action" aria-hidden>
      <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
        <path d="M8 5l5 5-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

function ArchiveMobileReviews({ reviews }: { reviews: ArchiveReviewItem[] }) {
  if (reviews.length === 0) {
    return <MobileEmptyState message="아직 작성된 서평이 없습니다." />;
  }

  return (
    <section className="m-sec">
      <div className="stack" style={{ "--stack": "14px" } as CSSProperties}>
        {reviews.map((review) => (
          <Link
            key={`${review.sessionId}-${review.kind}`}
            to={appSessionHref(review.sessionId, "mobile-my-records")}
            state={archiveReturnState("reviews")}
            className="m-card"
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) auto",
              alignItems: "center",
              columnGap: 12,
            }}
            aria-label={`No.${review.sessionNumber} ${review.bookTitle} 세션으로`}
          >
            <div style={{ minWidth: 0 }}>
              <div className="tiny mono" style={{ color: "var(--text-3)" }}>
                {formatDateOnlyLabel(review.date)} · {review.bookTitle}
              </div>
              <div className="body editorial" style={{ fontSize: 15, marginTop: 8, lineHeight: 1.6 }}>
                {review.text}
              </div>
            </div>
            <span aria-hidden style={{ color: "var(--text-3)" }}>
              ›
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function ArchiveMobileQuestions({ questions }: { questions: ArchiveQuestionItem[] }) {
  if (questions.length === 0) {
    return <MobileEmptyState message="아직 저장된 질문이 없습니다." />;
  }

  return (
    <section className="m-sec">
      <div className="stack" style={{ "--stack": "10px" } as CSSProperties}>
        {questions.map((question) => (
          <Link
            key={`${question.sessionId}-${question.priority}-${question.text}`}
            to={appSessionHref(question.sessionId, "mobile-my-records")}
            state={archiveReturnState("questions")}
            className="m-card-quiet"
            style={{ display: "block" }}
            aria-label={`Q${question.priority} ${question.bookTitle} 세션으로`}
          >
            <div className="tiny mono" style={{ color: "var(--text-3)" }}>
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
          </Link>
        ))}
      </div>
    </section>
  );
}

function reportBookCoverMeta(report: FeedbackDocumentListItem, sessions: ArchiveSessionRecord[]) {
  const session = sessions.find((item) => item.id === report.sessionId);

  return {
    author: report.bookAuthor ?? session?.author ?? null,
    imageUrl: report.bookImageUrl ?? session?.bookImageUrl ?? null,
  };
}

function ArchiveMobileReports({ reports, sessions }: { reports: FeedbackDocumentListItem[]; sessions: ArchiveSessionRecord[] }) {
  if (reports.length === 0) {
    return <MobileEmptyState message="아직 열람 가능한 피드백 문서가 없습니다." />;
  }

  return (
    <section className="m-sec">
      <div className="m-list">
        {reports.map((report) => {
          const cover = reportBookCoverMeta(report, sessions);
          const readHref = appFeedbackHref(report.sessionId);
          const readState = archiveReturnState("report", "아카이브로 돌아가기");
          const readLabel = feedbackReportActionLabel(report, "읽기");
          const reportRowLinkStyle: CSSProperties = {
            display: "grid",
            gridTemplateColumns: "40px minmax(0, 1fr) auto",
            gap: 14,
            alignItems: "center",
            minWidth: 0,
            color: "inherit",
            textDecoration: "none",
          };
          const reportRowContent = (
            <>
              <BookCover title={report.bookTitle} author={cover.author} imageUrl={cover.imageUrl} width={36} decorative />
              <div style={{ minWidth: 0 }}>
                <div className="body" style={{ fontSize: 14 }}>
                  {report.bookTitle}
                </div>
                <div className="tiny mono" style={{ color: "var(--text-3)" }}>
                  {reportNumberLabel(report.sessionNumber)} · {formatDateOnlyLabel(report.date)}
                </div>
                <div className="tiny" style={{ color: "var(--text-3)", marginTop: 3 }}>
                  {formatDateOnlyLabel(report.uploadedAt)} 등록
                </div>
              </div>
              <span className="btn btn-quiet btn-sm" aria-hidden="true">
                <ReportActionIcon name="read" />
              </span>
            </>
          );

          if (!feedbackDocumentPdfDownloadsEnabled) {
            return (
              <Link
                key={report.sessionId}
                className="m-list-row"
                to={readHref}
                state={readState}
                aria-label={readLabel}
                title={readLabel}
                style={reportRowLinkStyle}
              >
                {reportRowContent}
              </Link>
            );
          }

          return (
            <div key={report.sessionId} className="m-list-row" style={{ gridTemplateColumns: "minmax(0, 1fr) auto" }}>
              <Link to={readHref} state={readState} aria-label={readLabel} title={readLabel} style={reportRowLinkStyle}>
                {reportRowContent}
              </Link>
              <div className="m-row" style={{ gap: 4 }}>
                <Link
                  className="btn btn-quiet btn-sm"
                  to={appFeedbackHref(report.sessionId, true)}
                  state={readState}
                  aria-label={feedbackReportActionLabel(report, "PDF로 저장")}
                  title={feedbackReportActionLabel(report, "PDF로 저장")}
                >
                  <ReportActionIcon name="download" />
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
