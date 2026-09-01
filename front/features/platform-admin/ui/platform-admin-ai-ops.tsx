import { useMemo, useRef, type MouseEvent } from "react";
import type {
  PlatformAdminAiOpsAction,
  PlatformAdminAiOpsCommandPreviewResponse,
  PlatformAdminAiOpsCommandReceiptResponse,
} from "@/features/platform-admin/model/platform-admin-domain-types";
import { ADMIN_COPY } from "@/features/platform-admin/model/admin-copy";
import {
  aiOpsJobStageLanguage,
  aiOpsJobStatusLanguage,
  buildAiOpsJobNarrative,
  buildAiOpsServiceDetail,
  formatAiJobElapsedLabel,
} from "@/features/platform-admin/model/platform-admin-ai-ops-model";
import { AdminSafeActionDock, type AdminSafeActionState } from "@/features/platform-admin/ui/admin-action-dock";
import { AdminEvidenceLedger } from "@/features/platform-admin/ui/admin-evidence-ledger";
import { AdminModalDialog } from "@/features/platform-admin/ui/admin-modal-dialog";
import { AdminPageContext } from "@/features/platform-admin/ui/admin-page-context";
import { AdminReceiptTimeline } from "@/features/platform-admin/ui/admin-receipt-timeline";
import { AdminTechnicalDisclosure } from "@/features/platform-admin/ui/admin-technical-disclosure";
import "@/features/platform-admin/ui/admin-service-status.css";

