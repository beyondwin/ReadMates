import type { PlatformAdminWorkbenchView } from "@/features/platform-admin/model/platform-admin-workbench-model";

type Props = {
  metrics: PlatformAdminWorkbenchView["metrics"];
};

export function PlatformAdminOverviewMetrics({ metrics }: Props) {
  return (
    <section className="platform-admin-summary" aria-label="플랫폼 요약">
      <MetricCard label="플랫폼 역할" value={metrics.platformRole} />
      <MetricCard label="활성 클럽" value={metrics.activeClubCount.toLocaleString("ko-KR")} />
      <MetricCard label="조치 필요" value={metrics.needsActionCount.toLocaleString("ko-KR")} />
      <MetricCard label="공개 준비" value={metrics.publishReadyCount.toLocaleString("ko-KR")} />
    </section>
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
