import type { KeyboardEvent } from "react";
import {
  analyticsActionForKpi,
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
  exportStatus: "idle" | "pending" | "success" | "error";
  onExport: () => void;
};

const WINDOWS: AnalyticsWindow[] = ["7d", "30d", "90d"];

export function AdminAnalyticsOverviewView({
  overview,
  window,
  loading,
  error,
  onWindowChange,
  exportStatus,
  onExport,
}: AdminAnalyticsOverviewViewProps) {
  function handleWindowKeyDown(event: KeyboardEvent<HTMLButtonElement>, value: AnalyticsWindow) {
    const index = WINDOWS.indexOf(value);
    if (event.key === "ArrowRight") {
      event.preventDefault();
      onWindowChange(WINDOWS[(index + 1) % WINDOWS.length]);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      onWindowChange(WINDOWS[(index - 1 + WINDOWS.length) % WINDOWS.length]);
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      onWindowChange(event.key === "Home" ? WINDOWS[0] : WINDOWS[WINDOWS.length - 1]);
    }
  }

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
              onKeyDown={(event) => handleWindowKeyDown(event, value)}
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
            <button
              type="button"
              className="admin-analytics__export"
              disabled={exportStatus === "pending"}
              onClick={onExport}
            >
              {exportStatus === "pending" ? "CSV 내려받는 중" : "CSV 내려받기"}
            </button>
            {exportStatus === "success" ? <p className="admin-analytics__export-status" role="status">CSV 파일을 내려받았습니다.</p> : null}
            {exportStatus === "error" ? <p className="admin-analytics__export-error" role="alert">CSV 파일을 만들지 못했습니다. 다시 시도해 주세요.</p> : null}
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
      <span className="admin-analytics__kpi-label">{card.label || labelKpi(card.key)}</span>
      {card.definition ? <span className="admin-analytics__kpi-definition">{card.definition}</span> : null}
      <span className="admin-analytics__kpi-value">{formatKpiValue(card)}</span>
      <span className="admin-analytics__kpi-delta">{deltaLabel(card)}</span>
      <a className="admin-analytics__kpi-action small" href={action.href}>
        {action.label}
      </a>
    </li>
  );
}

function AdminAnalyticsSeriesTable({ series }: { series: AdminAnalyticsKpiSeries[] }) {
  if (series.length === 0 || series.every((item) => item.points.length === 0)) {
    return <p className="admin-analytics__benchmark-empty">KPI 추세를 만들 충분한 데이터가 없습니다.</p>;
  }

  const bucketStarts = [...new Set(series.flatMap((item) => item.points.map((point) => point.bucketStart)))].sort();

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
    <div className="admin-analytics__benchmark-scroll">
      <table className="admin-analytics__benchmark" aria-label="클럽 비교">
        <thead>
          <tr>
            <th scope="col">클럽</th>
            <th scope="col">활성 멤버</th>
            <th scope="col">모임 완료율</th>
            <th scope="col">참석 응답률</th>
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
    </div>
  );
}

function AdminAnalyticsBenchmarkRowView({ row }: { row: AdminAnalyticsBenchmarkRow }) {
  return (
    <tr>
      <th scope="row">{row.name}</th>
      <td data-label="활성 멤버">{row.activeMembers}</td>
      <td data-label="모임 완료율">{percentOrDash(row.sessionCompletionRate)}</td>
      <td data-label="참석 응답률">{percentOrDash(row.rsvpRate)}</td>
      <td data-label="AI 비용">${row.aiCostUsd}</td>
      <td data-label="알림 도달률">{percentOrDash(row.notificationDeliveryRate)}</td>
    </tr>
  );
}

function percentOrDash(value: number | null): string {
  return value === null ? "—" : `${value}%`;
}
