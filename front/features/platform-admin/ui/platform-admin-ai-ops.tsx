import { useMemo, useRef, type MouseEvent } from "react";
import type {
  PlatformAdminAiOpsAction,
  PlatformAdminAiOpsCommandPreviewResponse,
  PlatformAdminAiOpsCommandReceiptResponse,
} from "@/features/platform-admin/model/platform-admin-domain-types";
import { AdminSafeActionDock, type AdminSafeActionState } from "@/features/platform-admin/ui/admin-action-dock";
import { AdminEvidenceLedger } from "@/features/platform-admin/ui/admin-evidence-ledger";
import { AdminModalDialog } from "@/features/platform-admin/ui/admin-modal-dialog";
import { ADMIN_COPY } from "@/features/platform-admin/model/admin-copy";
import { AdminPageContext } from "@/features/platform-admin/ui/admin-page-context";
import { AdminReceiptTimeline } from "@/features/platform-admin/ui/admin-receipt-timeline";

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
  revision?: number | null;
  cleanupPending?: boolean;
  availableActions: string[];
};

export type PlatformAdminAiOpsCommandState = {
  phase: "PREVIEW_LOADING" | "REVIEW" | "CONFIRMING" | "UNKNOWN" | "RECEIPT";
  job: PlatformAdminAiOpsJobView;
  action: PlatformAdminAiOpsAction;
  idempotencyKey: string;
  preview: PlatformAdminAiOpsCommandPreviewResponse;
  message?: string;
  code?: string;
  receipt?: PlatformAdminAiOpsCommandReceiptResponse;
};

type PlatformAdminAiOpsProps = {
  role: PlatformAdminAiOpsRole;
  summary: PlatformAdminAiOpsSummaryView | null;
  jobs: PlatformAdminAiOpsJobView[];
  loading?: boolean;
  error?: string | null;
  jobsUnavailable?: boolean;
  canManageActions?: boolean;
  commandState?: PlatformAdminAiOpsCommandState | null;
  commandTrigger?: HTMLElement | null;
  onRequestPreview?: (jobId: string, action: PlatformAdminAiOpsAction) => void;
  onConfirmCommand?: () => void;
  onRetrySameCommand?: () => void;
  onRestartPreview?: () => void;
  onDismissCommand?: () => void;
  selectedJob?: PlatformAdminAiOpsJobView | null;
  onSelectJob?: (jobId: string) => void;
  onCloseJob?: () => void;
  hasNextPage?: boolean;
  fetchingNextPage?: boolean;
  onLoadMore?: () => void;
  activeFilter?: { errorCode: string | null; clubId: string | null };
  onSelectFailureCode?: (code: string) => void;
  onClearFilter?: () => void;
  window?: "7d" | "30d" | "90d";
  onSelectWindow?: (window: "7d" | "30d" | "90d") => void;
};

