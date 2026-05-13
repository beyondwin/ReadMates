import { type HostNotificationSummary, summaryBadgeClass } from "./notification-formatters";

export function HostNotificationsSummary({ summary }: { summary: HostNotificationSummary }) {
  return (
    <section className="rm-document-panel" aria-label="알림 발송 요약" style={{ padding: "18px 22px", marginBottom: 20 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(126px, 1fr))",
          gap: 12,
        }}
      >
        <SummaryCount label="대기" value={summary.pending} tone={summary.pending > 0 ? "accent" : "default"} />
        <SummaryCount label="실패" value={summary.failed} tone={summary.failed > 0 ? "warn" : "default"} />
        <SummaryCount label="중단" value={summary.dead} tone={summary.dead > 0 ? "warn" : "default"} />
        <SummaryCount label="최근 24시간" value={summary.sentLast24h} tone="ok" />
      </div>
    </section>
  );
}

function SummaryCount({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "accent" | "default" | "ok" | "warn";
}) {
  return (
    <div>
      <div className="tiny" style={{ color: "var(--text-3)" }}>
        {label}
      </div>
      <div className="row" style={{ gap: 8, alignItems: "baseline", marginTop: 4 }}>
        <strong className="h3 mono" style={{ margin: 0 }}>
          {Math.max(0, value)}
        </strong>
        <span className={summaryBadgeClass(tone)}>건</span>
      </div>
    </div>
  );
}
