import { useState } from "react";
import { RecentReadingChevron } from "./recent-reading-chevron";
import type { RecentReadingListItem } from "./recent-reading-list";

export function RecentReadingRow(
  { item }: { item: RecentReadingListItem },
): JSX.Element {
  return (
    <a
      className="rm-recent-reading-row rm-recent-reading-row--archive-aligned"
      href={item.href}
      aria-label={`${item.bookTitle} 회차 기록`}
    >
      <span className="rm-recent-reading-row__cover-frame">
        <RecentReadingCover item={item} />
      </span>
      <div className="rm-recent-reading-row__book">
        <span className="rm-recent-reading-row__meta">
          {item.sessionNumberLabel} · {item.dateLabel}
        </span>
        <h3 className="editorial">{item.bookTitle}</h3>
        {item.bookAuthor ? (
          <span className="rm-recent-reading-row__author">
            {item.bookAuthor}
          </span>
        ) : null}
      </div>
      {item.activityLabels.length > 0 || item.feedbackStatus ? (
        <span className="rm-recent-reading-row__activity">
          {item.activityLabels.map((label) => (
            <span className="badge" key={label}>{label}</span>
          ))}
          {item.feedbackStatus ? (
            <span className={feedbackBadgeClass(item.feedbackStatus)}>
              {item.feedbackStatus}
            </span>
          ) : null}
        </span>
      ) : null}
      <RecentReadingChevron className="rm-recent-reading-row__arrow" />
    </a>
  );
}

function feedbackBadgeClass(
  status: NonNullable<RecentReadingListItem["feedbackStatus"]>,
) {
  return status === "피드백 O"
    ? "badge badge-ok badge-dot"
    : "badge badge-readonly badge-dot";
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
