export type AnalyticsWindow = "7d" | "30d" | "90d";
export type KpiKey =
  | "ACTIVE_MEMBERS"
  | "SESSION_COMPLETION"
  | "RSVP_RATE"
  | "AI_COST_PER_SESSION"
  | "NOTIFICATION_DELIVERY";
export type KpiUnit = "COUNT" | "PERCENT" | "USD";
export type Availability = "AVAILABLE" | "NOT_ENOUGH_DATA";
export type DeltaDirection = "UP" | "DOWN" | "FLAT" | "NONE";

export type AdminAnalyticsKpiCard = {
  key: KpiKey;
  unit: KpiUnit;
  availability: Availability;
  current: number | null;
  prior: number | null;
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
  schema: "admin.analytics_overview.v1";
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
  SESSION_COMPLETION: "세션 완료율",
  RSVP_RATE: "RSVP 응답률",
  AI_COST_PER_SESSION: "AI 비용/세션",
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

export function formatKpiValue(card: AdminAnalyticsKpiCard): string {
  if (card.availability === "NOT_ENOUGH_DATA" || card.current === null) {
    return "데이터 부족";
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
  if (point.availability === "NOT_ENOUGH_DATA" || point.value === null) {
    return "데이터 부족";
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

export function analyticsCsvFilename(overview: AdminAnalyticsOverview): string {
  const date = overview.generatedAt.slice(0, 10);
  return `readmates-admin-analytics-${overview.window}-${date}.csv`;
}

export function analyticsCsvHref(overview: AdminAnalyticsOverview): string {
  return `data:text/csv;charset=utf-8,${encodeURIComponent(buildAnalyticsCsv(overview))}`;
}

export function buildAnalyticsCsv(overview: AdminAnalyticsOverview): string {
  const rows = [
    ["section", "window", "kpi", "bucketStart", "value", "availability", "clubSlug", "clubName"],
  ];

  for (const series of overview.series) {
    for (const point of series.points) {
      rows.push([
        "series",
        overview.window,
        labelKpi(series.key),
        point.bucketStart,
        formatSeriesPointValue(point, series.unit),
        point.availability,
        "",
        "",
      ]);
    }
  }

  for (const row of overview.clubBenchmark.rows) {
    rows.push([
      "benchmark",
      overview.window,
      "",
      "",
      "",
      overview.clubBenchmark.availability,
      row.slug,
      row.name,
    ]);
  }

  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}

function csvCell(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replaceAll("\"", "\"\"")}"`;
  }
  return value;
}

export function deltaLabel(card: AdminAnalyticsKpiCard): string {
  if (card.deltaDirection === "NONE" || card.current === null || card.prior === null) {
    return "이전 구간 대비 비교 불가";
  }
  const diff = Math.round((card.current - card.prior) * 10000) / 10000;
  const arrow = card.deltaDirection === "UP" ? "▲" : card.deltaDirection === "DOWN" ? "▼" : "→";
  const sign = diff > 0 ? "+" : "";
  return `${arrow} ${sign}${diff} (이전 구간 대비)`;
}
