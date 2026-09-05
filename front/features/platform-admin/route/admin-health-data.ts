import type { QueryClient } from "@tanstack/react-query";
import type { LoaderFunctionArgs } from "react-router";
import {
  DEPLOY_ATTEMPTS_CARD_ID,
  formatLastEvidenceLabel,
  healthCardEvidenceState,
  healthCardOperatorView,
  healthCardsForPage,
  type HealthCard,
  type HealthEvidenceState,
  type PlatformHealthSnapshot,
} from "@/features/platform-admin/model/platform-admin-health-model";
import { platformAdminHealthSnapshotQuery } from "@/features/platform-admin/queries/platform-admin-health-queries";
import { requirePlatformAdminLoaderAuth } from "@/shared/auth/platform-admin-loader";

export type AdminServiceStatusRowId =
  | "app-api"
  | "notifications"
  | "summaries"
  | "public-record"
  | "domain";

export type AdminServiceStatusRow = {
  id: AdminServiceStatusRowId;
  title: string;
  attention: boolean;
  statusLabel: string;
  lastChecked: string;
  impactLabel: string;
  summary: string;
  impactScope: string;
  lastOkDelivery: string;
  recoveryLabel: string;
  recoveryHref: string | null;
  cardIds: readonly string[];
};

export type AdminServiceStatusView = {
  rows: AdminServiceStatusRow[];
  defaultExpandedId: AdminServiceStatusRowId | null;
};

const SERVICE_STATUS_GROUPS: readonly {
  id: AdminServiceStatusRowId;
  title: string;
  cardIds: readonly string[];
}[] = [
  { id: "app-api", title: "앱과 API", cardIds: ["db_pool"] },
  { id: "notifications", title: "알림", cardIds: ["outbox_backlog", "notification_dispatch_success"] },
  { id: "summaries", title: "요약 작업", cardIds: ["kafka_consumer_lag", "ai_provider_availability"] },
  { id: "public-record", title: "공개 기록", cardIds: [DEPLOY_ATTEMPTS_CARD_ID] },
  { id: "domain", title: "도메인", cardIds: ["redis", "outbound-resilience"] },
];

const RECOVERY_LABEL = "실패한 안내만 다시 보내기";

const EVIDENCE_RANK: Record<HealthEvidenceState, number> = {
  crit: 5,
  warn: 4,
  unavailable: 3,
  empty: 2,
  disabled: 1,
  ok: 0,
};

export function adminHealthLoaderFactory(queryClient: QueryClient) {
  return async function loadAdminHealth(args?: LoaderFunctionArgs) {
    await requirePlatformAdminLoaderAuth(args);
    await queryClient.fetchQuery(platformAdminHealthSnapshotQuery());
    return null;
  };
}

export function buildAdminServiceStatusView(
  snapshot: PlatformHealthSnapshot,
): AdminServiceStatusView {
  const cards = healthCardsForPage(snapshot);
  const rows = SERVICE_STATUS_GROUPS.map((group) => presentStatusRow(group, cards));
  const defaultExpandedId = rows.find((row) => row.attention)?.id ?? null;
  return { rows, defaultExpandedId };
}

function presentStatusRow(
  group: (typeof SERVICE_STATUS_GROUPS)[number],
  cards: readonly HealthCard[],
): AdminServiceStatusRow {
  const matched = cards.filter((card) => group.cardIds.includes(card.id));
  const worst = pickWorstCard(matched);
  const evidence = worst ? healthCardEvidenceState(worst) : "ok";
  const attention = evidence !== "ok" && evidence !== "disabled";
  const operator = worst ? healthCardOperatorView(worst) : null;
  return {
    id: group.id,
    title: group.title,
    attention,
    statusLabel: statusLabelFor(evidence),
    lastChecked: worst ? formatLastEvidenceLabel(worst.lastCheckedAt) : "확인 시각 없음",
    impactLabel: attention ? (operator?.impact ?? "확인 필요") : "영향 없음",
    summary: operator?.stateSentence ?? "",
    impactScope: operator?.impact ?? "—",
    lastOkDelivery: "—",
    recoveryLabel: RECOVERY_LABEL,
    recoveryHref: worst?.drill?.target ?? null,
    cardIds: group.cardIds,
  };
}

function pickWorstCard(cards: readonly HealthCard[]): HealthCard | undefined {
  return [...cards].sort(
    (left, right) =>
      EVIDENCE_RANK[healthCardEvidenceState(right)] - EVIDENCE_RANK[healthCardEvidenceState(left)],
  )[0];
}

function statusLabelFor(evidence: HealthEvidenceState): string {
  if (evidence === "ok") return "정상";
  if (evidence === "disabled") return "사용 안 함";
  if (evidence === "unavailable" || evidence === "empty") return "확인 지연";
  return "확인 필요";
}
