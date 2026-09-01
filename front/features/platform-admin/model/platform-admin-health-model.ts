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

export const HEALTH_CARD_IDS = [
  "db_pool",
  "redis",
  "kafka_consumer_lag",
  "outbox_backlog",
  "notification_dispatch_success",
  "ai_provider_availability",
  "outbound-resilience",
  "deploy_attempts_strip",
] as const;

export type KnownHealthCardId = (typeof HEALTH_CARD_IDS)[number];

export const HEALTH_PAGE_HEADING = "서비스 건강";
export const HEALTH_PAGE_DESCRIPTION =
  "서비스의 현재 상태와 다음 확인 항목을 한곳에서 봅니다.";
export const HEALTH_OK_SIGNALS_LABEL = "정상 범위 서비스";
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

export type HealthCardOperatorView = {
  knownSource: boolean;
  label: string;
  evidence: HealthEvidenceState;
  stateSentence: string;
  reason: string;
  impact: string | null;
  nextAction: string | null;
};

type HealthSourceGuidance = {
  label: string;
  impact: string;
  nextAction: string;
};

const HEALTH_SOURCE_GUIDANCE: Record<KnownHealthCardId, HealthSourceGuidance> = {
  db_pool: {
    label: "데이터베이스 연결",
    impact: "서비스 요청 처리가 대기할 수 있습니다.",
    nextAction: "연결 대기가 줄어드는지 새로 확인하세요.",
  },
  redis: {
    label: "Redis",
    impact: "임시 저장 기능을 쓰는 작업이 느려지거나 제한될 수 있습니다.",
    nextAction: "오류 수가 더 늘어나는지 새로 확인하세요.",
  },
  kafka_consumer_lag: {
    label: "AI 작업 대기열",
    impact: "AI 작업 전달이 늦어질 수 있습니다.",
    nextAction: "대기량이 줄어드는지 새로 확인하세요.",
  },
  outbox_backlog: {
    label: "알림 대기열",
    impact: "알림 처리가 늦어질 수 있습니다.",
    nextAction: "알림 상태에서 대기 항목을 확인하세요.",
  },
  notification_dispatch_success: {
    label: "알림 전송",
    impact: "일부 알림이 늦게 도착할 수 있습니다.",
    nextAction: "알림 상태에서 전송 결과를 확인하세요.",
  },
  ai_provider_availability: {
    label: "AI 제공자",
    impact: "AI 요약 작업이 늦어지거나 실패할 수 있습니다.",
    nextAction: "AI 작업에서 제공자 상태를 확인하세요.",
  },
  "outbound-resilience": {
    label: "외부 연결 보호",
    impact: "외부 서비스와 연결하는 작업이 멈출 수 있습니다.",
    nextAction: "차단된 연결이 닫히는지 새로 확인하세요.",
  },
  deploy_attempts_strip: {
    label: "배포 기록",
    impact: "최근 변경의 적용 상태를 확인하기 어렵습니다.",
    nextAction: "배포 기록을 다시 확인하세요.",
  },
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

export function isNoDataHealthReason(reason: string | null): boolean {
  return reason === "no_data";
}

export function isKnownHealthCardId(id: string): id is KnownHealthCardId {
  return Object.prototype.hasOwnProperty.call(HEALTH_SOURCE_GUIDANCE, id);
}

export function healthCardEvidenceState(card: HealthCard): HealthEvidenceState {
  if (!isKnownHealthCardId(card.id)) return "unavailable";
  if (isDisabledHealthReason(card.reason)) return "disabled";
  if (isNoDataHealthReason(card.reason)) return "empty";
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

export function healthStatusSentence(status: HealthCardStatus): string {
  switch (status) {
    case "OK":
      return "현재 정상 범위입니다.";
    case "WARN":
      return "주의해서 살펴봐야 합니다.";
    case "CRIT":
      return "지금 확인이 필요합니다.";
    case "UNKNOWN":
      return "상태를 확인할 수 없습니다";
  }
}

export function healthCardOperatorView(card: HealthCard): HealthCardOperatorView {
  const evidence = healthCardEvidenceState(card);
  if (!isKnownHealthCardId(card.id)) {
    return {
      knownSource: false,
      label: "알 수 없는 서비스",
      evidence: "unavailable",
      stateSentence: "상태를 확인할 수 없습니다",
      reason: "등록되지 않은 상태 원천입니다.",
      impact: null,
      nextAction: null,
    };
  }

  const guidance = HEALTH_SOURCE_GUIDANCE[card.id];
  return {
    knownSource: true,
    label: guidance.label,
    evidence,
    stateSentence: healthEvidenceSentence(evidence, card.status),
    reason: healthReasonSentence(evidence),
    impact: guidance.impact,
    nextAction: guidance.nextAction,
  };
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
  if (card.drill.target.startsWith("/admin/notifications")) return "알림 상태 열기";
  if (card.drill.target.startsWith("/admin/ai-ops")) return "AI 작업 열기";
  return "관련 상태 열기";
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
      return "현재 자료로 확인했습니다.";
    case "REFRESHING":
      return "새 상태를 확인하고 있습니다.";
    case "STALE":
      return `마지막 확인 자료가 ${formatAge(snapshot.staleAgeSeconds)} 전입니다.`;
    case "UNAVAILABLE":
      return "최근 상태 자료를 확인할 수 없습니다.";
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
  refreshState: PlatformHealthRefreshState = "FRESH",
): string {
  const { deviations } = partitionHealthServiceCards(cards);
  const summary = healthPageSummary(deviations, cards, refreshState);
  const resolved = formatResolvedIncident(lastIncident);
  return resolved && deviations.length === 0 && refreshState === "FRESH"
    ? `${summary} 마지막 이상은 ${resolved} (해소됨).`
    : summary;
}

function healthPageSummary(
  deviations: readonly HealthCard[],
  cards: readonly HealthCard[],
  refreshState: PlatformHealthRefreshState,
): string {
  if (refreshState === "UNAVAILABLE") {
    return "최근 상태 자료를 확인할 수 없어 정상 여부를 확정할 수 없습니다.";
  }
  if (refreshState === "STALE" && deviations.length === 0) {
    return "현재 확인된 서비스는 정상 범위지만 자료가 오래되었습니다.";
  }

  const evidence = deviations.map(healthCardEvidenceState);
  const prefix = evidence.includes("crit")
    ? `지금 확인이 필요한 서비스가 ${evidence.filter((state) => state === "crit").length}곳 있습니다.`
    : evidence.includes("warn")
      ? `주의해서 살펴볼 서비스가 ${evidence.filter((state) => state === "warn").length}곳 있습니다.`
      : evidence.includes("unavailable")
        ? "일부 서비스 상태를 확인할 수 없습니다."
        : evidence.includes("empty")
          ? "일부 서비스는 아직 판단할 자료가 없습니다."
          : evidence.includes("disabled") && cards.every((card) => healthCardEvidenceState(card) === "disabled")
            ? "현재 사용 중인 상태 원천이 없습니다."
            : "모든 서비스가 정상 범위입니다.";

  const freshness = refreshState === "REFRESHING"
    ? "새 상태를 확인하고 있습니다."
    : "현재 자료로 확인했습니다.";
  return `${prefix} ${freshness}`;
}

function healthEvidenceSentence(
  evidence: HealthEvidenceState,
  status: HealthCardStatus,
): string {
  switch (evidence) {
    case "disabled":
      return "현재 운영 설정에서 사용하지 않습니다.";
    case "empty":
      return "아직 판단할 자료가 없습니다.";
    case "unavailable":
      return "상태를 확인할 수 없습니다";
    case "ok":
    case "warn":
    case "crit":
      return healthStatusSentence(status);
  }
}

function healthReasonSentence(evidence: HealthEvidenceState): string {
  switch (evidence) {
    case "ok":
      return "관측값이 정상 범위에 있습니다.";
    case "warn":
      return "관측값이 주의 범위에 들어왔습니다.";
    case "crit":
      return "관측값이 위험 범위에 들어왔습니다.";
    case "unavailable":
      return "원천에서 상태 자료를 받지 못했습니다.";
    case "disabled":
      return "현재 운영 설정에서 사용하지 않는 원천입니다.";
    case "empty":
      return "원천에 아직 판단할 관측 자료가 없습니다.";
  }
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
    .map((card) => {
      const view = healthCardOperatorView(card);
      return {
        id: card.id,
        label: view.label,
        available: false as const,
        detail: view.stateSentence,
      };
    });
}

function formatAge(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  if (minutes === 0) return `${remainingSeconds}초`;
  if (remainingSeconds === 0) return `${minutes}분`;
  return `${minutes}분 ${remainingSeconds}초`;
}
