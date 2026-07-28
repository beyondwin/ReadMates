import type { ReactElement } from "react";
import type { ParticipationJourneyViewModel } from "@/features/archive/model/my-reading-shelf-model";
import { Link } from "@/features/archive/ui/archive-link";
import { ParticipationAchievement } from "./participation-achievement";
import { ParticipationNudge } from "./participation-nudge";
import { ParticipationTimeline } from "./participation-timeline";
import { SupportingReadingStats } from "./supporting-reading-stats";

export function ParticipationJourney({
  viewModel,
}: {
  viewModel: ParticipationJourneyViewModel;
}): ReactElement {
  return (
    <>
      {viewModel.hasParticipationHistory ? (
        <ParticipationAchievement
          achievementLabel={viewModel.achievementLabel}
          membershipDurationLabel={viewModel.membershipDurationLabel}
        />
      ) : (
        <section className="rm-participation-empty" aria-labelledby="participation-empty-heading">
          <p className="rm-participation-overline">나의 참여</p>
          <h2 id="participation-empty-heading">첫 참여부터 이곳에 흐름이 쌓여요</h2>
        </section>
      )}
      {viewModel.hasParticipationHistory && viewModel.recentSummaryLabel && viewModel.timelineItems.length > 0 ? (
        <ParticipationTimeline
          summaryLabel={viewModel.recentSummaryLabel}
          streakLabel={viewModel.streakLabel}
          items={viewModel.timelineItems}
        />
      ) : null}
      {viewModel.nudge ? <ParticipationNudge nudge={viewModel.nudge} /> : null}
      <SupportingReadingStats stats={viewModel.supportingStats} />
      <section className="rm-participation-records-action" aria-label="책별 기록">
        <Link className="rm-participation-records-action__link" to="/app/me/records">
          내 책별 기록 전체 보기
        </Link>
      </section>
    </>
  );
}
