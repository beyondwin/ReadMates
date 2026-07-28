import { groupJourneyByYear, type MyJourneyItem } from "@/features/archive/model/my-reading-shelf-model";
import { BookRecordRow } from "./book-record-row";

export type MyReadingJourneyProps = {
  items: MyJourneyItem[];
  hasMore: boolean;
  loadMorePending: boolean;
  loadMoreError: boolean;
  onLoadMore: () => Promise<void>;
  onRetryLoadMore: () => Promise<void>;
};

export function MyReadingJourney({
  items,
  hasMore,
  loadMorePending,
  loadMoreError,
  onLoadMore,
  onRetryLoadMore,
}: MyReadingJourneyProps) {
  const groups = groupJourneyByYear(items);

  return (
    <section className="rm-my-records-journey" aria-labelledby="my-reading-journey-heading">
      <div className="rm-my-records-section-heading">
        <h2 id="my-reading-journey-heading">내 책별 기록</h2>
      </div>
      <div className="rm-my-records-year-groups">
        {groups.map((group) => (
          <section key={group.year} className="rm-my-records-year-group" aria-label={yearGroupLabel(group.year)}>
            <p className="rm-my-shelf-year">{group.year}</p>
            <ol className="rm-my-records-list" aria-label="책별 기록">
              {group.items.map((item) => (
                <li key={item.sessionId}>
                  <BookRecordRow item={item} />
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>
      {hasMore || loadMoreError ? (
        <div
          className="rm-my-records-load-state"
          data-testid="my-reading-journey-load-more"
          aria-busy={loadMorePending}
        >
          {loadMorePending ? <p role="status">기록을 불러오는 중</p> : null}
          {loadMoreError ? <p role="alert">기록을 더 불러오지 못했습니다.</p> : null}
          <button
            type="button"
            className="rm-my-records-load-more btn btn-quiet"
            disabled={loadMorePending && !loadMoreError}
            onClick={() => void (loadMoreError ? onRetryLoadMore() : onLoadMore())}
          >
            {loadMoreError ? "다시 시도" : loadMorePending ? "기록을 불러오는 중" : "기록 더 보기"}
          </button>
        </div>
      ) : null}
    </section>
  );
}

function yearGroupLabel(year: string) {
  return year === "연도 미상" ? "연도 미상 기록" : `${year}년 기록`;
}
