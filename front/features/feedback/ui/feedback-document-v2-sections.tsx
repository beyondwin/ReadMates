import type { CSSProperties } from "react";
import {
  feedbackParticipantAnchor,
  feedbackSectionIds,
  type FeedbackDocumentView,
} from "@/features/feedback/model/feedback-document-model";

type Participant = FeedbackDocumentView["participants"][number];


export function FeedbackJumpNav({ document }: { document: FeedbackDocumentView }) {
  const links = [
    { href: feedbackSectionIds.summary, label: "모임 요약", visible: true },
    { href: feedbackSectionIds.highlights, label: "하이라이트", visible: (document.highlights?.length ?? 0) > 0 },
    { href: feedbackSectionIds.group, label: "모임 피드백", visible: Boolean(document.groupFeedback) },
    { href: feedbackSectionIds.trend, label: "모임의 흐름", visible: Boolean(document.trend) || (document.followUpQuestions?.length ?? 0) > 0 },
  ].filter((link) => link.visible);

  return (
    <nav className="rm-feedback-jump" aria-label="문서 안 바로 가기">
      {links.map((link) => (
        <a key={link.href} href={`#${link.href}`}>
          {link.label}
        </a>
      ))}
      {document.participants.map((participant) => (
        <a key={participant.number} href={`#${feedbackParticipantAnchor(participant)}`}>
          {participant.name}
        </a>
      ))}
    </nav>
  );
}

export function FeedbackGroupLabel({ children }: { children: string }) {
  return (
    <div className="rm-feedback-group-label">
      <span className="eyebrow">{children}</span>
    </div>
  );
}

