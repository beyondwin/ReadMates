import { useQuery } from "@tanstack/react-query";
import {
  healthCardEvidenceState,
  healthCardOperatorView,
  healthCardsForPage,
  partitionHealthServiceCards,
  type HealthCard,
  type HealthEvidenceState,
  type PlatformHealthSnapshot,
} from "@/features/platform-admin/model/platform-admin-health-model";
import { platformAdminHealthSnapshotQuery } from "@/features/platform-admin/queries/platform-admin-health-queries";
import { AdminHealthGrid } from "@/features/platform-admin/ui/admin-health-grid";
import { useAdminShellStatus, type AdminShellStatus } from "./admin-shell-status-context";

const SEOUL_CLOCK = new Intl.DateTimeFormat("ko-KR", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Asia/Seoul",
});

const IMPACT_SERVICE_NAME: Record<string, string> = {
  outbox_backlog: "알림",
  notification_dispatch_success: "알림",
  kafka_consumer_lag: "AI 작업",
  ai_provider_availability: "AI 작업",
  db_pool: "앱과 API",
  redis: "Redis",
  "outbound-resilience": "외부 연결",
  deploy_attempts_strip: "공개 기록",
};

const DEGRADED_EVIDENCE_RANK: readonly HealthEvidenceState[] = [
  "crit",
  "warn",
  "unavailable",
  "empty",
];

export function AdminHealthRoute() {
  const query = useQuery(platformAdminHealthSnapshotQuery());
  useAdminShellStatus(healthHeaderStatus(query.data ?? null, query.isLoading, query.isError));

  return (
    <AdminHealthGrid
      snapshot={query.data ?? null}
      loading={query.isLoading}
      error={query.isError}
      fetching={query.isFetching}
      onRefresh={() => void query.refetch()}
      onRetryCard={() => void query.refetch()}
    />
  );
}

function healthHeaderStatus(
  snapshot: PlatformHealthSnapshot | null,
  loading: boolean,
  error: boolean,
): AdminShellStatus | null {
  if (loading || error || !snapshot) return null;
  const { deviations } = partitionHealthServiceCards(healthCardsForPage(snapshot));
  const impacted = pickImpactedService(deviations);
  const aside = formatLastFullCheck(snapshot.lastSuccessfulAt ?? snapshot.generatedAt);
  if (!impacted) {
    return { tone: "ok", text: "모든 서비스가 정상입니다.", aside };
  }
  return {
    tone: "warn",
    text: `대체로 정상이며, ${impactServiceName(impacted)} 전달을 확인해야 합니다.`,
    aside,
  };
}

function pickImpactedService(deviations: readonly HealthCard[]): HealthCard | null {
  for (const evidence of DEGRADED_EVIDENCE_RANK) {
    const match = deviations.find((card) => healthCardEvidenceState(card) === evidence);
    if (match) return match;
  }
  return null;
}

function impactServiceName(card: HealthCard): string {
  return IMPACT_SERVICE_NAME[card.id] ?? healthCardOperatorView(card).label;
}

function formatLastFullCheck(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return `마지막 전체 확인 ${SEOUL_CLOCK.format(date)}`;
}
