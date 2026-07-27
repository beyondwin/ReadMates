import { groupJourneyByYear, journeyChips, latestJourneyItem, type MyJourneyItem } from "@/features/archive/model/my-reading-shelf-model";
import { Link } from "@/features/archive/ui/archive-link";

export function MyReadingJourney({
  items,
  hasMore,
  loadMorePending,
  loadMoreError,
  onLoadMore,
  onRetryLoadMore,
}: {
  items: MyJourneyItem[];
  hasMore: boolean;
  loadMorePending: boolean;
  loadMoreError: boolean;
  onLoadMore: () => Promise<void>;
  onRetryLoadMore: () => Promise<void>;
}) {
  const latest = latestJourneyItem(items);
  const groups = groupJourneyByYear(items);

  return (
    <>
      {latest ? <LatestJourneyItem item={latest} /> : null}
      <section className="rm-my-shelf-journey" aria-labelledby="my-reading-journey-heading">
        <div className="rm-my-shelf-section-heading">
          <h2 id="my-reading-journey-heading">책별 기록</h2>
          <p>참여한 회차를 최근 기록부터 다시 읽어 보세요.</p>
        </div>
        <div className="rm-my-shelf-year-groups">
          {groups.map((group) => (
            <section key={group.year} className="rm-my-shelf-year-group" aria-label={`${group.year}년 기록`}>
              <p className="rm-my-shelf-year">{group.year}</p>
              <ol className="rm-my-shelf-journey-list" aria-label="책별 기록">
                {group.items.map((item) => (
                  <li key={item.sessionId}>
                    <JourneyRow item={item} />
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
        {hasMore || loadMoreError ? (
          <div
            className="rm-my-shelf-load-state"
            data-testid="my-reading-journey-load-more"
            aria-busy={loadMorePending}
          >
            {loadMorePending ? <p role="status">기록을 불러오는 중</p> : null}
            {loadMoreError ? <p role="alert">기록을 더 불러오지 못했습니다.</p> : null}
            <button
              type="button"
              className="rm-my-shelf-load-more btn btn-quiet"
              disabled={loadMorePending && !loadMoreError}
              onClick={() => void (loadMoreError ? onRetryLoadMore() : onLoadMore())}
            >
              {loadMoreError ? "다시 시도" : loadMorePending ? "기록을 불러오는 중" : "기록 더 보기"}
            </button>
          </div>
        ) : null}
      </section>
    </>
  );
}

function LatestJourneyItem({ item }: { item: MyJourneyItem }) {
  return (
    <section className="rm-my-shelf-latest" aria-label="최근 책별 기록">
      <h2 className="rm-my-shelf-kicker">최근 책별 기록</h2>
      <p className="rm-my-shelf-latest__orientation">
        마지막 기록은 {sessionLabel(item)} {item.bookTitle}입니다. 아래 책별 기록에서 다시 읽어 보세요.
      </p>
    </section>
  );
}

function JourneyRow({ item }: { item: MyJourneyItem }) {
  return (
    <article className="rm-my-shelf-row" aria-label={`${item.sessionNumber}차 ${item.bookTitle}`}>
      <BookCover item={item} />
      <div className="rm-my-shelf-row__content">
        <p className="rm-my-shelf-meta">{sessionLabel(item)} · {dateLabel(item.date)}</p>
        <h3>{item.bookTitle}</h3>
        <p className="rm-my-shelf-row__author">{item.bookAuthor}</p>
        <JourneyChips item={item} />
        <div className="rm-my-shelf-row__actions">
          <Link className="rm-my-shelf-action" to={`/app/sessions/${encodeURIComponent(item.sessionId)}`}>
            회차 기록
          </Link>
          {item.feedbackDocument.readable ? (
            <Link className="rm-my-shelf-action" to={`/app/feedback/${encodeURIComponent(item.sessionId)}`}>
              피드백 문서
            </Link>
          ) : null}
        </div>
        {item.feedbackDocument.available && item.feedbackDocument.lockedReason === "ACTIVE_MEMBERSHIP_REQUIRED" ? (
          <p className="rm-my-shelf-feedback-lock">활성 멤버가 되면 피드백 문서를 읽을 수 있습니다.</p>
        ) : null}
      </div>
    </article>
  );
}

function JourneyChips({ item }: { item: MyJourneyItem }) {
  const chips = journeyChips(item);

  return chips.length > 0 ? (
    <ul className="rm-my-shelf-chips" aria-label="남긴 기록">
      {chips.map((chip) => (
        <li key={chip.kind}>{chip.label}</li>
      ))}
    </ul>
  ) : null;
}

function BookCover({ item }: { item: MyJourneyItem }) {
  if (item.bookImageUrl) {
    return <img className="rm-my-shelf-cover" src={item.bookImageUrl} alt={`${item.bookTitle} 표지`} />;
  }

  return (
    <div className="rm-my-shelf-cover rm-my-shelf-cover--fallback" aria-label={`${item.bookTitle} 표지 없음`}>
      {item.bookTitle.trim().slice(0, 1) || "책"}
    </div>
  );
}

function sessionLabel(item: MyJourneyItem) {
  return `${item.sessionNumber}차`;
}

function dateLabel(date: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date.replaceAll("-", ".") : "날짜 미상";
}
