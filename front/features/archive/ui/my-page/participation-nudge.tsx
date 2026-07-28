import type { ReactElement } from "react";
import type { ParticipationJourneyViewModel } from "@/features/archive/model/my-reading-shelf-model";
import { Link } from "@/features/archive/ui/archive-link";

export function ParticipationNudge({
  nudge,
}: {
  nudge: NonNullable<ParticipationJourneyViewModel["nudge"]>;
}): ReactElement {
  return (
    <section className="rm-participation-nudge" aria-labelledby="participation-nudge-heading">
      <div>
        <p className="rm-participation-overline">다음 기록</p>
        <h2 id="participation-nudge-heading">다음 모임을 준비하고 있어요</h2>
        <p>{nudge.body}</p>
      </div>
      <Link className="rm-participation-nudge__link" to={nudge.href}>
        {nudge.label}
      </Link>
    </section>
  );
}
