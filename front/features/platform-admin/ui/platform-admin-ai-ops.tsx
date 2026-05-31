export type PlatformAdminAiOpsRole = "OWNER" | "OPERATOR" | "SUPPORT";

export type PlatformAdminAiOpsSummaryView = {
  activeJobCount: number;
  failedLast24h: number;
  monthToDateCostEstimateUsd: string;
  failureCodes: Array<{ code: string; count: number }>;
  providerCosts: Array<{ provider: string; model: string; costEstimateUsd: string }>;
  staleCandidateCount: number;
  costTrend: {
    window: "7d" | "30d" | "90d";
    currentCostUsd: string;
    priorCostUsd: string;
    currentJobCount: number;
    priorJobCount: number;
    deltaDirection: "UP" | "DOWN" | "FLAT" | "NONE";
    availability: "AVAILABLE" | "NOT_ENOUGH_DATA";
  };
};

export type PlatformAdminAiOpsJobView = {
  jobId: string;
  club: { clubId: string; slug: string | null; name: string | null };
  session: { sessionId: string; number: number | null; bookTitle: string | null };
  status: string;
  stage: string | null;
  provider: string;
  model: string;
  errorCode: string | null;
  safeErrorMessage: string | null;
  costEstimateUsd: string;
  createdAt: string;
  lastUpdatedAt: string;
  expiresAt: string | null;
  staleCandidate: boolean;
  availableActions: string[];
};

type PlatformAdminAiOpsProps = {
  role: PlatformAdminAiOpsRole;
  summary: PlatformAdminAiOpsSummaryView | null;
  jobs: PlatformAdminAiOpsJobView[];
  loading?: boolean;
  error?: string | null;
  onForceCancel?: (jobId: string) => void;
  onRetryCommit?: (jobId: string) => void;
  activeFilter?: { errorCode: string | null; clubId: string | null };
  onSelectFailureCode?: (code: string) => void;
  onClearFilter?: () => void;
  window?: "7d" | "30d" | "90d";
  onSelectWindow?: (window: "7d" | "30d" | "90d") => void;
};

