import type {
  AdminNotificationDelivery,
  AdminNotificationOperationsSnapshot,
  AdminNotificationOutboxEvent,
  AdminNotificationReplayPreview,
  AdminNotificationReplayConfirmResult,
} from "@/features/platform-admin/model/platform-admin-notifications-model";
import { ADMIN_COPY } from "@/features/platform-admin/model/admin-copy";
import { AdminEvidenceLedger } from "./admin-evidence-ledger";
import { AdminPageContext } from "./admin-page-context";
import { AdminReceiptTimeline } from "./admin-receipt-timeline";
import { AdminSafeActionDock, type AdminSafeActionState } from "./admin-action-dock";

export type AdminNotificationsPageProps = {
  snapshot: AdminNotificationOperationsSnapshot | null;
  events: AdminNotificationOutboxEvent[];
  deliveries: AdminNotificationDelivery[];
  focus: string | null;
  replayPreview: AdminNotificationReplayPreview | null;
  replayReason: string;
  replayResult?: AdminNotificationReplayConfirmResult | null;
  canReplay: boolean;
  busy: boolean;
  reasonLocked?: boolean;
  unknownOutcome?: boolean;
  error: string | null;
  success?: string | null;
  onPreviewReplay: () => Promise<void>;
  onConfirmReplay: () => Promise<void>;
  onReplayReasonChange: (value: string) => void;
  hasMoreEvents?: boolean;
  hasMoreDeliveries?: boolean;
  loadingMoreEvents?: boolean;
  loadingMoreDeliveries?: boolean;
  onLoadMoreEvents?: () => Promise<void>;
  onLoadMoreDeliveries?: () => Promise<void>;
};

