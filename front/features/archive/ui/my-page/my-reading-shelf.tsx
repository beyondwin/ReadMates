import type { ReactNode } from "react";
import type { MyPageProfile } from "@/features/archive/model/archive-model";
import { latestJourneyItem, shelfEmptyState, type MyJourneyPage } from "@/features/archive/model/my-reading-shelf-model";
import { Link } from "@/features/archive/ui/archive-link";
import { MyReadingJourney } from "./my-reading-journey";
import { MyReadingSummary } from "./my-reading-summary";

export type MyReadingShelfProps = {
  profile: MyPageProfile;
  journey: MyJourneyPage;
  clubSlug: string;
  settingsOpen: boolean;
  onSettingsOpenChange: (open: boolean) => void;
  journeyLoadMorePending: boolean;
  journeyLoadMoreError: boolean;
  onLoadMoreJourney: () => Promise<void>;
  onRetryLoadMoreJourney: () => Promise<void>;
  settings: ReactNode;
};

export function MyReadingShelf({
  profile,
  journey,
  clubSlug,
  settingsOpen,
  onSettingsOpenChange,
  journeyLoadMorePending,
  journeyLoadMoreError,
  onLoadMoreJourney,
  onRetryLoadMoreJourney,
  settings,
}: MyReadingShelfProps) {
  const hasJourney = latestJourneyItem(journey.items) !== null;
  const emptyState = shelfEmptyState({
    membershipStatus: profile.membershipStatus,
    clubSlug,
    currentSessionId: null,
  });

  return (
    <main className="rm-my-shelf">
      <header className="rm-my-shelf-header">
        <div>
          <p className="rm-my-shelf-kicker">내 공간</p>
          <h1>나의 서재</h1>
          <p>함께 읽은 책과 내가 남긴 기록을 회차별로 다시 읽어 보세요.</p>
        </div>
        <button
          type="button"
          className="rm-my-shelf-settings-trigger btn btn-quiet"
          aria-expanded={settingsOpen}
          aria-controls="my-page-settings"
          onClick={() => onSettingsOpenChange(!settingsOpen)}
        >
          계정·알림 설정
        </button>
      </header>

      <MyReadingSummary summary={journey.summary} />
      <MyReadingJourney
        items={journey.items}
        hasMore={journey.nextCursor !== null}
        loadMorePending={journeyLoadMorePending}
        loadMoreError={journeyLoadMoreError}
        onLoadMore={onLoadMoreJourney}
        onRetryLoadMore={onRetryLoadMoreJourney}
      />
      {!hasJourney ? (
        <section className="rm-my-shelf-empty" aria-labelledby="my-reading-empty-heading">
          <h2 id="my-reading-empty-heading">{emptyState.title}</h2>
          <p>{emptyState.body}</p>
          {emptyState.action ? (
            <Link className="rm-my-shelf-action" to={emptyState.action.href}>
              {emptyState.action.label}
            </Link>
          ) : null}
        </section>
      ) : null}
      {settingsOpen ? (
        <section id="my-page-settings" className="rm-my-shelf-settings" aria-label="계정·알림 설정">
          {settings}
        </section>
      ) : null}
    </main>
  );
}
