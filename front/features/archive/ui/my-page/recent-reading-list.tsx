import type { RecentReadingPreviewItem } from "@/features/archive/model/my-reading-shelf-model";
import { RecentReadingRow } from "./recent-reading-row";

export type RecentReadingListItem = RecentReadingPreviewItem & {
  href: string;
};

export type RecentReadingListProps = {
  items: RecentReadingListItem[];
  archiveSessionsHref: string;
};

export function RecentReadingList({
  items,
  archiveSessionsHref,
}: RecentReadingListProps): JSX.Element {
  return (
    <section
      className="rm-recent-readings"
      aria-labelledby="recent-readings-heading"
    >
      <header className="rm-recent-readings__header">
        <div>
          <p className="rm-member-space-kicker">나의 독서 기록</p>
          <h2 id="recent-readings-heading">최근 함께 읽은 기록</h2>
        </div>
        {items.length > 0 ? (
          <a
            className="rm-recent-readings__all"
            href={archiveSessionsHref}
          >
            전체 세션 기록 보기 <span aria-hidden="true">→</span>
          </a>
        ) : null}
      </header>
      {items.length > 0 ? (
        <ol className="rm-recent-readings__list" aria-label="최근 함께 읽은 기록">
          {items.map((item) => (
            <li key={item.sessionId}>
              <RecentReadingRow item={item} />
            </li>
          ))}
        </ol>
      ) : (
        <p className="rm-recent-readings__empty">
          첫 모임 이후 이곳에 읽은 기록이 이어집니다.
        </p>
      )}
    </section>
  );
}
