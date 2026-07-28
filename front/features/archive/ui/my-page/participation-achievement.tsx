import type { ReactElement } from "react";

export function ParticipationAchievement({
  achievementLabel,
  membershipDurationLabel,
}: {
  achievementLabel: string;
  membershipDurationLabel: string | null;
}): ReactElement {
  return (
    <section className="rm-participation-achievement" aria-labelledby="participation-achievement-heading">
      <p className="rm-participation-overline">전체 기록</p>
      <h2 id="participation-achievement-heading">{achievementLabel}</h2>
      {membershipDurationLabel ? <p>{membershipDurationLabel}</p> : null}
    </section>
  );
}
