type PlatformAdminSummaryView = {
  platformRole: string;
  activeClubCount: number;
  domainActionRequiredCount: number;
};

export function PlatformAdminDashboard({ summary }: { summary: PlatformAdminSummaryView }) {
  return (
    <main className="platform-admin-page">
      <section className="container platform-admin-page__inner" aria-labelledby="platform-admin-title">
        <div className="platform-admin-page__header">
          <p className="eyebrow">ReadMates Admin</p>
          <h1 id="platform-admin-title" className="h1 editorial">
            플랫폼 관리
          </h1>
        </div>

        <section className="platform-admin-summary" aria-label="플랫폼 요약">
          <MetricCard label="플랫폼 역할" value={summary.platformRole} />
          <MetricCard label="활성 클럽" value={summary.activeClubCount.toLocaleString("ko-KR")} />
          <MetricCard label="도메인 조치 필요" value={summary.domainActionRequiredCount.toLocaleString("ko-KR")} />
        </section>
      </section>
    </main>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="surface platform-admin-metric">
      <p className="tiny muted platform-admin-metric__label">{label}</p>
      <p className="editorial platform-admin-metric__value">{value}</p>
    </article>
  );
}
