import type { ReactElement } from "react";
import type { ParticipationTimelineItem } from "@/features/archive/model/my-reading-shelf-model";

export function ParticipationTimeline({
  summaryLabel,
  streakLabel,
  items,
}: {
  summaryLabel: string;
  streakLabel: string | null;
  items: ParticipationTimelineItem[];
}): ReactElement {
  return (
    <section className="rm-participation-timeline" aria-labelledby="participation-timeline-heading">
      <div className="rm-participation-timeline__heading">
        <div>
          <p className="rm-participation-overline">최근 참여 흐름</p>
          <h2 id="participation-timeline-heading">{summaryLabel}</h2>
        </div>
        {streakLabel ? <p className="rm-participation-streak">{streakLabel}</p> : null}
      </div>
      <ol className="rm-participation-timeline__list" aria-label="최근 참여 대상 회차">
        {items.map((item) => (
          <li key={item.sessionNumber} data-attendance-status={item.attendanceStatus}>
            <span className="rm-participation-timeline__marker" aria-hidden>
              {item.attendanceStatus === "ATTENDED" ? "✓" : item.attendanceStatus === "ABSENT" ? "–" : "?"}
            </span>
            <span className="rm-participation-timeline__session">{item.sessionNumber}차</span>
            <span className="rm-participation-timeline__status">{item.statusLabel}</span>
            {item.readingLabel ? (
              <span className="rm-participation-timeline__reading">{item.readingLabel}</span>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
