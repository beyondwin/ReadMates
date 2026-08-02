import type { MemberSpaceViewModel } from "@/features/archive/model/my-reading-shelf-model";

export function ReadingAchievementSummary({
  viewModel,
}: {
  viewModel: MemberSpaceViewModel;
}) {
  return (
    <section className="rm-reading-achievement" aria-labelledby="reading-achievement-heading">
      <header className="rm-reading-achievement__header">
        <p className="rm-member-space-kicker">함께 읽어 온 기록</p>
        <h2 id="reading-achievement-heading">{viewModel.achievementHeading}</h2>
      </header>
      <div className="rm-reading-achievement__groups">
        <section className="rm-reading-achievement__group" aria-labelledby="reading-journey-heading">
          <h3 id="reading-journey-heading">독서 여정</h3>
          <dl className="rm-reading-achievement__list rm-reading-achievement__journey">
            {viewModel.journeyStats.map((stat) => (
              <div className="rm-reading-achievement__metric rm-reading-achievement__stat" key={stat.kind}>
                <dt className="rm-reading-achievement__metric-copy rm-reading-achievement__stat-label">
                  <strong>{stat.label}</strong>
                </dt>
                <dd className="rm-reading-achievement__metric-value"><span>{stat.value}</span>{stat.unit}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section className="rm-reading-achievement__group rm-reading-achievement__traces" aria-labelledby="reading-traces-heading">
          <h3 id="reading-traces-heading">기록의 흔적</h3>
          <dl className="rm-reading-achievement__list rm-reading-achievement__trace-list">
            {viewModel.recordTraces.map((trace) => (
              <div className="rm-reading-achievement__metric rm-reading-achievement__trace" key={trace.kind}>
                <dt className="rm-reading-achievement__metric-copy rm-reading-achievement__trace-copy">
                  <strong>{trace.label}</strong>
                  <span>{trace.description}</span>
                </dt>
                <dd className="rm-reading-achievement__metric-value rm-reading-achievement__trace-value"><span>{trace.value}</span>{trace.unit}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </section>
  );
}