export function PlatformAdminAiOps({
  role,
  summary,
  jobs,
  loading = false,
  error = null,
  onForceCancel,
  onRetryCommit,
  activeFilter,
  onSelectFailureCode,
  onClearFilter,
  window,
  onSelectWindow,
}: PlatformAdminAiOpsProps) {
  const canAct = role === "OWNER" || role === "OPERATOR";
  const filterActive = Boolean(activeFilter?.errorCode || activeFilter?.clubId);

  return (
    <section className="platform-admin-ai-ops" aria-labelledby="platform-admin-ai-ops-title">
      <div className="platform-admin-ai-ops__header">
        <div>
          <p className="eyebrow">AI Ops</p>
          <h2 id="platform-admin-ai-ops-title" className="h3 editorial">
            AI 운영
          </h2>
        </div>
        {loading ? <span className="platform-admin-domain-status">동기화 중</span> : null}
      </div>

      {error ? (
        <p className="platform-admin-ai-ops__error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="platform-admin-ai-ops__metrics">
        <Metric label="Active" value={String(summary?.activeJobCount ?? 0)} />
        <Metric label="Failed 24h" value={String(summary?.failedLast24h ?? 0)} />
        <Metric label="Cost MTD" value={`$${summary?.monthToDateCostEstimateUsd ?? "0.0000"}`} />
        <Metric label="Stale" value={String(summary?.staleCandidateCount ?? 0)} />
      </div>

      <div className="platform-admin-ai-ops__trend" aria-label="cost trend">
        <div className="platform-admin-ai-ops__window" role="group" aria-label="cost window">
          {(["7d", "30d", "90d"] as const).map((w) => (
            <button
              key={w}
              type="button"
              className="btn btn-quiet btn-sm"
              aria-pressed={(window ?? summary?.costTrend.window) === w}
              onClick={() => onSelectWindow?.(w)}
            >
              {w}
            </button>
          ))}
        </div>
        {summary && summary.costTrend.availability === "NOT_ENOUGH_DATA" ? (
          <p className="small" style={{ color: "var(--text-3)" }}>데이터 부족</p>
        ) : (
          <p className="small">
            <span>${summary?.costTrend.currentCostUsd ?? "0.0000"}</span>{" "}
            <span aria-label="cost trend direction">{directionGlyph(summary?.costTrend.deltaDirection)}</span>{" "}
            <span style={{ color: "var(--text-3)" }}>직전 ${summary?.costTrend.priorCostUsd ?? "0.0000"}</span>
          </p>
        )}
      </div>

      <div className="platform-admin-ai-ops__sidecars">
        <FailureCodeList
          items={summary?.failureCodes ?? []}
          activeCode={activeFilter?.errorCode ?? null}
          onSelect={onSelectFailureCode}
        />
        <SmallList
          title="Provider cost"
          items={(summary?.providerCosts ?? []).map((item) => `${item.provider} / ${item.model} $${item.costEstimateUsd}`)}
          emptyText="비용 집계 없음"
        />
      </div>

      {filterActive ? (
        <div className="platform-admin-ai-ops__filter-banner" role="status">
          <span className="tiny muted">
            필터: {activeFilter?.errorCode ?? activeFilter?.clubId}
          </span>
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => onClearFilter?.()}>
            전체 보기
          </button>
        </div>
      ) : null}

      <div className="platform-admin-ai-ops__jobs">
        {jobs.length > 0 ? (
          jobs.map((job) => (
            <article key={job.jobId} className="platform-admin-ai-ops__job">
              <div className="platform-admin-ai-ops__job-main">
                <div className="platform-admin-ai-ops__badges">
                  <span className="platform-admin-domain-status">{job.status}</span>
                  {job.stage ? <span className="platform-admin-domain-status">{job.stage}</span> : null}
                  {job.staleCandidate ? <span className="platform-admin-domain-status">STALE</span> : null}
                </div>
                <p className="platform-admin-ai-ops__job-title">
                  {job.club.name ?? job.club.slug ?? job.club.clubId} ·{" "}
                  {job.session.bookTitle ?? job.session.sessionId}
                </p>
                <p className="tiny muted">
                  {job.provider} / {job.model} · ${job.costEstimateUsd} · {formatTimestamp(job.lastUpdatedAt)}
                </p>
                {job.errorCode ? (
                  <p className="platform-admin-ai-ops__job-error">
                    {job.errorCode}: {job.safeErrorMessage ?? "safe error"}
                  </p>
                ) : null}
              </div>
              {canAct ? (
                <div className="platform-admin-ai-ops__job-actions">
                  {job.availableActions.includes("FORCE_CANCEL") ? (
                    <button type="button" className="btn btn-quiet btn-sm" onClick={() => onForceCancel?.(job.jobId)}>
                      Force cancel
                    </button>
                  ) : null}
                  {job.availableActions.includes("RETRY_COMMIT") ? (
                    <button type="button" className="btn btn-quiet btn-sm" onClick={() => onRetryCommit?.(job.jobId)}>
                      Retry commit
                    </button>
                  ) : null}
                </div>
              ) : null}
            </article>
          ))
        ) : (
          <p className="muted platform-admin-domain-empty">
            {filterActive ? "이 필터에 해당하는 AI job이 없습니다." : "표시할 AI job이 없습니다."}
          </p>
        )}
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <article className="surface platform-admin-ai-ops__metric">
      <p className="tiny muted platform-admin-metric__label">{label}</p>
      <p className="editorial platform-admin-ai-ops__metric-value">{value}</p>
    </article>
  );
}

function FailureCodeList({
  items,
  activeCode,
  onSelect,
}: {
  items: Array<{ code: string; count: number }>;
  activeCode: string | null;
  onSelect?: (code: string) => void;
}) {
  return (
    <div className="surface platform-admin-ai-ops__small-list">
      <p className="tiny muted">Failure codes</p>
      {items.length > 0 ? (
        <ul>
          {items.map((item) => (
            <li key={item.code}>
              <button
                type="button"
                className="platform-admin-ai-ops__failure-code"
                aria-pressed={activeCode === item.code}
                onClick={() => onSelect?.(item.code)}
              >
                {item.code} {item.count}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="tiny muted">최근 실패 코드 없음</p>
      )}
    </div>
  );
}

function SmallList({ title, items, emptyText }: { title: string; items: string[]; emptyText: string }) {
  return (
    <div className="surface platform-admin-ai-ops__small-list">
      <p className="tiny muted">{title}</p>
      {items.length > 0 ? (
        <ul>
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="tiny muted">{emptyText}</p>
      )}
    </div>
  );
}

function directionGlyph(direction?: "UP" | "DOWN" | "FLAT" | "NONE"): string {
  switch (direction) {
    case "UP":
      return "▲";
    case "DOWN":
      return "▼";
    case "FLAT":
      return "→";
    default:
      return "·";
  }
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