export const ADMIN_AI_OPS_HEADING_ID = "admin-ai-ops-title";

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
  const serviceDetail = buildAiOpsServiceDetail(summary, jobs);

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
        ? "이 조건에 해당하는 AI 처리 기록이 없습니다."
        : "표시할 AI 처리 기록이 없습니다.";

  return (
    <section className="platform-admin-ai-ops admin-ai-ops">
      <AdminPageContext
        headingId={ADMIN_AI_OPS_HEADING_ID}
        eyebrow={ADMIN_COPY.eyebrow.aiOps}
        heading={ADMIN_COPY.heading.aiOps}
        description={serviceDetail.operatorSentence}
        freshness={loading
          ? "동기화 중"
          : serviceDetail.latestObservedAt
            ? `최근 작업 갱신 ${formatTimestamp(serviceDetail.latestObservedAt)}`
            : "최근 작업 갱신 시각 없음"}
        authority={canAct ? "명령 가능" : "변경 권한 없음"}
      >
      {error ? (
        <p className="platform-admin-ai-ops__error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="platform-admin-ai-ops__metrics">
        <Metric label="진행 중" value={summary ? String(summary.activeJobCount) : "—"} />
        <Metric label="24시간 실패" value={summary ? String(summary.failedLast24h) : "—"} />
        <Metric label="이번 달 예상 비용" value={summary ? `$${summary.monthToDateCostEstimateUsd}` : "—"} />
        <Metric label="오래 멈춤" value={summary ? String(summary.staleCandidateCount) : "—"} />
      </div>

      <section className="platform-admin-ai-ops__failure-overview" aria-labelledby="platform-admin-ai-failure-title">
        <h2 id="platform-admin-ai-failure-title" className="h3 editorial">최근 실패 묶음</h2>
        <FailureCodeList
          items={summary?.failureCodes ?? []}
          unavailable={!summary}
          activeCode={activeFilter?.errorCode ?? null}
          onSelect={onSelectFailureCode}
        />
      </section>

      {filterActive ? (
        <div className="platform-admin-ai-ops__filter-banner" role="status">
          <span className="tiny muted">선택한 실패 원인의 작업만 보는 중</span>
          <AdminTechnicalDisclosure
            items={[
              { label: activeFilter?.errorCode ? "오류 코드" : "클럽 식별자", value: activeFilter?.errorCode ?? activeFilter?.clubId },
            ]}
          />
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => onClearFilter?.()}>
            전체 보기
          </button>
        </div>
      ) : null}

      <AdminEvidenceLedger
        label="처리 시도 기록"
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
            {jobs.map((job) => {
              const elapsed = formatAiJobElapsedLabel(job, new Date());
              const status = aiOpsJobStatusLanguage(job.status);
              const stage = job.stage ? aiOpsJobStageLanguage(job.stage) : null;
              const narrative = buildAiOpsJobNarrative(job);
              return (
              <article key={job.jobId} className="platform-admin-ai-ops__job">
                <div className="platform-admin-ai-ops__job-main">
                  <div className="platform-admin-ai-ops__badges">
                    <span className="platform-admin-domain-status">{status.primaryText}</span>
                    {stage ? <span className="platform-admin-domain-status">{stage.primaryText}</span> : null}
                    {job.staleCandidate ? <span className="platform-admin-domain-status">오래됨</span> : null}
                  </div>
                  <p className="platform-admin-ai-ops__job-title">
                    {job.club.name ?? job.club.slug ?? job.club.clubId} ·{" "}
                    {job.session.bookTitle ?? job.session.sessionId}
                  </p>
                  <p className="platform-admin-ai-ops__job-sentence">{narrative.operatorSentence}</p>
                  {elapsed ? (
                    <p
                      className={
                        job.staleCandidate
                          ? "platform-admin-ai-ops__job-elapsed platform-admin-ai-ops__job-elapsed--stalled"
                          : "platform-admin-ai-ops__job-elapsed"
                      }
                    >
                      {elapsed}
                    </p>
                  ) : null}
                  <p className="tiny muted">
                    {job.provider} / {job.model} · ${job.costEstimateUsd} · {formatTimestamp(job.lastUpdatedAt)}
                  </p>
                  {narrative.cleanupSentence ? <p className="small muted">{narrative.cleanupSentence}</p> : null}
                  {job.safeErrorMessage ? (
                    <p className="platform-admin-ai-ops__job-error">
                      실패 원인 · {job.safeErrorMessage}
                    </p>
                  ) : null}
                  <p className="small platform-admin-ai-ops__job-next">{narrative.nextSafeAction}</p>
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
                        저장 복구 검토
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
              );
            })}
          </div>
        ) : null}
        <p className="admin-service-detail__next-action">{serviceDetail.nextSafeAction}</p>
        {(summary?.failureCodes ?? []).map((item) => (
          <AdminTechnicalDisclosure
            key={`failure-${item.code}`}
            items={[{ label: `오류 코드 · ${item.count}건`, value: item.code }]}
          />
        ))}
        {jobs.map((job) => (
          <AdminTechnicalDisclosure
            key={`job-${job.jobId}`}
            items={[
              { label: "AI 작업 식별자", value: job.jobId },
              { label: "상태 코드", value: job.status },
              { label: "단계 코드", value: job.stage },
              { label: "작업 버전", value: job.revision == null ? null : `revision ${job.revision}` },
              { label: "정리 상태", value: job.cleanupPending == null ? null : job.cleanupPending ? "CLEANUP_PENDING" : "CLEANUP_COMPLETE" },
              { label: "오류 코드", value: job.errorCode },
            ]}
          />
        ))}
      </AdminEvidenceLedger>
      {!canAct && jobs.some((job) => job.availableActions.length > 0) ? (
        <p className="tiny muted platform-admin-ai-ops__permission-note">
          현재 권한으로는 AI 작업을 변경할 수 없습니다.
        </p>
      ) : null}

      <section className="platform-admin-ai-ops__cost-reference" aria-label="비용 참고">
        <div className="platform-admin-ai-ops__trend" aria-label="비용 추이">
          <div className="platform-admin-ai-ops__window" role="group" aria-label="비용 기간">
            {(["7d", "30d", "90d"] as const).map((w) => (
              <button
                key={w}
                type="button"
                className="btn btn-quiet btn-sm"
                aria-pressed={(window ?? summary?.costTrend.window) === w}
                onClick={() => onSelectWindow?.(w)}
              >
                {aiCostWindowLabel(w)}
              </button>
            ))}
          </div>
          {!summary ? (
            <p className="small muted">집계 없음</p>
          ) : summary.costTrend.availability === "NOT_ENOUGH_DATA" ? (
            <p className="small muted">데이터 부족</p>
          ) : (
            <p className="small">
              <span>${summary.costTrend.currentCostUsd}</span>{" "}
              <span aria-label="cost trend direction">{directionGlyph(summary.costTrend.deltaDirection)}</span>{" "}
              <span className="muted">직전 ${summary.costTrend.priorCostUsd}</span>
            </p>
          )}
        </div>
        <SmallList
          title="공급자별 비용"
          items={(summary?.providerCosts ?? []).map((item) => `${item.provider} / ${item.model} $${item.costEstimateUsd}`)}
          emptyText={summary ? "비용 집계 없음" : "집계 확인 불가"}
        />
      </section>

      {commandState && canAct ? (
        <AiCommandDialog
          state={commandState}
          triggerRef={commandTrigger ? providedCommandTriggerRef : commandTriggerRef}
          onConfirm={onConfirmCommand}
          onRetrySame={onRetrySameCommand}
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
  onDismiss,
}: {
  state: PlatformAdminAiOpsCommandState;
  triggerRef: { current: HTMLElement | null };
  onConfirm?: () => void;
  onRetrySame?: () => void;
  onDismiss?: () => void;
}) {
  const label = state.action === "FORCE_CANCEL" ? "강제 취소" : "저장 복구";
  const busy = state.phase === "PREVIEW_LOADING" || state.phase === "CONFIRMING";
  const titleId = "platform-admin-ai-command-title";
  return (
    <AdminModalDialog
      titleId={titleId}
      triggerRef={triggerRef}
      onRequestClose={() => {
        if (!busy && state.phase !== "UNKNOWN") onDismiss?.();
      }}
      className="platform-admin-ai-command-dialog"
    >
      <div className="platform-admin-ai-command-dialog__header">
        <p className="eyebrow">안전 명령</p>
        <h3 id={titleId} className="h3 editorial">
          {state.phase === "RECEIPT" ? "명령 처리 결과" : `${label} 확인`}
        </h3>
      </div>

      {state.phase === "UNKNOWN" ? (
        <div className="platform-admin-ai-command-dialog__notice" role="alert">
          <p>{state.message}</p>
          <AdminTechnicalDisclosure items={[{ label: "오류 코드", value: state.code }]} />
        </div>
      ) : null}

      {state.phase === "RECEIPT" && state.receipt ? (
        <>
          <div className="platform-admin-ai-command-dialog__receipt" role="status" aria-label="AI 명령 영수증">
            <p className="small"><strong>영수증</strong> {state.receipt.receiptId}</p>
            <p className="small">명령 접수 완료 · 후속 처리 {aiEffectStatusLabel(state.receipt.effectStatus)}</p>
            <AdminTechnicalDisclosure
              items={[
                { label: "AI 작업 식별자", value: state.receipt.jobId },
                { label: "원본 상태 코드", value: state.receipt.originStatus },
                { label: "후속 처리 코드", value: state.receipt.effectStatus },
                { label: "오류 코드", value: state.receipt.safeErrorCode },
                { label: "작업 버전", value: `revision ${state.receipt.beforeJobRevision} → ${state.receipt.afterJobRevision}` },
              ]}
            />
          </div>
          <AdminReceiptTimeline
            level="L3"
            receiptId={`영수증 ${state.receipt.receiptId}`}
            entries={[
              {
                key: "origin",
                label: "명령 접수 완료",
                state: "succeeded",
              },
              {
                key: "effect",
                label: `후속 처리 ${aiEffectStatusLabel(state.receipt.effectStatus)}`,
                state:
                  state.receipt.effectStatus === "SUCCEEDED"
                    ? "succeeded"
                    : state.receipt.effectStatus === "FAILED"
                      ? "failed"
                      : "pending",
              },
            ]}
            convergence={<p>후속 처리 · {aiEffectStatusLabel(state.receipt.effectStatus)}</p>}
          />
        </>
      ) : (
        <div className="platform-admin-ai-command-dialog__impact">
          <p className="small"><strong>{aiCommandImpactSentence(state.action)}</strong></p>
          <ul>
            {state.preview.impactCodes.map((code) => <li key={code}>{aiImpactCodeLabel(code)}</li>)}
          </ul>
          <p className="tiny muted">만료 {formatTimestamp(state.preview.expiresAt)}</p>
          <AdminTechnicalDisclosure
            items={[
              { label: "AI 작업 식별자", value: state.preview.jobId },
              { label: "상태 코드", value: state.preview.jobStatus },
              { label: "작업 버전", value: `revision ${state.preview.jobRevision}` },
              { label: "후속 처리 코드", value: state.preview.effectType },
              { label: "영향 코드", value: state.preview.impactCodes.join(", ") },
              { label: "요청 확인값", value: state.preview.fingerprintPrefix },
            ]}
          />
        </div>
      )}

      <div className="admin-modal-dialog__actions">
        <AdminSafeActionDock
          level="L3"
          authority="allowed"
          state={aiCommandDockState(state, busy)}
          primary={aiCommandPrimary({ state, busy, onConfirm, onRetrySame, onDismiss })}
          secondary={aiCommandSecondary({ state, busy, onRetrySame, onDismiss })}
        />
      </div>
    </AdminModalDialog>
  );
}

