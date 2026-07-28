import type { MyJourneyItem } from "@/features/archive/model/my-reading-shelf-model";
import { Link } from "@/features/archive/ui/archive-link";

export function BookRecordRow({ item }: { item: MyJourneyItem }) {
  return (
    <article
      className="rm-book-record-row"
      aria-label={`${item.sessionNumber}차 ${item.bookTitle}`}
    >
      <BookCover item={item} />
      <div className="rm-book-record-row__book">
        <p className="rm-book-record-row__meta">
          {item.sessionNumber}차 · {dateLabel(item.date)}
        </p>
        <h3>{item.bookTitle}</h3>
        <p className="rm-book-record-row__author">{item.bookAuthor}</p>
      </div>
      <div className="rm-book-record-row__actions">
        <Link to={`/app/sessions/${encodeURIComponent(item.sessionId)}`}>
          회차 기록
        </Link>
        {item.feedbackDocument.readable ? (
          <Link to={`/app/feedback/${encodeURIComponent(item.sessionId)}`}>
            피드백 문서
          </Link>
        ) : item.feedbackDocument.available &&
          item.feedbackDocument.lockedReason === "ACTIVE_MEMBERSHIP_REQUIRED" ? (
          <span className="rm-book-record-row__locked">열람 제한</span>
        ) : null}
      </div>
    </article>
  );
}

function BookCover({ item }: { item: MyJourneyItem }) {
  if (item.bookImageUrl) {
    return (
      <img
        className="rm-book-record-row__cover"
        src={item.bookImageUrl}
        alt={`${item.bookTitle} 표지`}
      />
    );
  }

  return (
    <div
      className="rm-book-record-row__cover rm-book-record-row__cover--fallback"
      aria-label={`${item.bookTitle} 표지 없음`}
    >
      {item.bookTitle.trim().slice(0, 1) || "책"}
    </div>
  );
}

function dateLabel(date: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date.replaceAll("-", ".") : "날짜 미상";
}
