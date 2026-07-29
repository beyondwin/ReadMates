import type { MemberSpaceViewModel } from "@/features/archive/model/my-reading-shelf-model";

export function ReadingAchievementSummary({ viewModel }: { viewModel: MemberSpaceViewModel }) {
  return (
    <section className="rm-reading-achievement" aria-labelledby="reading-achievement-heading">
      <p className="rm-member-space-kicker">함께 읽어 온 기록</p>
      <h2 id="reading-achievement-heading">{viewModel.achievementHeading}</h2>
      <p>{viewModel.achievementBody}</p>
      <dl className="rm-reading-achievement__metrics">
        {viewModel.metrics.map((metric) => (
          <div key={metric.label}>
            <dt>{metric.label}</dt>
            <dd>{metric.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
