import type { MemberSpaceViewModel } from "@/features/archive/model/my-reading-shelf-model";
import { ReadingLedgerIcon } from "./reading-ledger-icon";

export function ReadingAchievementSummary({
  viewModel,
  archiveSessionsHref,
}: {
  viewModel: MemberSpaceViewModel;
  archiveSessionsHref: string;
}) {
  return (
    <section className="rm-reading-achievement" aria-labelledby="reading-achievement-heading">
      <div className="rm-reading-achievement__story">
        <p className="rm-member-space-kicker">함께 읽어 온 기록</p>
        <h2 id="reading-achievement-heading">{viewModel.achievementHeading}</h2>
        <dl className="rm-reading-achievement__journey">
          {viewModel.journeyStats.map((stat) => (
            <div className="rm-reading-achievement__stat" key={stat.kind}>
              <dt className="rm-reading-achievement__stat-label">
                <span className="rm-reading-achievement__icon"><ReadingLedgerIcon kind={stat.kind} /></span>
                <span>{stat.label}</span>
              </dt>
              <dd><span>{stat.value}</span>{stat.unit}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="rm-reading-achievement__traces">
        <div className="rm-reading-achievement__traces-head">
          <h3>기록의 흔적</h3>
          <a href={archiveSessionsHref}>기록 보기</a>
        </div>
        <div className="rm-reading-achievement__trace-list">
          {viewModel.recordTraces.map((trace) => (
            <div className="rm-reading-achievement__trace" key={trace.kind}>
              <span className="rm-reading-achievement__icon"><ReadingLedgerIcon kind={trace.kind} /></span>
              <div className="rm-reading-achievement__trace-copy">
                <strong>{trace.label}</strong>
                <span>{trace.description}</span>
              </div>
              <div className="rm-reading-achievement__trace-value"><span>{trace.value}</span>{trace.unit}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
