import type { ReactElement } from "react";
import type { ParticipationJourneyViewModel } from "@/features/archive/model/my-reading-shelf-model";

export function SupportingReadingStats({
  stats,
}: {
  stats: ParticipationJourneyViewModel["supportingStats"];
}): ReactElement {
  return (
    <section className="rm-supporting-reading-stats" aria-labelledby="supporting-reading-stats-heading">
      <h2 id="supporting-reading-stats-heading">나의 읽기 기록</h2>
      <dl>
        {stats.map((stat) => (
          <div key={stat.label}>
            <dt>{stat.label}</dt>
            <dd>{stat.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
