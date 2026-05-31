import {
  analyticsActionForKpi,
  analyticsCsvFilename,
  analyticsCsvHref,
  deltaLabel,
  formatKpiValue,
  formatSeriesPointValue,
  labelKpi,
  labelWindow,
  type AdminAnalyticsBenchmarkRow,
  type AdminAnalyticsKpiCard,
  type AdminAnalyticsKpiSeries,
  type AdminAnalyticsOverview,
  type AnalyticsWindow,
} from "@/features/platform-admin/model/platform-admin-analytics-model";

export type AdminAnalyticsOverviewViewProps = {
  overview: AdminAnalyticsOverview | null;
  window: AnalyticsWindow;
  loading: boolean;
  error: string | null;
  onWindowChange: (window: AnalyticsWindow) => void;
};

const WINDOWS: AnalyticsWindow[] = ["7d", "30d", "90d"];

export function AdminAnalyticsOverviewView({
  overview,
  window,
  loading,
  error,
  onWindowChange,
}: AdminAnalyticsOverviewViewProps) {
  return (
    <section className="admin-analytics" aria-labelledby="admin-analytics-heading">
      <header className="admin-analytics__header">
        <h1 id="admin-analytics-heading">분석</h1>
        <div className="admin-analytics__windows" role="group" aria-label="분석 기간 선택">
          {WINDOWS.map((value) => (
            <button
              key={value}
              type="button"
              className="admin-analytics__window"
              aria-pressed={value === window}
              onClick={() => onWindowChange(value)}
            >
              {labelWindow(value)}
            </button>
          ))}
        </div>
      </header>

      {error ? <p className="admin-analytics__error" role="alert">{error}</p> : null}
      {loading && !overview ? <p className="admin-analytics__loading">분석 데이터를 불러오는 중…</p> : null}

      {overview ? (
        <>
          <div className="admin-analytics__actions">
            <a
              className="admin-analytics__export"
              href={analyticsCsvHref(overview)}
              download={analyticsCsvFilename(overview)}
            >
              CSV 내려받기
            </a>
          </div>
          <ul className="admin-analytics__kpis" aria-label="핵심 지표">
            {overview.kpis.map((card) => (
              <AdminAnalyticsKpiTile key={card.key} card={card} />
            ))}
          </ul>
          <AdminAnalyticsSeriesTable series={overview.series} />
          <AdminAnalyticsBenchmarkTable benchmark={overview.clubBenchmark} />
        </>
      ) : null}
    </section>
  );
}

function AdminAnalyticsKpiTile({ card }: { card: AdminAnalyticsKpiCard }) {
  const unavailable = card.availability !== "AVAILABLE";
  const action = analyticsActionForKpi(card.key);
  return (
    <li className={`admin-analytics__kpi${unavailable ? " admin-analytics__kpi--empty" : ""}`}>
      <span className="admin-analytics__kpi-label">{labelKpi(card.key)}</span>
      <span className="admin-analytics__kpi-value">{formatKpiValue(card)}</span>
      <span className="admin-analytics__kpi-delta">{deltaLabel(card)}</span>
      <a className="admin-analytics__kpi-action" href={action.href}>
        {action.label}
      </a>
    </li>
  );
}

function AdminAnalyticsSeriesTable({ series }: { series: AdminAnalyticsKpiSeries[] }) {
  if (series.length === 0 || series.every((item) => item.points.length === 0)) {
    return <p className="admin-analytics__benchmark-empty">KPI 추세를 만들 충분한 데이터가 없습니다.</p>;
  }

  const bucketStarts = series[0]?.points.map((point) => point.bucketStart) ?? [];

  return (
    <section className="admin-analytics__trend" aria-labelledby="admin-analytics-trends-heading">
      <h2 id="admin-analytics-trends-heading">KPI 추세</h2>
      <div className="admin-analytics__trend-scroll">
        <table className="admin-analytics__trend-table" aria-label="KPI 추세">
          <thead>
            <tr>
              <th scope="col">지표</th>
              {bucketStarts.map((bucketStart) => (
                <th key={bucketStart} scope="col">
                  {bucketStart}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {series.map((item) => (
              <tr key={item.key}>
                <th scope="row">{labelKpi(item.key)}</th>
                {bucketStarts.map((bucketStart) => {
                  const point = item.points.find((candidate) => candidate.bucketStart === bucketStart);
                  return (
                    <td key={bucketStart}>
                      {point ? formatSeriesPointValue(point, item.unit) : "데이터 부족"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function AdminAnalyticsBenchmarkTable({
  benchmark,
}: {
  benchmark: AdminAnalyticsOverview["clubBenchmark"];
}) {
  if (benchmark.availability === "NOT_ENOUGH_DATA" || benchmark.rows.length === 0) {
    return <p className="admin-analytics__benchmark-empty">클럽 비교에 충분한 데이터가 없습니다.</p>;
  }
  return (
    <table className="admin-analytics__benchmark" aria-label="클럽 비교">
      <thead>
        <tr>
          <th scope="col">클럽</th>
          <th scope="col">활성 멤버</th>
          <th scope="col">세션 완료율</th>
          <th scope="col">RSVP 응답률</th>
          <th scope="col">AI 비용</th>
          <th scope="col">알림 도달률</th>
        </tr>
      </thead>
      <tbody>
        {benchmark.rows.map((row) => (
          <AdminAnalyticsBenchmarkRowView key={row.clubId} row={row} />
        ))}
      </tbody>
    </table>
  );
}

function AdminAnalyticsBenchmarkRowView({ row }: { row: AdminAnalyticsBenchmarkRow }) {
  return (
    <tr>
      <th scope="row">{row.name}</th>
      <td>{row.activeMembers}</td>
      <td>{percentOrDash(row.sessionCompletionRate)}</td>
      <td>{percentOrDash(row.rsvpRate)}</td>
      <td>${row.aiCostUsd}</td>
      <td>{percentOrDash(row.notificationDeliveryRate)}</td>
    </tr>
  );
}

function percentOrDash(value: number | null): string {
  return value === null ? "—" : `${value}%`;
}