export function AdminNotificationsPage({
  snapshot,
  events,
  deliveries,
  focus,
  replayPreview,
  replayReason,
  replayResult = null,
  canReplay,
  busy,
  reasonLocked = false,
  unknownOutcome = false,
  error,
  success,
  onPreviewReplay,
  onConfirmReplay,
  onReplayReasonChange,
  hasMoreEvents = false,
  hasMoreDeliveries = false,
  loadingMoreEvents = false,
  loadingMoreDeliveries = false,
  onLoadMoreEvents,
  onLoadMoreDeliveries,
}: AdminNotificationsPageProps) {
  const confirmDisabled = !replayPreview || !replayReason.trim() || !canReplay || busy;
  const dockState = replayDockState({ canReplay, busy, replayResult, unknownOutcome });

  return (
    <section className="admin-notifications">
      <AdminPageContext
        eyebrow={ADMIN_COPY.eyebrow.notifications}
        heading={ADMIN_COPY.heading.delivery}
        freshness={snapshot ? `생성 ${formatTimestamp(snapshot.generatedAt)}` : "요약을 불러오지 못함"}
        authority={canReplay ? "재처리 가능" : "재처리 권한 없음"}
      >
        {focus ? <FocusBanner focus={focus} /> : null}
        {error ? <p className="admin-notifications__error" role="alert">{error}</p> : null}
        {success ? <p className="admin-notifications__success" role="status">{success}</p> : null}

        {snapshot ? (
          <div className="admin-notifications__summary" aria-label="알림 운영 요약">
            <Metric label={ADMIN_COPY.metric.outboxPending} value={snapshot.outboxSummary.pending} />
            <Metric label={ADMIN_COPY.metric.outboxFailed} value={snapshot.outboxSummary.failed + snapshot.outboxSummary.dead} />
            <Metric label={ADMIN_COPY.metric.deliveryPending} value={snapshot.deliverySummary.pending} />
            <Metric label={ADMIN_COPY.metric.deliveryFailed} value={snapshot.deliverySummary.failed + snapshot.deliverySummary.dead} />
            <Metric label={ADMIN_COPY.metric.relayStale} value={snapshot.relaySummary.stalePublishing + snapshot.relaySummary.staleSending} />
          </div>
        ) : null}

        <div className="admin-notifications__grid">
          <section className="admin-notifications__panel" aria-labelledby="admin-notifications-failures-title">
            <h2 id="admin-notifications-failures-title" className="h3 editorial">{ADMIN_COPY.heading.failureClusters}</h2>
            {snapshot?.failureClusters.length ? (
              <ul className="admin-notifications__cluster-list">
                {snapshot.failureClusters.map((cluster) => (
                  <li key={`${cluster.status}-${cluster.safeErrorCode}`}>
                    <span>{cluster.safeErrorCode}</span>
                    <strong>{cluster.count}</strong>
                    <em>{cluster.status}</em>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">집계된 실패 cluster가 없습니다.</p>
            )}
          </section>

          <section className="admin-notifications__panel" aria-labelledby="admin-notifications-replay-title">
            <div className="admin-notifications__panel-heading">
              <h2 id="admin-notifications-replay-title" className="h3 editorial">{ADMIN_COPY.heading.replay}</h2>
            </div>
            {replayPreview ? (
              <div className="admin-notifications__preview">
                <p>
                  대상 <strong>{replayPreview.matchedCount}</strong>건 · 제외 {replayPreview.excludedCount}건
                </p>
                <p className="small muted">만료 {formatTimestamp(replayPreview.expiresAt)}</p>
                {Object.entries(replayPreview.estimatedByStatus).map(([status, count]) => (
                  <span key={status} className="platform-admin-domain-status">{status} {count}</span>
                ))}
                {replayPreview.warnings.map((warning) => (
                  <span key={warning} className="admin-notifications__safe-code">{warning}</span>
                ))}
              </div>
            ) : (
              <p className="muted">실패/Dead delivery를 확인한 뒤 사유를 남기고 재처리합니다.</p>
            )}
            <label className="admin-notifications__reason">
              <span>처리 사유</span>
              <textarea
                value={replayReason}
                disabled={!canReplay || busy || reasonLocked || unknownOutcome}
                onChange={(event) => onReplayReasonChange(event.currentTarget.value)}
                rows={3}
                placeholder="예: 공급자 복구 후 실패 delivery 재처리"
              />
            </label>
            <AdminSafeActionDock
              level="L2"
              authority={canReplay ? "allowed" : "denied"}
              state={dockState}
              reason={
                !canReplay
                  ? "현재 권한으로는 재처리를 실행할 수 없습니다."
                  : unknownOutcome
                    ? "명령 응답을 확인하지 못했습니다. 같은 명령으로 다시 시도할 수 있습니다."
                    : undefined
              }
              status={busy ? <span className="platform-admin-domain-status">처리 중</span> : undefined}
              secondary={
                <button
                  type="button"
                  className="btn btn-quiet btn-sm"
                  disabled={!canReplay || busy || reasonLocked || unknownOutcome}
                  onClick={() => void onPreviewReplay()}
                >
                  대상 확인
                </button>
              }
              primary={
                <button type="button" className="btn btn-primary btn-sm" disabled={confirmDisabled} onClick={() => void onConfirmReplay()}>
                  {replayResult?.effectStatus === "PENDING" ? "효과 상태 새로고침" : "재처리 확정"}
                </button>
              }
            />
            {replayResult ? <ReplayReceipt result={replayResult} /> : null}
          </section>
        </div>

        <AdminEvidenceLedger
          label="발송 대기 장부"
          count={events.length > 0 ? events.length : undefined}
          state={events.length > 0 ? "ready" : "empty"}
          title={events.length > 0 ? undefined : "표시할 outbox event가 없습니다."}
          controls={
            hasMoreEvents ? (
              <button type="button" className="btn btn-quiet btn-sm" disabled={loadingMoreEvents} onClick={() => void onLoadMoreEvents?.()}>
                {loadingMoreEvents ? "불러오는 중" : "Outbox 더 보기"}
              </button>
            ) : null
          }
        >
          {events.length > 0 ? (
            <div className="admin-notifications__rows">
              {events.map((item) => (
                <article key={item.eventId} className="admin-notifications__row">
                  <div>
                    <p className="admin-notifications__row-title">{item.club.name} · {item.eventType}</p>
                    <p className="small muted">{item.source} · attempts {item.attemptCount} · {formatTimestamp(item.updatedAt)}</p>
                  </div>
                  <span className="platform-admin-domain-status">{item.status}</span>
                  {item.safeErrorCode ? <span className="admin-notifications__safe-code">{item.safeErrorCode}</span> : null}
                </article>
              ))}
            </div>
          ) : null}
        </AdminEvidenceLedger>

        <AdminEvidenceLedger
          label="배달 장부"
          count={deliveries.length > 0 ? deliveries.length : undefined}
          state={deliveries.length > 0 ? "ready" : "empty"}
          title={deliveries.length > 0 ? undefined : "표시할 delivery가 없습니다."}
          controls={
            hasMoreDeliveries ? (
              <button type="button" className="btn btn-quiet btn-sm" disabled={loadingMoreDeliveries} onClick={() => void onLoadMoreDeliveries?.()}>
                {loadingMoreDeliveries ? "불러오는 중" : "Delivery 더 보기"}
              </button>
            ) : null
          }
        >
          {deliveries.length > 0 ? (
            <div className="admin-notifications__rows">
              {deliveries.map((item) => (
                <article key={item.deliveryId} className="admin-notifications__row">
                  <div>
                    <p className="admin-notifications__row-title">
                      {item.club.name} · {item.channel} · {item.maskedRecipient ?? "recipient masked"}
                    </p>
                    <p className="small muted">attempts {item.attemptCount} · {formatTimestamp(item.updatedAt)}</p>
                  </div>
                  <span className="platform-admin-domain-status">{item.status}</span>
                  {item.safeErrorCode ? <span className="admin-notifications__safe-code">{item.safeErrorCode}</span> : null}
                </article>
              ))}
            </div>
          ) : null}
        </AdminEvidenceLedger>
      </AdminPageContext>
    </section>
  );
}

function ReplayReceipt({ result }: { result: AdminNotificationReplayConfirmResult }) {
  const availability = result.effectAvailability === "DISABLED" ? " · 현재 비활성" : "";
  const skipped = Object.entries(result.skippedReasonCounts).map(([reason, count]) => (
    <p key={reason} className="small muted">{reason} {count}</p>
  ));
  return (
    <AdminReceiptTimeline
      level="L2"
      receiptId={`영수증 ${result.receiptId}`}
      entries={[
        {
          key: "replay",
          label: `재처리 ${result.replayedCount}건 · 건너뜀 ${result.skippedCount}건`,
          state: "succeeded",
          detail: skipped.length > 0 ? <>{skipped}</> : undefined,
        },
        {
          key: "effect",
          label: `효과 ${effectLabel(result.effectStatus)}${availability}`,
          state:
            result.effectStatus === "SUCCEEDED"
              ? "succeeded"
              : result.effectStatus === "FAILED"
                ? "failed"
                : "pending",
        },
      ]}
    />
  );
}

function replayDockState({
  canReplay,
  busy,
  replayResult,
  unknownOutcome,
}: {
  canReplay: boolean;
  busy: boolean;
  replayResult: AdminNotificationReplayConfirmResult | null;
  unknownOutcome: boolean;
}): AdminSafeActionState {
  if (!canReplay) return "forbidden";
  if (busy) return "pending";
  if (unknownOutcome && !replayResult) return "unknown-outcome";
  if (replayResult && replayResult.effectStatus !== "PENDING") return "complete";
  return "ready";
}

function effectLabel(status: AdminNotificationReplayConfirmResult["effectStatus"]) {
  if (status === "PENDING") return "대기";
  if (status === "SUCCEEDED") return "완료";
  return "실패";
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <article className="surface admin-notifications__metric">
      <p className="tiny muted">{label}</p>
      <strong className="editorial">{value}</strong>
    </article>
  );
}

function FocusBanner({ focus }: { focus: string }) {
  const copy =
    focus === "outbox_backlog"
      ? "Health outbox backlog에서 이동했습니다. 실패 cluster와 pending event를 먼저 확인하세요."
      : focus === "notification_dispatch_success"
        ? "Notification dispatch 상태에서 이동했습니다. 최근 성공과 실패 분포를 함께 확인하세요."
        : "Health drill-down에서 이동했습니다.";
  return <p className="admin-notifications__focus">{copy}</p>;
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
