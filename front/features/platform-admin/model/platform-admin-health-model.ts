import {
  adminHealthAvailabilityLanguage,
  adminHealthFreshnessLanguage,
} from "@/features/platform-admin/model/admin-status-language";

export type HealthCardStatus = "OK" | "WARN" | "CRIT" | "UNKNOWN";
export type HealthCardSource = "IN_PROCESS" | "PROMETHEUS" | "FILE";
export type DeployAttemptFinalStatus = "SUCCEEDED" | "FAILED" | "RUNNING";
export type PlatformHealthRefreshState = "FRESH" | "REFRESHING" | "STALE" | "UNAVAILABLE";
export type HealthEvidenceState = "ok" | "warn" | "crit" | "unavailable" | "disabled" | "empty";
export type HealthPageState = "ready" | "partial" | "unavailable" | "disabled";

export const HEALTH_PAGE_HEADING = "서비스 건강";
export const HEALTH_PAGE_DESCRIPTION =
  "서비스·큐·AI 가용성·outbox·배포 신호를 근거와 함께 봅니다.";
export const HEALTH_OK_SIGNALS_LABEL = "정상 신호";
export const DEPLOY_ATTEMPTS_CARD_ID = "deploy_attempts_strip";

export type HealthLastIncident = {
  at: string;
  title: string;
};

export type HealthCardMetric = {
  value: number | null;
  unit: string;
  label: string | null;
};

export type HealthCardThresholds = {
  warn: number | null;
  crit: number | null;
};

export type HealthCardDrill = {
  kind: "ADMIN_ROUTE";
  target: string;
};

export type DeployAttemptStripEntry = {
  attemptId: string;
  startedAt: string;
  endedAt: string | null;
  finalStatus: DeployAttemptFinalStatus;
  imageTag: string | null;
  durationSeconds: number | null;
};

export type HealthCard = {
  id: string;
  title: string;
  status: HealthCardStatus;
  metric: HealthCardMetric | null;
  thresholds: HealthCardThresholds | null;
  lastCheckedAt: string;
  source: HealthCardSource;
  drill: HealthCardDrill | null;
  reason: string | null;
  deployStrip: DeployAttemptStripEntry[] | null;
};

export type PlatformHealthSnapshot = {
  schema: "platform.health_snapshot.v1";
  generatedAt: string;
  lastSuccessfulAt: string | null;
  refreshState: PlatformHealthRefreshState;
  staleAgeSeconds: number;
  cards: HealthCard[];
};

export type HealthFailedSource = {
  id: string;
  label: string;
  available: false;
  detail: string;
};

const SOURCE_LABEL: Record<HealthCardSource, string> = {
  IN_PROCESS: "프로세스",
  PROMETHEUS: "Prometheus",
  FILE: "파일",
};

const EVIDENCE_LABEL: Record<HealthEvidenceState, string> = {
  ok: "정상",
  warn: "주의",
  crit: "위험",
  unavailable: "확인 불가",
  disabled: adminHealthAvailabilityLanguage("DISABLED").primaryText,
  empty: "없음",
};

export function isDisabledHealthReason(reason: string | null): boolean {
  return reason != null && (reason === "disabled" || reason.endsWith("_disabled"));
}

export function healthCardEvidenceState(card: HealthCard): HealthEvidenceState {
  if (isDisabledHealthReason(card.reason)) return "disabled";
  if (card.status === "UNKNOWN") return "unavailable";
  if (card.id === DEPLOY_ATTEMPTS_CARD_ID) {
    if (card.deployStrip == null) return "unavailable";
    if (card.deployStrip.length === 0) return "empty";
  }
  if (card.status === "WARN") return "warn";
  if (card.status === "CRIT") return "crit";
  if (card.metric == null && card.id !== DEPLOY_ATTEMPTS_CARD_ID) return "empty";
  if (card.metric && (card.metric.value === null || Number.isNaN(card.metric.value))) return "empty";
  return "ok";
}

export function healthEvidenceLabel(state: HealthEvidenceState): string {
  return EVIDENCE_LABEL[state];
}

export function healthSourceLabel(source: HealthCardSource): string {
  return SOURCE_LABEL[source];
}

export function healthFreshnessLabel(refreshState: PlatformHealthRefreshState): string {
  return adminHealthFreshnessLanguage(refreshState).primaryText;
}

export function healthPrimaryReading(card: HealthCard): string {
  const evidence = healthCardEvidenceState(card);
  if (evidence === "disabled") return adminHealthAvailabilityLanguage("DISABLED").primaryText;
  if (evidence === "unavailable") return "—";
  if (evidence === "empty") {
    return card.id === DEPLOY_ATTEMPTS_CARD_ID ? "기록 없음" : "없음";
  }
  if (card.id === DEPLOY_ATTEMPTS_CARD_ID) {
    return card.deployStrip ? `${card.deployStrip.length}건` : "기록 없음";
  }
  if (!card.metric || card.metric.value === null || Number.isNaN(card.metric.value)) return "없음";
  return formatHealthMetricValue(card.metric.value, card.metric.unit);
}