function aiCommandDockState(
  state: PlatformAdminAiOpsCommandState,
  busy: boolean,
): AdminSafeActionState {
  if (busy) return "pending";
  if (state.phase === "UNKNOWN") return "unknown-outcome";
  return "ready";
}

function aiCommandPrimary({
  state,
  busy,
  onConfirm,
  onRetrySame,
  onDismiss,
}: {
  state: PlatformAdminAiOpsCommandState;
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
      {state.phase === "CONFIRMING"
        ? "확인 중"
        : state.action === "FORCE_CANCEL"
          ? "이 작업 강제 취소"
          : "이 작업 저장 복구"}
    </button>
  );
}

function aiCommandSecondary({
  state,
  busy,
  onRetrySame,
  onDismiss,
}: {
  state: PlatformAdminAiOpsCommandState;
  busy: boolean;
  onRetrySame?: () => void;
  onDismiss?: () => void;
}) {
  if (state.phase === "UNKNOWN") {
    return null;
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
      <p className="eyebrow">작업 상세</p>
      <h3 id={titleId} className="h3 editorial">AI 작업 상세</h3>
      <dl className="platform-admin-ai-job-detail">
        <div><dt>상태</dt><dd>{aiOpsJobStatusLanguage(job.status).primaryText}</dd></div>
        <div><dt>클럽</dt><dd>{job.club.name ?? job.club.slug ?? "클럽 이름 없음"}</dd></div>
        <div><dt>모임</dt><dd>{job.session.bookTitle ?? "책 정보 없음"}</dd></div>
        <div><dt>최근 갱신</dt><dd>{formatTimestamp(job.lastUpdatedAt)}</dd></div>
      </dl>
      <AdminTechnicalDisclosure
        items={[
          { label: "AI 작업 식별자", value: job.jobId },
          { label: "클럽 식별자", value: job.club.clubId },
          { label: "모임 식별자", value: job.session.sessionId },
          { label: "상태 코드", value: job.status },
          { label: "단계 코드", value: job.stage },
          { label: "작업 버전", value: job.revision == null ? null : `revision ${job.revision}` },
        ]}
      />
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
    <div className="platform-admin-ai-ops__failure-list">
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
                이 원인의 작업 보기 · {item.count}건
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="small muted">{unavailable ? "실패 묶음 집계를 확인할 수 없습니다." : "최근 실패 묶음이 없습니다."}</p>
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

function aiCommandImpactSentence(action: PlatformAdminAiOpsAction) {
  return action === "FORCE_CANCEL"
    ? "진행 중인 작업을 중단하고 임시 데이터를 정리합니다."
    : "같은 작업의 저장 단계를 안전하게 다시 진행합니다.";
}

function aiImpactCodeLabel(code: string) {
  if (code === "CANCEL_JOB") return "진행 중인 작업을 중단합니다.";
  if (code === "DELETE_TRANSIENT_PAYLOAD") return "완료되지 않은 임시 데이터를 정리합니다.";
  if (code === "RETRY_COMMIT") return "저장 단계를 같은 작업으로 다시 진행합니다.";
  return "추가 영향을 기술 정보에서 확인하세요.";
}

function aiEffectStatusLabel(status: string) {
  if (status === "SUCCEEDED") return "완료";
  if (status === "FAILED") return "실패";
  if (status === "PENDING") return "대기";
  return "결과 확인 필요";
}

function aiCostWindowLabel(window: "7d" | "30d" | "90d") {
  if (window === "7d") return "7일";
  if (window === "30d") return "30일";
  return "90일";
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
