import { type KeyboardEvent, type ReactNode, useEffect, useState } from "react";
import type {
  ArchiveQuestionItem,
  ArchiveReviewItem,
  ArchiveSessionItemLike,
  ArchiveView,
  FeedbackDocumentListItem,
} from "@/features/archive/model/archive-model";
import { archiveTabs, selectedArchiveSectionMeta, toArchiveSessionRecords } from "@/features/archive/model/archive-model";
import { restoreReadmatesArchiveScroll } from "@/features/archive/ui/archive-route-continuity";
import type { PagedResponse } from "@/shared/model/paging";
import { ArchiveDesktop } from "./archive-desktop";
import type { LoadMoreCallback } from "./archive-empty-state";
import { ArchiveMobile } from "./archive-mobile";

export type { ArchiveView } from "@/features/archive/model/archive-model";

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

function ArchivePage({
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

  const handleDesktopTabKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    handleArchiveTabKeyDown(event, view, handleViewChange, "desktop");
  };

  const handleMobileTabKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    handleArchiveTabKeyDown(event, view, handleViewChange, "mobile");
  };

  return (
    <main className="rm-archive-page">
      <div className="desktop-only">
        <ArchiveDesktop
          view={view}
          setView={handleViewChange}
          SelectedSection={ArchiveSelectedSection}
          onTabKeyDown={handleDesktopTabKeyDown}
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
          onTabKeyDown={handleMobileTabKeyDown}
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

export default ArchivePage;

export function ArchiveSelectedSection({ view, children }: { view: ArchiveView; children: ReactNode }) {
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
