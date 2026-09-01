import type { KeyboardEvent } from "react";
import { ADMIN_COPY } from "@/features/platform-admin/model/admin-copy";
import {
  buildAnalyticsKpiDecisionView,
  formatAnalyticsGeneratedAt,
  formatSeriesPointValue,
  labelKpi,
  labelWindow,
  type AdminAnalyticsBenchmarkRow,
  type AdminAnalyticsKpiCard,
  type AdminAnalyticsKpiSeries,
  type AdminAnalyticsOverview,
  type AnalyticsWindow,
} from "@/features/platform-admin/model/platform-admin-analytics-model";
import { AdminPageContext } from "./admin-page-context";
import { AdminStatePanel } from "./admin-state-panel";
import "./admin-processing-records.css";

export type AdminAnalyticsOverviewViewProps = {
  overview: AdminAnalyticsOverview | null;
  window: AnalyticsWindow;
  loading: boolean;
  error: string | null;
  onWindowChange: (window: AnalyticsWindow) => void;
  exportStatus: "idle" | "pending" | "success" | "error";
  canView?: boolean;
  canExport?: boolean;
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
  canView = true,
  canExport = false,
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
    <div className="admin-analytics">
      <AdminPageContext
        eyebrow={ADMIN_COPY.eyebrow.ledger}
        heading={ADMIN_COPY.heading.analytics}
        description="처리 기록을 해석할 때 참고하는 집계입니다."
        freshness={overview ? (
          <time dateTime={overview.generatedAt}>{formatAnalyticsGeneratedAt(overview.generatedAt)}</time>
        ) : null}
        action={
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
        }
      >
        {error ? (
          <AdminStatePanel state="unavailable" description={error} />
        ) : null}
        {loading && !overview ? <AdminStatePanel state="loading" /> : null}
        {!canView ? (
          <AdminStatePanel
            state="forbidden"
            title="권한이 없습니다"
            description="현재 권한으로는 분석을 볼 수 없습니다."
          />
        ) : null}

        {canView && overview ? (
          <>
            <div className="admin-analytics__actions">
              {canExport ? (
                <button
                  type="button"
                  className="admin-analytics__export"
                  disabled={exportStatus === "pending"}
                  onClick={onExport}
                >
                  {exportStatus === "pending" ? "CSV 내려받는 중" : "CSV 내려받기"}
                </button>
              ) : (
                <p className="admin-analytics__export-denied">현재 권한으로는 CSV를 내려받을 수 없습니다.</p>
              )}
              {exportStatus === "success" ? <p className="admin-analytics__export-status" role="status">CSV 파일을 내려받았습니다.</p> : null}
              {exportStatus === "error" ? <p className="admin-analytics__export-error" role="alert">CSV 파일을 만들지 못했습니다. 다시 시도해 주세요.</p> : null}
            </div>
            <section className="admin-analytics__criteria" aria-labelledby="admin-analytics-criteria-heading">
              <div className="admin-analytics__section-heading">
                <div>
                  <p className="admin-analytics__section-eyebrow">수치를 읽기 전에</p>
                  <h2 id="admin-analytics-criteria-heading">판단 기준</h2>
                </div>
                <p>정의와 측정 가능 여부를 먼저 확인하고, 값은 기간 비교의 근거로 사용하세요.</p>
              </div>
              <ol className="admin-analytics__criteria-list" aria-label="분석 판단 기준">
                {overview.kpis.map((card) => (
                  <AdminAnalyticsKpiCriterion key={card.key} card={card} />
                ))}
              </ol>
            </section>
            <AdminAnalyticsSeriesTable series={overview.series} />
            <AdminAnalyticsBenchmarkTable benchmark={overview.clubBenchmark} />
          </>
        ) : null}
      </AdminPageContext>
    </div>
  );
}

function AdminAnalyticsKpiCriterion({ card }: { card: AdminAnalyticsKpiCard }) {
  const item = buildAnalyticsKpiDecisionView(card);
  return (
    <li className="admin-analytics__criterion" aria-label={item.label}>
      <div className="admin-analytics__criterion-context">
        <h3>{item.label}</h3>
        <p className="admin-analytics__criterion-definition">{item.definition}</p>
        <p className="admin-analytics__criterion-availability">측정 상태 · {item.availability}</p>
      </div>
      <div className="admin-analytics__criterion-result">
        {item.value ? <strong className="admin-analytics__criterion-value">{item.value}</strong> : null}
        <span className="admin-analytics__criterion-comparison ledger-number">{item.comparison}</span>
      </div>
      <a className="admin-analytics__criterion-action small" href={item.action.href}>
        {item.action.label}
      </a>
    </li>
  );
}

function AdminAnalyticsSeriesTable({ series }: { series: AdminAnalyticsKpiSeries[] }) {
  if (series.length === 0 || series.every((item) => item.points.length === 0)) {
    return <p className="admin-analytics__benchmark-empty">기간별 변화를 만들 충분한 데이터가 없습니다.</p>;
  }

  const bucketStarts = [...new Set(series.flatMap((item) => item.points.map((point) => point.bucketStart)))].sort();

  return (
    <section className="admin-analytics__trend" aria-labelledby="admin-analytics-trends-heading">
      <h2 id="admin-analytics-trends-heading">기간별 변화</h2>
      <div className="admin-analytics__trend-scroll">
        <table className="admin-analytics__trend-table" aria-label="기간별 변화">
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
                    <td key={bucketStart} className="ledger-number">
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
    return (
      <section className="admin-analytics__comparison" aria-labelledby="admin-analytics-comparison-heading">
        <h2 id="admin-analytics-comparison-heading">클럽별 비교</h2>
        <p className="admin-analytics__benchmark-empty">클럽 비교에 충분한 데이터가 없습니다.</p>
      </section>
    );
  }
  return (
    <section className="admin-analytics__comparison" aria-labelledby="admin-analytics-comparison-heading">
      <h2 id="admin-analytics-comparison-heading">클럽별 비교</h2>
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
    </section>
  );
}

function AdminAnalyticsBenchmarkRowView({ row }: { row: AdminAnalyticsBenchmarkRow }) {
  return (
    <tr>
      <th scope="row">{row.name}</th>
      <td className="ledger-number" data-label="활성 멤버">{row.activeMembers}</td>
      <td className="ledger-number" data-label="모임 완료율">{percentOrDash(row.sessionCompletionRate)}</td>
      <td className="ledger-number" data-label="참석 응답률">{percentOrDash(row.rsvpRate)}</td>
      <td className="ledger-number" data-label="AI 비용">${row.aiCostUsd}</td>
      <td className="ledger-number" data-label="알림 도달률">{percentOrDash(row.notificationDeliveryRate)}</td>
    </tr>
  );
}

function percentOrDash(value: number | null): string {
  return value === null ? "—" : `${value}%`;
}
