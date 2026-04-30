"use client";

import { type CSSProperties, type KeyboardEvent, type ReactNode, useEffect, useState } from "react";
import type {
  ArchiveQuestionItem,
  ArchiveSessionItemLike,
  ArchiveSessionRecord,
  ArchiveReviewItem,
  ArchiveView,
  FeedbackDocumentListItem,
} from "@/features/archive/model/archive-model";
import {
  archiveSummary,
  archiveTabs,
  feedbackArchiveBadgeClass,
  feedbackArchiveDescription,
  feedbackArchiveLabel,
  feedbackReportActionLabel,
  formatSessionMonthDayLabel,
  groupArchiveSessionsByYear,
  mobileArchiveTabs,
  publicationLabel,
  selectedArchiveSectionMeta,
  toArchiveSessionRecords,
} from "@/features/archive/model/archive-model";
import {
  appFeedbackHref,
  appSessionHref,
  archiveViewHref,
  readmatesReturnState,
  restoreReadmatesArchiveScroll,
} from "@/features/archive/ui/archive-route-continuity";
import { BookCover } from "@/shared/ui/book-cover";
import { feedbackDocumentPdfDownloadsEnabled } from "@/shared/config/readmates-feature-flags";
import { formatDateOnlyLabel } from "@/shared/ui/readmates-display";
import { Link } from "@/features/archive/ui/archive-link";
import type { PagedResponse } from "@/shared/model/paging";

type ReportActionIconName = "read" | "download";
type LoadMoreCallback = () => Promise<void>;

export type { ArchiveView };

function moveArchiveTabFocus(nextView: ArchiveView, targetPrefix: "desktop" | "mobile") {
  globalThis.setTimeout(() => {
    document.getElementById(`archive-${targetPrefix}-tab-${nextView}`)?.focus();
  }, 0);
}

function handleArchiveTabKeyDown(
  event: KeyboardEvent<HTMLElement>,
  view: ArchiveView,
  setView: (view: ArchiveView) => void,
  targetPrefix: "desktop" | "mobile",
) {
  const keys = archiveTabs.map((tab) => tab.key);
  const currentIndex = keys.indexOf(view);
  const lastIndex = keys.length - 1;
  const nextIndex =
    event.key === "ArrowRight"
      ? (currentIndex + 1) % keys.length
      : event.key === "ArrowLeft"
        ? (currentIndex - 1 + keys.length) % keys.length
        : event.key === "Home"
          ? 0
          : event.key === "End"
            ? lastIndex
            : -1;

  if (nextIndex < 0) {
    return;
  }

  event.preventDefault();
  const nextView = keys[nextIndex];
  setView(nextView);
  moveArchiveTabFocus(nextView, targetPrefix);
}

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

function formatReviewDateLabel(value: string) {
  const dateOnlyMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return dateOnlyMatch ? `${dateOnlyMatch[1]}-${dateOnlyMatch[2]}-${dateOnlyMatch[3]}` : formatDateOnlyLabel(value);
}

