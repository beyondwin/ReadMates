export type AnalyticsWindow = "7d" | "30d" | "90d";
export type KpiKey =
  | "ACTIVE_MEMBERS"
  | "SESSION_COMPLETION"
  | "RSVP_RATE"
  | "AI_COST_PER_SESSION"
  | "NOTIFICATION_DELIVERY";
export type KpiUnit = "COUNT" | "PERCENT" | "USD";
export type Availability = "AVAILABLE" | "NOT_ENOUGH_DATA" | "MEASUREMENT_UNAVAILABLE";
export type DeltaDirection = "UP" | "DOWN" | "FLAT" | "NONE";

export type AdminAnalyticsKpiCard = {
  key: KpiKey;
  label: string;
  definition: string;
  unit: KpiUnit;
  availability: Availability;
  current: number | null;
  prior: number | null;
  delta: number | null;
  deltaDirection: DeltaDirection;
};

export type AdminAnalyticsKpiSeriesPoint = {
  bucketStart: string;
  availability: Availability;
  value: number | null;
};

export type AdminAnalyticsKpiSeries = {
  key: KpiKey;
  unit: KpiUnit;
  points: AdminAnalyticsKpiSeriesPoint[];
};

export type AdminAnalyticsBenchmarkRow = {
  clubId: string;
  slug: string;
  name: string;
  activeMembers: number;
  sessionCompletionRate: number | null;
  rsvpRate: number | null;
  aiCostUsd: string;
  notificationDeliveryRate: number | null;
};

export type AdminAnalyticsBenchmark = {
  availability: Availability;
  rows: AdminAnalyticsBenchmarkRow[];
};

export type AdminAnalyticsOverview = {
  schema: "admin.analytics_overview.v2";
  generatedAt: string;
  window: AnalyticsWindow;
  kpis: AdminAnalyticsKpiCard[];
  clubBenchmark: AdminAnalyticsBenchmark;
  series: AdminAnalyticsKpiSeries[];
};

const WINDOWS: AnalyticsWindow[] = ["7d", "30d", "90d"];
const DEFAULT_WINDOW: AnalyticsWindow = "30d";

export function analyticsWindowFromSearchParams(params: URLSearchParams): AnalyticsWindow {
  const raw = params.get("window");
  return WINDOWS.includes(raw as AnalyticsWindow) ? (raw as AnalyticsWindow) : DEFAULT_WINDOW;
}

export function analyticsSearchFromWindow(window: AnalyticsWindow): URLSearchParams {
  const params = new URLSearchParams();
  params.set("window", window);
  return params;
}

const KPI_LABELS: Record<KpiKey, string> = {
  ACTIVE_MEMBERS: "활성 멤버",
  SESSION_COMPLETION: "모임 완료율",
  RSVP_RATE: "참석 응답률",
  AI_COST_PER_SESSION: "AI 비용/모임",
  NOTIFICATION_DELIVERY: "알림 도달률",
};

export function labelKpi(key: KpiKey): string {
  return KPI_LABELS[key];
}

const WINDOW_LABELS: Record<AnalyticsWindow, string> = {
  "7d": "최근 7일",
  "30d": "최근 30일",
  "90d": "최근 90일",
};

export function labelWindow(window: AnalyticsWindow): string {
  return WINDOW_LABELS[window];
}

export type AnalyticsKpiAction = {
  label: string;
  href: string;
};

export type AnalyticsKpiDecisionView = {
  key: KpiKey;
  label: string;
  definition: string;
  availability: string;
  value: string | null;
  comparison: string;
  action: AnalyticsKpiAction;
};

const KPI_ACTIONS: Record<KpiKey, AnalyticsKpiAction> = {
  ACTIVE_MEMBERS: { label: "클럽 운영 보기", href: "/admin/clubs" },
  SESSION_COMPLETION: { label: "클럽 운영 보기", href: "/admin/clubs" },
  RSVP_RATE: { label: "클럽 운영 보기", href: "/admin/clubs" },
  AI_COST_PER_SESSION: { label: "AI 작업 보기", href: "/admin/ai-ops" },
  NOTIFICATION_DELIVERY: { label: "알림 운영 보기", href: "/admin/notifications" },
};

export function analyticsActionForKpi(key: KpiKey): AnalyticsKpiAction {
  return KPI_ACTIONS[key];
}

export function buildAnalyticsKpiDecisionView(
  card: AdminAnalyticsKpiCard,
): AnalyticsKpiDecisionView {
  return {
    key: card.key,
    label: card.label.trim() || labelKpi(card.key),
    definition: card.definition.trim() || "집계 기준을 확인할 수 없습니다.",
    availability: formatAvailabilityLabel(card.availability),
    value: card.availability === "AVAILABLE" && card.current !== null
      ? formatKpiValue(card)
      : null,
    comparison: deltaLabel(card),
    action: analyticsActionForKpi(card.key),
  };
}

export function formatAvailabilityLabel(availability: Availability): string {
  switch (availability) {
    case "AVAILABLE":
      return "측정됨";
    case "NOT_ENOUGH_DATA":
      return "데이터 부족";
    case "MEASUREMENT_UNAVAILABLE":
      return "측정 불가";
  }
}

export function formatKpiValue(card: AdminAnalyticsKpiCard): string {
  if (card.availability !== "AVAILABLE" || card.current === null) {
    return formatAvailabilityLabel(card.availability);
  }
  switch (card.unit) {
    case "PERCENT":
      return `${card.current}%`;
    case "USD":
      return `$${card.current.toFixed(4)}`;
    case "COUNT":
      return `${card.current}`;
  }
}

export function formatSeriesPointValue(point: AdminAnalyticsKpiSeriesPoint, unit: KpiUnit): string {
  if (point.availability !== "AVAILABLE" || point.value === null) {
    return formatAvailabilityLabel(point.availability);
  }
  switch (unit) {
    case "PERCENT":
      return `${point.value}%`;
    case "USD":
      return `$${point.value.toFixed(4)}`;
    case "COUNT":
      return `${point.value}`;
  }
}

export function deltaLabel(card: AdminAnalyticsKpiCard): string {
  if (card.deltaDirection === "NONE" || card.delta === null) {
    return "이전 구간 대비 비교 불가";
  }
  const arrow = card.deltaDirection === "UP" ? "▲" : card.deltaDirection === "DOWN" ? "▼" : "→";
  const sign = card.delta > 0 ? "+" : "";
  return `${arrow} ${sign}${card.delta} (이전 구간 대비)`;
}

const ANALYTICS_SEOUL_TIMESTAMP = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function formatAnalyticsGeneratedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "집계 시각 확인 필요";
  const parts = new Map(
    ANALYTICS_SEOUL_TIMESTAMP.formatToParts(date).map((part) => [part.type, part.value]),
  );
  return `${parts.get("year")}. ${parts.get("month")}. ${parts.get("day")}. ${parts.get("hour")}:${parts.get("minute")} 기준`;
}