export function FeedbackOverviewFields({ items }: { items: NonNullable<FeedbackDocumentView["overview"]> }) {
  if (items.length === 0) {
    return null;
  }

  return (
    <dl className="rm-feedback-overview-fields">
      {items.map((item) => (
        <div key={item.label} className="rm-feedback-overview-row">
          <dt className="eyebrow">{item.label}</dt>
          <dd className="small">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function SectionHeading({ index, eyebrow, title, description }: { index: string; eyebrow: string; title: string; description?: string }) {
  return (
    <header>
      <div className="tiny mono" style={{ color: "var(--text-3)" }}>
        {index}
      </div>
      <div className="eyebrow" style={{ marginTop: 4 }}>
        {eyebrow}
      </div>
      <h2 className="h3 editorial" style={{ margin: "6px 0 0" }}>
        {title}
      </h2>
      {description ? (
        <p className="small" style={{ color: "var(--text-2)", margin: "8px 0 0" }}>
          {description}
        </p>
      ) : null}
    </header>
  );
}

function TimeChip({ time }: { time: string | null | undefined }) {
  if (!time) {
    return null;
  }

  return <span className="tiny mono rm-feedback-time">{time}</span>;
}

export function FeedbackHighlightsSection({ highlights }: { highlights: NonNullable<FeedbackDocumentView["highlights"]> }) {
  if (highlights.length === 0) {
    return null;
  }

  return (
    <section id={feedbackSectionIds.highlights} className="surface rm-feedback-section" style={{ padding: 30 }}>
      <SectionHeading
        index="01"
        eyebrow="오늘의 하이라이트"
        title="대화가 한 단계 올라간 장면"
        description="발언은 녹취를 읽기 쉽게 다듬었고, 시간은 녹음 기준입니다."
      />
      <div className="stack" style={{ "--stack": "14px", marginTop: 22 } as CSSProperties}>
        {highlights.map((highlight, index) => (
          <article key={highlight.title} className="surface-quiet" style={{ padding: 22 }}>
            <span className="badge">하이라이트 {index + 1}</span>
            <h3 className="body editorial" style={{ fontSize: 18, margin: "10px 0 0" }}>
              {highlight.title}
            </h3>
            <ol className="rm-feedback-chain">
              {highlight.lines.map((line, lineIndex) => (
                <li key={`${line.speaker}-${line.time ?? lineIndex}`}>
                  <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                    <strong className="small" style={{ color: "var(--text)" }}>
                      {line.speaker}
                    </strong>
                    <TimeChip time={line.time} />
                  </div>
                  <p className="small" style={{ color: "var(--text-2)", margin: "4px 0 0", lineHeight: 1.6 }}>
                    “{line.text}”
                  </p>
                </li>
              ))}
            </ol>
            <div className="rm-feedback-why">
              <div className="eyebrow">왜 좋았나</div>
              <p className="small" style={{ color: "var(--text-2)", margin: "6px 0 0", lineHeight: 1.65 }}>
                {highlight.why}
              </p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function GroupPoints({ title, marker, points }: { title: string; marker: "good" | "warn"; points: NonNullable<FeedbackDocumentView["groupFeedback"]>["strengths"] }) {
  if (points.length === 0) {
    return null;
  }

  return (
    <section className="surface-quiet" style={{ padding: 20 }}>
      <div className={`eyebrow rm-feedback-mark rm-feedback-mark--${marker}`} style={{ marginBottom: 14 }}>
        {title}
      </div>
      <div className="stack" style={{ "--stack": "20px" } as CSSProperties}>
        {points.map((point) => (
          <article key={point.title} className="rm-feedback-group-point">
            <h3 className="body editorial" style={{ fontSize: 16, margin: 0 }}>
              {point.title}
            </h3>
            <dl className="rm-feedback-problem-fields" style={{ margin: "12px 0 0" }}>
              <dt className="eyebrow">근거</dt>
              <dd className="small" style={{ color: "var(--text-2)", margin: 0, lineHeight: 1.6 }}>
                {point.evidence}
              </dd>
              <dt className="eyebrow">해석</dt>
              <dd className="small" style={{ color: "var(--text-2)", margin: 0, lineHeight: 1.6 }}>
                {point.interpretation}
              </dd>
            </dl>
          </article>
        ))}
      </div>
    </section>
  );
}

export function FeedbackGroupSection({ group }: { group: FeedbackDocumentView["groupFeedback"] }) {
  if (!group) {
    return null;
  }

  const maxShare = Math.max(1, ...group.speakingShares.map((share) => share.percent));

  return (
    <section id={feedbackSectionIds.group} className="surface rm-feedback-section" style={{ padding: 30 }}>
      <SectionHeading index="02" eyebrow="모임 피드백" title="우리 모임은 오늘 어땠나" />
      {group.strengths.length > 0 || group.improvements.length > 0 ? (
        <div className="grid-2 rm-feedback-grid" style={{ gap: 18, marginTop: 22 }}>
          <GroupPoints title="잘된 점" marker="good" points={group.strengths} />
          <GroupPoints title="아쉬운 점" marker="warn" points={group.improvements} />
        </div>
      ) : null}
      {group.speakingShares.length > 0 || group.nextSteps.length > 0 ? (
        <div className="grid-2 rm-feedback-grid" style={{ gap: 18, marginTop: 18 }}>
          {group.speakingShares.length > 0 ? (
            <section>
              <div className="eyebrow" style={{ marginBottom: 12 }}>
                발언 분량
              </div>
              <div className="stack" style={{ "--stack": "10px" } as CSSProperties}>
                {group.speakingShares.map((share) => (
                  <div key={share.name} className="rm-feedback-share-row">
                    <span className="small" style={{ color: "var(--text)" }}>
                      {share.name}
                    </span>
                    <span className="rm-feedback-share-track" aria-hidden="true">
                      <i style={{ width: `${(share.percent / maxShare) * 100}%` }} />
                    </span>
                    <span className="tiny mono" style={{ color: "var(--text-2)" }}>
                      {share.percent}%
                    </span>
                  </div>
                ))}
              </div>
              {group.speakingNote ? (
                <p className="tiny" style={{ color: "var(--text-3)", margin: "10px 0 0" }}>
                  {group.speakingNote}
                </p>
              ) : null}
            </section>
          ) : null}
          {group.nextSteps.length > 0 ? (
            <section>
              <div className="eyebrow" style={{ marginBottom: 12 }}>
                다음 모임 제안
              </div>
              <NextItems items={group.nextSteps} />
            </section>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export function NextItems({ items }: { items: string[] }) {
  return (
    <div className="stack" style={{ "--stack": "8px" } as CSSProperties}>
      {items.map((item) => (
        <div key={item} className="row" style={{ alignItems: "flex-start", gap: 10 }}>
          <span className="badge" style={{ flexShrink: 0 }}>
            다음
          </span>
          <p className="small" style={{ color: "var(--text-2)", margin: 0, lineHeight: 1.6 }}>
            {item}
          </p>
        </div>
      ))}
    </div>
  );
}

export function FeedbackTrendSection({ trend, followUpQuestions }: { trend: FeedbackDocumentView["trend"]; followUpQuestions: string[] }) {
  if (!trend && followUpQuestions.length === 0) {
    return null;
  }

  const attendance = trend?.attendance ?? [];
  const maxCount = Math.max(1, ...attendance.map((point) => point.count));
  const phases = trend?.phases ?? [];
  const repeatedTasks = trend?.repeatedTasks ?? [];

  return (
    <section id={feedbackSectionIds.trend} className="surface rm-feedback-section" style={{ padding: 30 }}>
      <SectionHeading
        index="03"
        eyebrow="모임의 흐름"
        title="우리 모임은 어떻게 바뀌고 있나"
        description="지난 회차 피드백 문서의 관찰 메모와 멤버별 지적을 근거로 정리했습니다."
      />
      {attendance.length > 0 || phases.length > 0 ? (
        <div className="surface-quiet" style={{ padding: 20, marginTop: 22 }}>
          {attendance.length > 0 ? (
            <>
              <div className="eyebrow">회차별 참석 인원</div>
              <div
                className="rm-feedback-bars"
                role="img"
                aria-label={`회차별 참석 인원: ${attendance.map((point) => `${point.label} ${point.count}명`).join(", ")}`}
                style={{ gridTemplateColumns: `repeat(${attendance.length}, minmax(0, 1fr))` }}
              >
                {attendance.map((point, index) => (
                  <div key={point.label} className={`rm-feedback-bar${index === attendance.length - 1 ? " is-current" : ""}`}>
                    <span className="tiny mono">{point.count}</span>
                    <i style={{ height: `${(point.count / maxCount) * 100}%` }} />
                    <span className="tiny mono rm-feedback-bar-label">{point.label.replace(/차$/, "")}</span>
                  </div>
                ))}
              </div>
            </>
          ) : null}
          {phases.length > 0 ? (
            <div className="rm-feedback-steps" style={{ marginTop: attendance.length > 0 ? 14 : 0 }}>
              {phases.map((phase, index) => (
                <div key={phase.label} className={`rm-feedback-step${index === phases.length - 1 ? " is-current" : ""}`}>
                  <span className="tiny mono">{phase.label}</span>
                  <span className="small">{phase.text}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      {repeatedTasks.length > 0 || followUpQuestions.length > 0 ? (
        <div className="grid-2 rm-feedback-grid" style={{ gap: 18, marginTop: 18 }}>
          {repeatedTasks.length > 0 ? (
            <section>
              <div className="eyebrow" style={{ marginBottom: 10 }}>
                반복 과제 추적
              </div>
              <table className="rm-feedback-table">
                <tbody>
                  {repeatedTasks.map((task) => (
                    <tr key={task.task}>
                      <th scope="row" className="small">
                        {task.task}
                      </th>
                      <td className="small">{task.detail}</td>
                      <td>
                        <span className="badge">{task.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ) : null}
          {followUpQuestions.length > 0 ? (
            <section>
              <div className="eyebrow" style={{ marginBottom: 10 }}>
                다음에 이어갈 질문
              </div>
              <ol className="rm-feedback-questions">
                {followUpQuestions.map((question) => (
                  <li key={question} className="small">
                    {question}
                  </li>
                ))}
              </ol>
            </section>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export function ParticipantBadges({ badges }: { badges: string[] }) {
  if (badges.length === 0) {
    return null;
  }

  return (
    <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
      {badges.map((badge) => (
        <span key={badge} className={`badge${badge === "첫 기록" ? " rm-feedback-badge-new" : ""}`}>
          {badge}
        </span>
      ))}
    </div>
  );
}

export function ParticipantJourney({ participant }: { participant: Participant }) {
  const journey = participant.journey ?? [];
  const achievements = participant.achievements ?? [];
  const baseline = participant.baseline ?? [];

  if (journey.length === 0 && achievements.length === 0 && baseline.length === 0) {
    return null;
  }

  return (
    <section className="surface-quiet" style={{ padding: 18, marginTop: 24 }}>
      {journey.length > 0 ? (
        <>
          <div className="eyebrow">변화 흐름</div>
          <div className="rm-feedback-steps" style={{ marginTop: 10 }}>
            {journey.map((step, index) => (
              <div key={step.label} className={`rm-feedback-step${index === journey.length - 1 ? " is-current" : ""}`}>
                <span className="tiny mono">{step.label}</span>
                <span className="small">{step.text}</span>
              </div>
            ))}
          </div>
        </>
      ) : null}
      {achievements.length > 0 ? (
        <>
          <div className="eyebrow" style={{ marginTop: journey.length > 0 ? 16 : 0 }}>
            지난 과제, 이번에 해낸 것
          </div>
          <ul className="rm-feedback-done">
            {achievements.map((item) => (
              <li key={item} className="small">
                {item}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {baseline.length > 0 ? (
        <>
          <div className="eyebrow" style={{ marginTop: journey.length > 0 || achievements.length > 0 ? 16 : 0 }}>
            첫 기록 · 다음에 비교할 기준점
          </div>
          <p className="small" style={{ color: "var(--text-2)", margin: "8px 0 0" }}>
            이전 기록이 없어 다른 멤버와 비교하지 않고, 다음 회차부터 아래 항목의 변화를 봅니다.
          </p>
          <ol className="rm-feedback-baseline small">
            {baseline.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
        </>
      ) : null}
    </section>
  );
}

export function ParticipantSessionQuotes({ quotes }: { quotes: NonNullable<Participant["sessionQuotes"]> }) {
  if (quotes.length === 0) {
    return null;
  }

  return (
    <section style={{ marginTop: 28 }}>
      <div className="eyebrow" style={{ marginBottom: 12 }}>
        이번 모임의 발언
      </div>
      <div className="stack" style={{ "--stack": "16px" } as CSSProperties}>
        {quotes.map((quote) => (
          <article key={`${quote.time ?? ""}-${quote.quote}`} className="rm-feedback-session-quote">
            <TimeChip time={quote.time} />
            <p className="body editorial" style={{ fontSize: 16, lineHeight: 1.6, margin: "4px 0 0" }}>
              “{quote.quote}”
            </p>
            <p className="small" style={{ color: "var(--text-2)", margin: "8px 0 0", lineHeight: 1.6 }}>
              {quote.note}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

export const feedbackDocumentV2Styles = `
  .rm-feedback-jump {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .rm-feedback-jump a {
    font-size: 13px;
    line-height: 1.2;
    color: var(--text-2);
    text-decoration: none;
    border: 1px solid var(--line);
    background: var(--bg-raised);
    border-radius: 999px;
    padding: 6px 12px;
  }

  .rm-feedback-jump a:hover {
    color: var(--text);
    border-color: var(--text-3);
  }

  .rm-feedback-jump a:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .rm-feedback-group-label {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .rm-feedback-group-label::after {
    content: "";
    flex: 1;
    height: 1px;
    background: var(--line);
  }

  .rm-feedback-section,
  .rm-feedback-participant-document {
    scroll-margin-top: 88px;
  }

  .rm-feedback-overview-fields {
    display: grid;
    gap: 12px;
    margin: 0 0 20px;
    padding-bottom: 18px;
    border-bottom: 1px solid var(--line-soft);
  }

  .rm-feedback-overview-row {
    display: grid;
    grid-template-columns: 140px minmax(0, 1fr);
    gap: 16px;
    align-items: baseline;
  }

  .rm-feedback-overview-row dd {
    margin: 0;
    color: var(--text);
    line-height: 1.6;
  }

  .rm-feedback-chain {
    list-style: none;
    margin: 16px 0 0;
    padding: 0;
  }

  .rm-feedback-chain li {
    position: relative;
    padding: 0 0 14px 22px;
  }

  .rm-feedback-chain li::before {
    content: "";
    position: absolute;
    left: 3px;
    top: 6px;
    width: 9px;
    height: 9px;
    border-radius: 50%;
    border: 2px solid var(--accent);
    background: var(--bg-sub);
  }

  .rm-feedback-chain li::after {
    content: "";
    position: absolute;
    left: 7px;
    top: 19px;
    bottom: 0;
    width: 1px;
    background: var(--line);
  }

  .rm-feedback-chain li:last-child {
    padding-bottom: 0;
  }

  .rm-feedback-chain li:last-child::after {
    display: none;
  }

  .rm-feedback-time {
    color: var(--text-3);
  }

  .rm-feedback-why {
    margin-top: 16px;
    padding-top: 14px;
    border-top: 1px solid var(--line-soft);
  }

  .rm-feedback-group-point + .rm-feedback-group-point {
    padding-top: 18px;
    border-top: 1px solid var(--line-soft);
  }

  .rm-feedback-mark::before {
    display: inline-block;
    margin-right: 6px;
    font-weight: 700;
  }

  .rm-feedback-mark--good::before {
    content: "✓";
    color: var(--accent);
  }

  .rm-feedback-mark--warn::before {
    content: "△";
    color: var(--text-2);
  }

  .rm-feedback-share-row {
    display: grid;
    grid-template-columns: minmax(48px, max-content) minmax(0, 1fr) 40px;
    align-items: center;
    gap: 10px;
  }

  .rm-feedback-share-track {
    display: block;
    height: 8px;
    border-radius: 999px;
    background: var(--bg-sub);
    border: 1px solid var(--line-soft);
    overflow: hidden;
  }

  .rm-feedback-share-track i {
    display: block;
    height: 100%;
    background: var(--accent);
    opacity: 0.8;
  }

  .rm-feedback-bars {
    display: grid;
    gap: 8px;
    align-items: end;
    height: 120px;
    margin-top: 10px;
  }

  .rm-feedback-bar {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-end;
    gap: 4px;
    height: 100%;
    min-width: 0;
    color: var(--text-3);
  }

  .rm-feedback-bar i {
    display: block;
    width: 100%;
    max-width: 28px;
    border-radius: 3px 3px 0 0;
    background: var(--line);
  }

  .rm-feedback-bar.is-current {
    color: var(--accent);
    font-weight: 600;
  }

  .rm-feedback-bar.is-current i {
    background: var(--accent);
  }

  .rm-feedback-bar-label {
    width: 100%;
    text-align: center;
    padding-top: 4px;
    border-top: 1px solid var(--line);
  }

  .rm-feedback-steps {
    display: flex;
    align-items: stretch;
    gap: 6px;
  }

  .rm-feedback-step {
    flex: 1 1 0;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    background: var(--bg-raised);
    border: 1px solid var(--line-soft);
    border-radius: var(--r-2);
    padding: 9px 11px;
  }

  .rm-feedback-step .tiny {
    color: var(--text-3);
  }

  .rm-feedback-step .small {
    color: var(--text-2);
    line-height: 1.45;
  }

  .rm-feedback-step.is-current {
    border-color: var(--accent);
  }

  .rm-feedback-step.is-current .tiny {
    color: var(--accent);
  }

  .rm-feedback-table {
    width: 100%;
    border-collapse: collapse;
  }

  .rm-feedback-table th,
  .rm-feedback-table td {
    padding: 9px 8px 9px 0;
    border-bottom: 1px solid var(--line-soft);
    vertical-align: top;
    line-height: 1.5;
    text-align: left;
  }

  .rm-feedback-table th {
    color: var(--text);
    font-weight: 500;
  }

  .rm-feedback-table td {
    color: var(--text-2);
  }

  .rm-feedback-table td:last-child {
    padding-right: 0;
    text-align: right;
    white-space: nowrap;
  }

  .rm-feedback-questions {
    margin: 0;
    padding-left: 18px;
    display: grid;
    gap: 8px;
    color: var(--text-2);
  }

  .rm-feedback-badge-new {
    border-color: var(--accent);
    color: var(--accent);
    background: var(--accent-soft);
  }

  .rm-feedback-done {
    list-style: none;
    margin: 8px 0 0;
    padding: 0;
    display: grid;
    gap: 6px;
  }

  .rm-feedback-done li {
    position: relative;
    padding-left: 20px;
    color: var(--text-2);
    line-height: 1.55;
  }

  .rm-feedback-done li::before {
    content: "✓";
    position: absolute;
    left: 2px;
    color: var(--accent);
    font-weight: 700;
  }

  .rm-feedback-baseline {
    margin: 10px 0 0;
    padding-left: 20px;
    display: grid;
    gap: 4px;
    color: var(--text-2);
  }

  .rm-feedback-contributions {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .rm-feedback-contributions li {
    display: grid;
    grid-template-columns: minmax(0, max-content) minmax(0, 1fr);
    gap: 8px;
    margin-top: 8px;
    color: var(--text-2);
    line-height: 1.6;
  }

  .rm-feedback-contributions li.no-time {
    grid-template-columns: minmax(0, 1fr);
  }

  .rm-feedback-contributions .rm-feedback-time {
    padding-top: 2px;
    min-width: 52px;
  }

  .rm-feedback-session-quote {
    padding-left: 14px;
    border-left: 2px solid var(--line);
  }

  @media (max-width: 768px) {
    .rm-feedback-steps {
      flex-direction: column;
    }

    .rm-feedback-grid {
      grid-template-columns: minmax(0, 1fr);
    }

    .rm-feedback-bars {
      gap: 4px;
    }
  }

  @media (max-width: 560px) {
    .rm-feedback-overview-row {
      grid-template-columns: minmax(0, 1fr);
      gap: 4px;
    }

    .rm-feedback-table th,
    .rm-feedback-table td {
      display: block;
      padding: 0;
      border: 0;
      text-align: left;
    }

    .rm-feedback-table tr {
      display: grid;
      gap: 4px;
      padding: 10px 0;
      border-bottom: 1px solid var(--line-soft);
    }

    .rm-feedback-table td:last-child {
      text-align: left;
    }
  }
`;