export default function ArchivePage({
  sessions,
  questions,
  reviews,
  reports,
  initialView = "sessions",
  onViewChange,
  routePathname,
  routeSearch,
  reviewAuthorName,
  onLoadMoreSessions,
  onLoadMoreQuestions,
  onLoadMoreReviews,
  onLoadMoreReports,
}: {
  sessions: PagedResponse<ArchiveSessionItemLike>;
  questions: PagedResponse<ArchiveQuestionItem>;
  reviews: PagedResponse<ArchiveReviewItem>;
  reports: PagedResponse<FeedbackDocumentListItem>;
  initialView?: ArchiveView;
  onViewChange?: (view: ArchiveView) => void;
  routePathname?: string;
  routeSearch?: string;
  reviewAuthorName?: string | null;
  onLoadMoreSessions?: LoadMoreCallback;
  onLoadMoreQuestions?: LoadMoreCallback;
  onLoadMoreReviews?: LoadMoreCallback;
  onLoadMoreReports?: LoadMoreCallback;
}) {
  const [fallbackView, setFallbackView] = useState<ArchiveView>(initialView);
  const view = onViewChange ? initialView : fallbackView;
  const sessionItems = sessions.items;
  const questionItems = questions.items;
  const reviewItems = reviews.items;
  const reportItems = reports.items;
  const archiveSessions = toArchiveSessionRecords(sessionItems, reportItems);
  const archivePathname = routePathname ?? (typeof window === "undefined" ? "" : window.location.pathname);
  const archiveSearch = routeSearch ?? (typeof window === "undefined" ? "" : window.location.search);

  useEffect(() => {
    return restoreReadmatesArchiveScroll(archivePathname, archiveSearch);
  }, [archivePathname, archiveSearch, sessionItems.length, questionItems.length, reviewItems.length, reportItems.length]);

  const handleViewChange = (nextView: ArchiveView) => {
    if (onViewChange) {
      onViewChange(nextView);
      return;
    }

    setFallbackView(nextView);
  };

  return (
    <main className="rm-archive-page">
      <div className="desktop-only">
        <ArchiveDesktop
          view={view}
          setView={handleViewChange}
          sessions={archiveSessions}
          questions={questionItems}
          reviews={reviewItems}
          reports={reportItems}
          reviewAuthorName={reviewAuthorName}
          hasMoreSessions={Boolean(sessions.nextCursor)}
          hasMoreQuestions={Boolean(questions.nextCursor)}
          hasMoreReviews={Boolean(reviews.nextCursor)}
          hasMoreReports={Boolean(reports.nextCursor)}
          onLoadMoreSessions={onLoadMoreSessions}
          onLoadMoreQuestions={onLoadMoreQuestions}
          onLoadMoreReviews={onLoadMoreReviews}
          onLoadMoreReports={onLoadMoreReports}
        />
      </div>
      <div className="mobile-only">
        <ArchiveMobile
          view={view}
          setView={handleViewChange}
          sessions={archiveSessions}
          questions={questionItems}
          reviews={reviewItems}
          reports={reportItems}
          hasMoreSessions={Boolean(sessions.nextCursor)}
          hasMoreQuestions={Boolean(questions.nextCursor)}
          hasMoreReviews={Boolean(reviews.nextCursor)}
          hasMoreReports={Boolean(reports.nextCursor)}
          onLoadMoreSessions={onLoadMoreSessions}
          onLoadMoreQuestions={onLoadMoreQuestions}
          onLoadMoreReviews={onLoadMoreReviews}
          onLoadMoreReports={onLoadMoreReports}
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
  reviewAuthorName,
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
  sessions: ArchiveSessionRecord[];
  questions: ArchiveQuestionItem[];
  reviews: ArchiveReviewItem[];
  reports: FeedbackDocumentListItem[];
  reviewAuthorName?: string | null;
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
    <>
      <section className="page-header-compact" style={{ paddingBottom: 0 }}>
        <div className="container">
          <p className="eyebrow" style={{ margin: 0 }}>
            아카이브
          </p>
          <h1 className="h1 editorial" style={{ margin: "6px 0 4px" }}>
            기록 저장소
          </h1>
          <p className="small" style={{ color: "var(--text-2)", margin: 0 }}>
            지난 모임과 내가 쓴 문장들을 회고합니다. 속도감보다 축적감.
          </p>
          <div
            className="row"
            style={{ marginTop: "24px", gap: "6px", flexWrap: "wrap" }}
            aria-label="아카이브 탭"
            onKeyDown={(event) => handleArchiveTabKeyDown(event, view, setView, "desktop")}
          >
            {archiveTabs.map((tab) => {
              const selected = view === tab.key;

              return (
                <button
                  key={tab.key}
                  id={`archive-desktop-tab-${tab.key}`}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setView(tab.key)}
                  style={{
                    height: "32px",
                    padding: "0 14px",
                    fontSize: "13px",
                    borderRadius: "999px",
                    border: `1px solid ${selected ? "var(--text)" : "var(--line)"}`,
                    background: selected ? "var(--text)" : "transparent",
                    color: selected ? "var(--bg)" : "var(--text-2)",
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section style={{ padding: "28px 0 80px" }}>
        <div className="container">
          <ArchiveSelectedSection view={view}>
            {view === "sessions" ? (
              <>
                <ArchiveSessions sessions={sessions} />
                <LoadMoreButton visible={hasMoreSessions} onLoadMore={onLoadMoreSessions} />
              </>
            ) : null}
            {view === "reviews" ? (
              <>
                <ArchiveReviews reviews={reviews} reviewAuthorName={reviewAuthorName} />
                <LoadMoreButton visible={hasMoreReviews} onLoadMore={onLoadMoreReviews} />
              </>
            ) : null}
            {view === "questions" ? (
              <>
                <ArchiveQuestions questions={questions} />
                <LoadMoreButton visible={hasMoreQuestions} onLoadMore={onLoadMoreQuestions} />
              </>
            ) : null}
            {view === "report" ? (
              <>
                <ArchiveReports reports={reports} sessions={sessions} />
                <LoadMoreButton visible={hasMoreReports} onLoadMore={onLoadMoreReports} />
              </>
            ) : null}
          </ArchiveSelectedSection>
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
        onKeyDown={(event) => handleArchiveTabKeyDown(event, view, setView, "mobile")}
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

function ArchiveSelectedSection({ view, children }: { view: ArchiveView; children: ReactNode }) {
  const meta = selectedArchiveSectionMeta(view);

  return (
    <section
      aria-labelledby={`archive-${view}-heading`}
      style={{
        padding: "0 0 36px",
        borderBottom: "1px solid var(--line)",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) auto",
          gap: "20px",
          alignItems: "end",
          paddingBottom: "22px",
          borderBottom: "1px solid var(--line)",
          marginBottom: "8px",
        }}
      >
        <div>
          <h2 id={`archive-${view}-heading`} className="h2 editorial" style={{ margin: 0 }}>
            {meta.title}
          </h2>
          <p className="small" style={{ color: "var(--text-2)", margin: "8px 0 0", maxWidth: 560 }}>
            {meta.body}
          </p>
        </div>
        <span className="tiny mono" style={{ color: "var(--text-3)" }}>
          {meta.contextLabel}
        </span>
      </div>
      {children}
    </section>
  );
}

function LoadMoreButton({ visible, onLoadMore }: { visible: boolean; onLoadMore?: LoadMoreCallback }) {
  const [pending, setPending] = useState(false);

  if (!visible || !onLoadMore) {
    return null;
  }

  return (
    <div style={{ display: "flex", justifyContent: "center", paddingTop: "24px" }}>
      <button
        type="button"
        className="btn btn-quiet"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          try {
            await onLoadMore();
          } finally {
            setPending(false);
          }
        }}
      >
        더 보기
      </button>
    </div>
  );
}

function MobileLoadMoreButton({ visible, onLoadMore }: { visible: boolean; onLoadMore?: LoadMoreCallback }) {
  const [pending, setPending] = useState(false);

  if (!visible || !onLoadMore) {
    return null;
  }

  return (
    <section className="m-sec" style={{ paddingTop: 0 }}>
      <button
        type="button"
        className="btn btn-quiet"
        style={{ width: "100%", minHeight: 42 }}
        disabled={pending}
        onClick={async () => {
          setPending(true);
          try {
            await onLoadMore();
          } finally {
            setPending(false);
          }
        }}
      >
        더 보기
      </button>
    </section>
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
        {sessions.map((session) => (
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
                  title={feedbackArchiveDescription(session.feedbackDocument)}
                  aria-label={feedbackArchiveDescription(session.feedbackDocument)}
                >
                  {feedbackArchiveLabel(session.feedbackDocument)}
                </span>
              </div>
            </div>
            <SessionAction />
          </Link>
        ))}
      </div>
    </section>
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

function ArchiveSessions({ sessions }: { sessions: ArchiveSessionRecord[] }) {
  if (sessions.length === 0) {
    return <EmptyState message="아직 저장된 모임 기록이 없습니다." />;
  }

  const grouped = groupArchiveSessionsByYear(sessions);

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
            {group.list.map((session) => (
              <Link
                key={session.id}
                className="rm-record-row"
                to={appSessionHref(session.id)}
                state={archiveReturnState("sessions")}
                aria-label={`No.${session.number} ${session.book} 열기`}
                style={{
                  display: "grid",
                  gridTemplateColumns: "64px minmax(0, 1fr) minmax(190px, auto) auto",
                  gap: "28px",
                  padding: "28px 0",
                  alignItems: "center",
                  color: "inherit",
                  textDecoration: "none",
                }}
              >
                <div aria-label={`${reportNumberLabel(session.number)} · ${formatSessionMonthDayLabel(session.date)}`}>
                  <div className="tiny mono" style={{ color: "var(--text-3)" }}>
                    {reportNumberLabel(session.number)}
                  </div>
                  <div className="tiny mono" style={{ color: "var(--text-4)", marginTop: "6px" }}>
                    {formatSessionMonthDayLabel(session.date)}
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "46px minmax(0, 1fr)", gap: "14px", alignItems: "center" }}>
                  <BookCover title={session.book} author={session.author} imageUrl={session.bookImageUrl} width={46} />
                  <div style={{ minWidth: 0 }}>
                    <h3 className="editorial" style={{ fontSize: "19px", margin: 0 }}>
                      {session.book}
                    </h3>
                    <div className="small" style={{ marginTop: "4px" }}>
                      {session.author}
                    </div>
                  </div>
                </div>
                <div className="row" style={{ gap: "10px", flexWrap: "wrap" }}>
                  <span className="badge">
                    참석 {session.attendance}/{session.total}
                  </span>
                  <span className={session.published ? "badge badge-ok badge-dot" : "badge badge-readonly badge-dot"}>
                    {publicationLabel(session.published)}
                  </span>
                  <span
                    className={feedbackArchiveBadgeClass(session.feedbackDocument)}
                    title={feedbackArchiveDescription(session.feedbackDocument)}
                    aria-label={feedbackArchiveDescription(session.feedbackDocument)}
                  >
                    {feedbackArchiveLabel(session.feedbackDocument)}
                  </span>
                </div>
                <SessionAction />
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
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

function ArchiveReviews({ reviews, reviewAuthorName }: { reviews: ArchiveReviewItem[]; reviewAuthorName?: string | null }) {
  if (reviews.length === 0) {
    return <EmptyState message="아직 작성된 서평이 없습니다." />;
  }

  return (
    <div className="grid-2" style={{ gap: "18px", marginTop: "18px" }}>
      {reviews.map((review) => (
        <Link
          key={`${review.sessionId}-${review.kind}`}
          className="rm-document-panel"
          to={appSessionHref(review.sessionId, "my-records")}
          state={archiveReturnState("reviews")}
          aria-label={`No.${review.sessionNumber} ${review.bookTitle} 세션으로`}
          style={{
            display: "grid",
            gridTemplateRows: "auto auto auto auto",
            alignContent: "start",
            padding: "20px 48px 20px",
            color: "inherit",
            textDecoration: "none",
          }}
        >
          <div className="eyebrow">서평 · {formatReviewDateLabel(review.date)}</div>
          <h2 className="h3 editorial" style={{ margin: "18px 0 0" }}>
            {review.bookTitle}
          </h2>
          <p
            className="editorial"
            style={{
              display: "-webkit-box",
              WebkitBoxOrient: "vertical",
              WebkitLineClamp: 3,
              alignSelf: "start",
              overflow: "hidden",
              color: "var(--text-2)",
              fontSize: "18px",
              lineHeight: 1.55,
              margin: "20px 0 0",
              wordBreak: "keep-all",
              overflowWrap: "anywhere",
            }}
          >
            {review.text}
          </p>
          <div className="rule" style={{ margin: "16px 0 0" }}>
            <span>{reviewAuthorName ?? "나"}</span>
          </div>
        </Link>
      ))}
    </div>
  );
}

function ArchiveQuestions({ questions }: { questions: ArchiveQuestionItem[] }) {
  if (questions.length === 0) {
    return <EmptyState message="아직 저장된 질문이 없습니다." />;
  }

  return (
    <div className="stack" style={{ "--stack": "0px", marginTop: "16px" } as CSSProperties}>
      {questions.map((question, index) => (
        <Link
          key={`${question.sessionId}-${question.priority}-${question.text}`}
          to={appSessionHref(question.sessionId, "my-records")}
          state={archiveReturnState("questions")}
          aria-label={`Q${question.priority} ${question.bookTitle} 세션으로`}
          style={{
            display: "block",
            padding: "24px 0",
            borderTop: index === 0 ? "0" : "1px solid var(--line-soft)",
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
          <h2 className="body editorial" style={{ fontSize: "18px", margin: 0, lineHeight: 1.58 }}>
            {question.text}
          </h2>
          {question.draftThought ? (
            <p className="small" style={{ color: "var(--text-3)", margin: "8px 0 0" }}>
              {question.draftThought}
            </p>
          ) : null}
        </Link>
      ))}
    </div>
  );
}

function ArchiveReports({ reports, sessions }: { reports: FeedbackDocumentListItem[]; sessions: ArchiveSessionRecord[] }) {
  if (reports.length === 0) {
    return <EmptyState message="아직 열람 가능한 피드백 문서가 없습니다." />;
  }

  return (
    <div className="stack" style={{ "--stack": "0px", marginTop: "10px" } as CSSProperties}>
      {reports.map((report, index) => {
        const cover = reportBookCoverMeta(report, sessions);
        const readHref = appFeedbackHref(report.sessionId);
        const readState = archiveReturnState("report", "아카이브로 돌아가기");
        const readLabel = feedbackReportActionLabel(report, "읽기");
        const reportRowLinkStyle: CSSProperties = {
          display: "grid",
          gridTemplateColumns: "64px minmax(0, 1fr) auto",
          gap: "20px",
          padding: "22px 0",
          alignItems: "center",
          color: "inherit",
          textDecoration: "none",
          minWidth: 0,
          borderTop: "0",
        };
        const reportRowContent = (
          <>
            <BookCover title={report.bookTitle} author={cover.author} imageUrl={cover.imageUrl} width={48} decorative />
            <div>
              <h2 className="editorial" style={{ fontSize: "16px", margin: 0 }}>
                {report.bookTitle}
              </h2>
              <div className="tiny mono" style={{ color: "var(--text-3)", marginTop: "4px" }}>
                {reportNumberLabel(report.sessionNumber)} · {formatDateOnlyLabel(report.date)} ·{" "}
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
            <article
              key={report.sessionId}
              style={{
                borderTop: index === 0 ? "0" : "1px solid var(--line-soft)",
              }}
            >
              <Link
                className="rm-record-row"
                to={readHref}
                state={readState}
                aria-label={readLabel}
                title={readLabel}
                style={reportRowLinkStyle}
              >
                {reportRowContent}
              </Link>
            </article>
          );
        }

        return (
          <article
            key={report.sessionId}
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) auto",
              gap: "12px",
              borderTop: index === 0 ? "0" : "1px solid var(--line-soft)",
              alignItems: "center",
            }}
          >
            <Link
              className="rm-record-row"
              to={readHref}
              state={readState}
              aria-label={readLabel}
              title={readLabel}
              style={reportRowLinkStyle}
            >
              {reportRowContent}
            </Link>
            <Link
              className="btn btn-quiet btn-sm"
              to={appFeedbackHref(report.sessionId, true)}
              state={readState}
              aria-label={feedbackReportActionLabel(report, "PDF로 저장")}
              title={feedbackReportActionLabel(report, "PDF로 저장")}
            >
              <ReportActionIcon name="download" />
            </Link>
          </article>
        );
      })}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rm-empty-state" style={{ margin: "36px 0 0", padding: "28px" }}>
      <p className="small" style={{ color: "var(--text-2)", margin: 0 }}>
        {message}
      </p>
    </div>
  );
}