export function PlatformAdminAiOps({
  summary,
  jobs,
  loading = false,
  error = null,
  jobsUnavailable = false,
  canManageActions = false,
  commandState = null,
  commandTrigger = null,
  onRequestPreview,
  onConfirmCommand,
  onRetrySameCommand,
  onRestartPreview,
  onDismissCommand,
  selectedJob = null,
  onSelectJob,
  onCloseJob,
  hasNextPage = false,
  fetchingNextPage = false,
  onLoadMore,
  activeFilter,
  onSelectFailureCode,
  onClearFilter,
  window,
  onSelectWindow,
}: PlatformAdminAiOpsProps) {
  const canAct = canManageActions;
  const filterActive = Boolean(activeFilter?.errorCode || activeFilter?.clubId);
  const commandTriggerRef = useRef<HTMLElement | null>(null);
  const detailTriggerRef = useRef<HTMLElement | null>(null);
  const providedCommandTriggerRef = useMemo(() => ({ current: commandTrigger }), [commandTrigger]);

  function requestPreview(
    event: MouseEvent<HTMLButtonElement>,
    jobId: string,
    action: PlatformAdminAiOpsAction,
  ) {
    commandTriggerRef.current = event.currentTarget;
    onRequestPreview?.(jobId, action);
  }

  const jobsLedgerState = jobsUnavailable ? "unavailable" : jobs.length > 0 ? "ready" : "empty";
  const jobsLedgerTitle = jobs.length > 0
    ? undefined
    : jobsUnavailable
      ? "AI 작업 목록을 불러오지 못했습니다."
      : filterActive
        ? "이 필터에 해당하는 AI job이 없습니다."
        : "표시할 AI job이 없습니다.";

  return (
    <section className="platform-admin-ai-ops admin-ai-ops">
      <AdminPageContext
        eyebrow={ADMIN_COPY.eyebrow.aiOps}
        heading={ADMIN_COPY.heading.aiOps}
        freshness={loading ? "동기화 중" : undefined}
        authority={canAct ? "명령 가능" : "변경 권한 없음"}
      >
      {error ? (
        <p className="platform-admin-ai-ops__error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="platform-admin-ai-ops__metrics">
        <Metric label="Active" value={summary ? String(summary.activeJobCount) : "—"} />
        <Metric label="Failed 24h" value={summary ? String(summary.failedLast24h) : "—"} />
        <Metric label="Cost MTD" value={summary ? `$${summary.monthToDateCostEstimateUsd}` : "—"} />
        <Metric label="Stale" value={summary ? String(summary.staleCandidateCount) : "—"} />
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
        {!summary ? (
          <p className="small" style={{ color: "var(--text-3)" }}>집계 없음</p>
        ) : summary.costTrend.availability === "NOT_ENOUGH_DATA" ? (
          <p className="small" style={{ color: "var(--text-3)" }}>데이터 부족</p>
        ) : (
          <p className="small">
            <span>${summary.costTrend.currentCostUsd}</span>{" "}
            <span aria-label="cost trend direction">{directionGlyph(summary.costTrend.deltaDirection)}</span>{" "}
            <span style={{ color: "var(--text-3)" }}>직전 ${summary.costTrend.priorCostUsd}</span>
          </p>
        )}
      </div>

      <div className="platform-admin-ai-ops__sidecars">
        <FailureCodeList
          items={summary?.failureCodes ?? []}
          unavailable={!summary}
          activeCode={activeFilter?.errorCode ?? null}
          onSelect={onSelectFailureCode}
        />
        <SmallList
          title="Provider cost"
          items={(summary?.providerCosts ?? []).map((item) => `${item.provider} / ${item.model} $${item.costEstimateUsd}`)}
          emptyText={summary ? "비용 집계 없음" : "집계 확인 불가"}
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

      <AdminEvidenceLedger
        label="작업 목록"
        count={jobs.length > 0 ? jobs.length : undefined}
        state={jobsLedgerState}
        title={jobsLedgerTitle}
        controls={
          hasNextPage ? (
            <button
              type="button"
              className="btn btn-secondary platform-admin-ai-ops__load-more"
              disabled={fetchingNextPage}
              onClick={() => onLoadMore?.()}
            >
              {fetchingNextPage ? "불러오는 중" : "이전 작업 더 보기"}
            </button>
          ) : null
        }
      >
        {jobs.length > 0 ? (
          <div className="platform-admin-ai-ops__jobs">
            {jobs.map((job) => (
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
                  {job.revision != null ? (
                    <p className="tiny muted">
                      revision {job.revision} · {job.cleanupPending ? "cleanup pending" : "cleanup complete"}
                    </p>
                  ) : null}
                  {job.errorCode ? (
                    <p className="platform-admin-ai-ops__job-error">
                      {job.errorCode}: {job.safeErrorMessage ?? "safe error"}
                    </p>
                  ) : null}
                </div>
                {canAct ? (
                  <div className="platform-admin-ai-ops__job-actions">
                    {job.availableActions.includes("FORCE_CANCEL") ? (
                      <button
                        type="button"
                        className="btn btn-quiet btn-sm"
                        onClick={(event) => requestPreview(event, job.jobId, "FORCE_CANCEL")}
                      >
                        강제 취소 검토
                      </button>
                    ) : null}
                    {job.availableActions.includes("RETRY_COMMIT") ? (
                      <button
                        type="button"
                        className="btn btn-quiet btn-sm"
                        onClick={(event) => requestPreview(event, job.jobId, "RETRY_COMMIT")}
                      >
                        커밋 복구 검토
                      </button>
                    ) : null}
                  </div>
                ) : null}
                <button
                  type="button"
                  className="btn btn-quiet btn-sm"
                  onClick={(event) => {
                    detailTriggerRef.current = event.currentTarget;
                    onSelectJob?.(job.jobId);
                  }}
                >
                  상세 보기
                </button>
              </article>
            ))}
          </div>
        ) : null}
      </AdminEvidenceLedger>
      {!canAct && jobs.some((job) => job.availableActions.length > 0) ? (
        <p className="tiny muted platform-admin-ai-ops__permission-note">
          현재 권한으로는 AI 작업을 변경할 수 없습니다.
        </p>
      ) : null}

      {commandState && canAct ? (
        <AiCommandDialog
          state={commandState}
          triggerRef={commandTrigger ? providedCommandTriggerRef : commandTriggerRef}
          onConfirm={onConfirmCommand}
          onRetrySame={onRetrySameCommand}
          onRestart={onRestartPreview}
          onDismiss={onDismissCommand}
        />
      ) : null}

      {selectedJob ? (
        <AiJobDetailDialog job={selectedJob} triggerRef={detailTriggerRef} onDismiss={onCloseJob} />
      ) : null}
      </AdminPageContext>
    </section>
  );
}

function AiCommandDialog({
  state,
  triggerRef,
  onConfirm,
  onRetrySame,
  onRestart,
  onDismiss,
}: {
  state: PlatformAdminAiOpsCommandState;
  triggerRef: { current: HTMLElement | null };
  onConfirm?: () => void;
  onRetrySame?: () => void;
  onRestart?: () => void;
  onDismiss?: () => void;
}) {
  const label = state.action === "FORCE_CANCEL" ? "강제 취소" : "커밋 복구";
  const busy = state.phase === "PREVIEW_LOADING" || state.phase === "CONFIRMING";
  const titleId = "platform-admin-ai-command-title";
  return (
    <AdminModalDialog
      titleId={titleId}
      triggerRef={triggerRef}
      onRequestClose={() => {
        if (!busy) onDismiss?.();
      }}
      className="platform-admin-ai-command-dialog"
    >
      <div className="platform-admin-ai-command-dialog__header">
        <p className="eyebrow">Safe command</p>
        <h3 id={titleId} className="h3 editorial">
          {state.phase === "RECEIPT" ? "명령 처리 결과" : `${label} 확인`}
        </h3>
      </div>

      {state.phase === "UNKNOWN" ? (
        <div className="platform-admin-ai-command-dialog__notice" role="alert">
          <p>{state.message}</p>
          <p className="tiny muted">{state.code}</p>
        </div>
      ) : null}

      {state.phase === "RECEIPT" && state.receipt ? (
        <>
          <div className="platform-admin-ai-command-dialog__receipt" role="status" aria-label="AI 명령 영수증">
            <p className="small"><strong>영수증</strong> {state.receipt.receiptId}</p>
            <p className="small">원본 {state.receipt.originStatus} · 후속 효과 {state.receipt.effectStatus}</p>
            {state.receipt.safeErrorCode ? <p className="small">안전 코드 {state.receipt.safeErrorCode}</p> : null}
            <p className="tiny muted">
              revision {state.receipt.beforeJobRevision} → {state.receipt.afterJobRevision}
            </p>
          </div>
          <AdminReceiptTimeline
            level="L2"
            receiptId={`영수증 ${state.receipt.receiptId}`}
            entries={[
              {
                key: "origin",
                label: `원본 ${state.receipt.originStatus}`,
                state: "succeeded",
              },
              {
                key: "effect",
                label: `후속 효과 ${state.receipt.effectStatus}${state.receipt.safeErrorCode ? ` · ${state.receipt.safeErrorCode}` : ""}`,
                state:
                  state.receipt.effectStatus === "SUCCEEDED"
                    ? "succeeded"
                    : state.receipt.effectStatus === "FAILED"
                      ? "failed"
                      : "pending",
              },
            ]}
          />
        </>
      ) : (
        <div className="platform-admin-ai-command-dialog__impact">
          <p className="small"><strong>{state.preview.jobStatus} · revision {state.preview.jobRevision}</strong></p>
          <p className="small">후속 효과: {state.preview.effectType}</p>
          <ul>
            {state.preview.impactCodes.map((code) => <li key={code}>{code}</li>)}
          </ul>
          <p className="tiny muted">요청 확인값 {state.preview.fingerprintPrefix}</p>
          <p className="tiny muted">만료 {formatTimestamp(state.preview.expiresAt)}</p>
        </div>
      )}

      <div className="admin-modal-dialog__actions">
        <AdminSafeActionDock
          level="L2"
          authority="allowed"
          state={aiCommandDockState(state, busy)}
          primary={aiCommandPrimary({ state, label, busy, onConfirm, onRetrySame, onDismiss })}
          secondary={aiCommandSecondary({ state, busy, onRestart, onRetrySame, onDismiss })}
        />
      </div>
    </AdminModalDialog>
  );
}

function aiCommandDockState(
  _state: PlatformAdminAiOpsCommandState,
  busy: boolean,
): AdminSafeActionState {
  if (busy) return "pending";
  return "ready";
}

function aiCommandPrimary({
  state,
  label,
  busy,
  onConfirm,
  onRetrySame,
  onDismiss,
}: {
  state: PlatformAdminAiOpsCommandState;
  label: string;
  busy: boolean;
  onConfirm?: () => void;
  onRetrySame?: () => void;
  onDismiss?: () => void;
}) {
  if (state.phase === "UNKNOWN") {
    return (
      <button type="button" className="btn btn-primary" onClick={() => onRetrySame?.()}>
        같은 명령으로 다시 확인
      </button>
    );
  }
  if (state.phase === "RECEIPT") {
    return (
      <button type="button" className="btn btn-primary" onClick={() => onDismiss?.()}>
        닫기
      </button>
    );
  }
  return (
    <button type="button" className="btn btn-primary" disabled={busy} onClick={() => onConfirm?.()}>
      {state.phase === "CONFIRMING" ? "확인 중" : `${label} 확인`}
    </button>
  );
}

function aiCommandSecondary({
  state,
  busy,
  onRestart,
  onRetrySame,
  onDismiss,
}: {
  state: PlatformAdminAiOpsCommandState;
  busy: boolean;
  onRestart?: () => void;
  onRetrySame?: () => void;
  onDismiss?: () => void;
}) {
  if (state.phase === "UNKNOWN") {
    return (
      <button type="button" className="btn btn-secondary" onClick={() => onRestart?.()}>
        최신 상태로 다시 검토
      </button>
    );
  }
  if (state.phase === "RECEIPT") {
    if (state.receipt?.effectStatus === "PENDING" || state.receipt?.effectStatus === "FAILED") {
      return (
        <button type="button" className="btn btn-secondary" onClick={() => onRetrySame?.()}>
          같은 명령으로 상태 다시 확인
        </button>
      );
    }
    return null;
  }
  return (
    <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => onDismiss?.()}>
      취소
    </button>
  );
}

function AiJobDetailDialog({
  job,
  triggerRef,
  onDismiss,
}: {
  job: PlatformAdminAiOpsJobView;
  triggerRef: { current: HTMLElement | null };
  onDismiss?: () => void;
}) {
  const titleId = "platform-admin-ai-job-detail-title";
  return (
    <AdminModalDialog titleId={titleId} triggerRef={triggerRef} onRequestClose={() => onDismiss?.()}>
      <p className="eyebrow">Job drill-down</p>
      <h3 id={titleId} className="h3 editorial">AI 작업 상세</h3>
      <dl className="platform-admin-ai-job-detail">
        <div><dt>Job ID</dt><dd>{job.jobId}</dd></div>
        <div><dt>상태</dt><dd>{job.status}</dd></div>
        <div><dt>Revision</dt><dd>revision {job.revision ?? "-"}</dd></div>
        <div><dt>Club</dt><dd>{job.club.name ?? job.club.slug ?? job.club.clubId}</dd></div>
        <div><dt>Session</dt><dd>{job.session.bookTitle ?? job.session.sessionId}</dd></div>
        <div><dt>최근 갱신</dt><dd>{formatTimestamp(job.lastUpdatedAt)}</dd></div>
      </dl>
      <div className="admin-modal-dialog__actions">
        <button type="button" className="btn btn-primary" onClick={() => onDismiss?.()}>닫기</button>
      </div>
    </AdminModalDialog>
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
  unavailable,
  activeCode,
  onSelect,
}: {
  items: Array<{ code: string; count: number }>;
  unavailable: boolean;
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
        <p className="tiny muted">{unavailable ? "집계 확인 불가" : "최근 실패 코드 없음"}</p>
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
