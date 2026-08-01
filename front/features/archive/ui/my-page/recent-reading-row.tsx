import { useState } from "react";
import { RecentReadingChevron } from "./recent-reading-chevron";
import type { RecentReadingListItem } from "./recent-reading-list";

export function RecentReadingRow(
  { item }: { item: RecentReadingListItem },
): JSX.Element {
  return (
    <a
      className="rm-recent-reading-row"
      href={item.href}
      aria-label={`${item.bookTitle} 회차 기록`}
    >
      <RecentReadingCover item={item} />
      <div className="rm-recent-reading-row__book">
        <span className="rm-recent-reading-row__meta">
          {item.sessionNumberLabel} · {item.dateLabel}
        </span>
        <h3>{item.bookTitle}</h3>
        {item.bookAuthor ? (
          <span className="rm-recent-reading-row__author">
            {item.bookAuthor}
          </span>
        ) : null}
      </div>
      {item.activityLabels.length > 0 || item.feedbackStatus ? (
        <span className="rm-recent-reading-row__activity">
          {[...item.activityLabels, item.feedbackStatus]
            .filter(Boolean)
            .join(" · ")}
        </span>
      ) : null}
      <RecentReadingChevron className="rm-recent-reading-row__arrow" />
    </a>
  );
}

function RecentReadingCover(
  { item }: { item: RecentReadingListItem },
): JSX.Element {
  const [failed, setFailed] = useState(false);

  if (!item.bookImageUrl || failed) {
    return (
      <span
        className="rm-recent-reading-row__cover rm-recent-reading-row__cover--fallback"
        aria-hidden="true"
      >
        {item.coverFallbackLabel}
      </span>
    );
  }

  return (
    <img
      className="rm-recent-reading-row__cover"
      src={item.bookImageUrl}
      alt=""
      onError={() => setFailed(true)}
    />
  );
}