export function formatHealthMetricValue(value: number, unit: string): string {
  if (unit === "ratio") return `${(value * 100).toFixed(2)}%`;
  return `${value.toLocaleString()} ${unit}`;
}

export function healthDrillLabel(card: HealthCard): string | null {
  if (!card.drill) return null;
  if (card.drill.target.startsWith("/admin/notifications")) return "알림 운영에서 자세히 보기";
  if (card.drill.target.startsWith("/admin/ai-ops")) return "AI 작업에서 자세히 보기";
  return "자세히 보기";
}

export function canRetryHealthCard(card: HealthCard): boolean {
  return healthCardEvidenceState(card) === "unavailable";
}

export function formatHealthTimestamp(iso: string): string | null {
  const timestamp = new Date(iso).getTime();
  if (!Number.isFinite(timestamp)) return null;
  return new Date(timestamp).toLocaleString();
}

export function formatGeneratedAtLabel(iso: string): string {
  const formatted = formatHealthTimestamp(iso);
  return formatted ? `생성 시각 ${formatted}` : "생성 시각 없음";
}

export function formatLastSuccessfulLabel(iso: string): string {
  const formatted = formatHealthTimestamp(iso);
  return formatted ? `마지막 정상 갱신 ${formatted}` : "마지막 정상 갱신 시각 없음";
}

export function formatLastEvidenceLabel(iso: string): string {
  return formatHealthTimestamp(iso) ?? "확인 시각 없음";
}

export function isLastKnownHealthEvidence(
  evidence: HealthEvidenceState,
  refreshState: PlatformHealthRefreshState,
): boolean {
  return evidence === "ok" && (refreshState === "STALE" || refreshState === "UNAVAILABLE");
}

export function formatRefreshStateLabel(snapshot: PlatformHealthSnapshot): string {
  switch (snapshot.refreshState) {
    case "FRESH":
      return "정상 갱신 완료";
    case "REFRESHING":
      return "서버에서 갱신 중";
    case "STALE":
      return `마지막 정상 갱신 ${formatAge(snapshot.staleAgeSeconds)} 전`;
    case "UNAVAILABLE":
      return "정상 갱신 이력 없음";
  }
}

export function healthCardsForPage(snapshot: PlatformHealthSnapshot): HealthCard[] {
  if (snapshot.cards.some((card) => card.id === DEPLOY_ATTEMPTS_CARD_ID)) {
    return snapshot.cards;
  }
  return [...snapshot.cards, missingDeployCard()];
}

export function missingDeployCard(): HealthCard {
  return {
    id: DEPLOY_ATTEMPTS_CARD_ID,
    title: "최근 deploy",
    status: "UNKNOWN",
    metric: null,
    thresholds: null,
    lastCheckedAt: "",
    source: "FILE",
    drill: null,
    reason: "ledger_unavailable",
    deployStrip: null,
  };
}

export function aggregateHealthPageState(cards: readonly HealthCard[]): HealthPageState {
  if (cards.length === 0) return "unavailable";
  const states = cards.map(healthCardEvidenceState);
  const unavailableCount = states.filter((state) => state === "unavailable").length;
  const disabledCount = states.filter((state) => state === "disabled").length;
  if (unavailableCount === states.length) return "unavailable";
  if (unavailableCount > 0) return "partial";
  if (disabledCount === states.length) return "disabled";
  return "ready";
}

export function partitionHealthServiceCards(cards: readonly HealthCard[]): {
  deviations: HealthCard[];
  okSignals: HealthCard[];
} {
  const serviceCards = cards.filter((card) => card.id !== DEPLOY_ATTEMPTS_CARD_ID);
  return {
    deviations: serviceCards.filter((card) => healthCardEvidenceState(card) !== "ok"),
    okSignals: serviceCards.filter((card) => healthCardEvidenceState(card) === "ok"),
  };
}

export function formatHealthNarrative(
  cards: readonly HealthCard[],
  lastIncident?: HealthLastIncident | null,
): string {
  const { deviations } = partitionHealthServiceCards(cards);
  if (deviations.length > 0) {
    return deviations
      .map((card) => `${card.title} ${healthEvidenceLabel(healthCardEvidenceState(card))}.`)
      .join(" ");
  }
  const resolved = formatResolvedIncident(lastIncident);
  return resolved ? `모든 신호 정상. 마지막 이상은 ${resolved} (해소됨).` : "모든 신호 정상.";
}

function formatResolvedIncident(lastIncident?: HealthLastIncident | null): string | null {
  if (!lastIncident) return null;
  const when = formatHealthTimestamp(lastIncident.at);
  if (!when) return null;
  return `${when} · ${lastIncident.title}`;
}

export function healthFailedSources(cards: readonly HealthCard[]): HealthFailedSource[] {
  return cards
    .filter((card) => healthCardEvidenceState(card) === "unavailable")
    .map((card) => ({
      id: card.id,
      label: card.title,
      available: false as const,
      detail: card.reason ?? "확인 불가",
    }));
}

function formatAge(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  if (minutes === 0) return `${remainingSeconds}초`;
  if (remainingSeconds === 0) return `${minutes}분`;
  return `${minutes}분 ${remainingSeconds}초`;
}
