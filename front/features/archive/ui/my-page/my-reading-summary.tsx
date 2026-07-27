import { completionLabel, type MyJourneySummary } from "@/features/archive/model/my-reading-shelf-model";

export function MyReadingSummary({ summary }: { summary: MyJourneySummary }) {
  const entries = [
    { label: "참여", value: String(summary.attendedSessionCount) },
    { label: "완독", value: completionLabel(summary) },
    { label: "질문", value: String(summary.questionCount) },
    { label: "서평", value: String(summary.reviewCount) },
  ];

  return (
    <section className="rm-my-shelf-summary" aria-label="개인 요약">
      <dl className="rm-my-shelf-summary__list">
        {entries.map((entry) => (
          <div key={entry.label} className="rm-my-shelf-summary__item">
            <dt>{entry.label}</dt>
            <dd>{entry.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
