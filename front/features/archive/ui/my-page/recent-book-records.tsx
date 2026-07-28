import type { MyJourneyItem } from "@/features/archive/model/my-reading-shelf-model";
import { Link } from "@/features/archive/ui/archive-link";
import { BookRecordRow } from "./book-record-row";

export function RecentBookRecords({ items }: { items: MyJourneyItem[] }) {
  return (
    <section className="rm-my-shelf-recent" aria-labelledby="recent-book-records-heading">
      <div className="rm-my-shelf-recent__header">
        <h2 id="recent-book-records-heading">최근 책별 기록</h2>
        <Link className="rm-my-shelf-all-records" to="/app/me/records">
          내 기록 전체 보기
        </Link>
      </div>
      <ol className="rm-my-shelf-recent__list" aria-label="최근 책별 기록">
        {items.slice(0, 3).map((item) => (
          <li key={item.sessionId}>
            <BookRecordRow item={item} />
          </li>
        ))}
      </ol>
    </section>
  );
}
