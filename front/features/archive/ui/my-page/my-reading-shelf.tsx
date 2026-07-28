import type { MyPageProfile } from "@/features/archive/model/archive-model";
import { shelfEmptyState, type MyJourneyPage } from "@/features/archive/model/my-reading-shelf-model";
import { Link } from "@/features/archive/ui/archive-link";
import { RecentBookRecords } from "./recent-book-records";
import { MyReadingSummary } from "./my-reading-summary";

export type MyReadingShelfProps = {
  profile: MyPageProfile;
  journey: MyJourneyPage;
};

export function MyReadingShelf({ profile, journey }: MyReadingShelfProps) {
  const hasJourney = journey.items.length > 0;
  const emptyState = shelfEmptyState({
    membershipStatus: profile.membershipStatus,
    clubSlug: "",
    currentSessionId: profile.currentSessionId,
  });

  return (
    <main className="rm-my-shelf">
      <header className="rm-my-shelf-header">
        <div>
          <p className="rm-my-shelf-kicker">내 공간</p>
          <h1>나의 서재</h1>
          <p>함께 읽은 책과 내가 남긴 기록을 다시 읽어 보세요.</p>
        </div>
      </header>

      {hasJourney ? (
        <>
          <MyReadingSummary summary={journey.summary} />
          <RecentBookRecords items={journey.items} />
        </>
      ) : (
        <section className="rm-my-shelf-empty" aria-labelledby="my-reading-empty-heading">
          <h2 id="my-reading-empty-heading">{emptyState.title}</h2>
          <p>{emptyState.body}</p>
          {emptyState.action ? (
            <Link className="rm-my-shelf-action" to={emptyState.action.href}>
              {emptyState.action.label}
            </Link>
          ) : null}
        </section>
      )}
    </main>
  );
}
