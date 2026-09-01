import type {
  AdminNotificationDelivery,
  AdminNotificationOperationsSnapshot,
  AdminNotificationOutboxEvent,
  AdminNotificationReplayPreview,
  AdminNotificationReplayConfirmResult,
} from "@/features/platform-admin/model/platform-admin-notifications-model";
import {
  ADMIN_COPY,
  deliveryAttemptBadge,
  deliveryLedgerStatusLabel,
} from "@/features/platform-admin/model/admin-copy";
import { AdminEvidenceLedger } from "./admin-evidence-ledger";
import { AdminPageContext } from "./admin-page-context";
import { AdminReceiptTimeline } from "./admin-receipt-timeline";
import { AdminSafeActionDock, type AdminSafeActionState } from "./admin-action-dock";
import { AdminTechnicalDisclosure } from "@/features/platform-admin/ui/admin-technical-disclosure";
import "./admin-service-status.css";

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
  const overview = notificationOverview(snapshot);

  return (
    <section className="admin-notifications">
      <AdminPageContext
        eyebrow={ADMIN_COPY.eyebrow.notifications}
        heading={ADMIN_COPY.heading.delivery}
        description={overview.operatorSentence}
        freshness={snapshot ? `최근 집계 ${formatTimestamp(snapshot.generatedAt)}` : "최근 집계 시각 없음"}
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
                {snapshot.failureClusters.map((cluster) => {
                  const evidence = failureClusterEvidence(cluster, events, deliveries);
                  return (
                    <li key={`${cluster.status}-${cluster.safeErrorCode}`} aria-label={`${evidence.clubLabel} 알림 전달 실패 ${cluster.count}건`}>
                      <div>
                        <span>{evidence.clubLabel} 알림 전달 실패</span>
                        <p className="small muted">최근 확인 {cluster.latestAt ? formatTimestamp(cluster.latestAt) : "시각 없음"}</p>
                      </div>
                      <strong>{cluster.count}</strong>
                      <em>{deliveryLedgerStatusLabel(cluster.status)}</em>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="muted">같은 원인으로 묶인 최근 실패가 없습니다.</p>
            )}
            <p className="admin-service-detail__next-action">{overview.nextSafeAction}</p>
            {snapshot?.failureClusters.map((cluster) => {
              const evidence = failureClusterEvidence(cluster, events, deliveries);
              return (
                <AdminTechnicalDisclosure
                  key={`${cluster.status}-${cluster.safeErrorCode}`}
                  items={[
                    { label: "알림 유형 코드", value: evidence.eventType },
                    { label: "오류 코드", value: cluster.safeErrorCode },
                    { label: "상태 코드", value: cluster.status },
                  ]}
                />
              );
            })}
          </section>

          <section className="admin-notifications__panel" aria-labelledby="admin-notifications-replay-title">
            <div className="admin-notifications__panel-heading">
              <h2 id="admin-notifications-replay-title" className="h3 editorial">{ADMIN_COPY.heading.replay}</h2>
            </div>
            <p className="admin-notifications__replay-warning">{ADMIN_COPY.replayWarning}</p>
            {replayPreview ? (
              <div className="admin-notifications__preview">
                <p>
                  대상 <strong>{replayPreview.matchedCount}</strong>건 · 제외 {replayPreview.excludedCount}건
                </p>
                <p className="small muted">만료 {formatTimestamp(replayPreview.expiresAt)}</p>
                {Object.entries(replayPreview.estimatedByStatus).map(([status, count]) => (
                  <span key={status} className="platform-admin-domain-status">{deliveryLedgerStatusLabel(status)} {count}</span>
                ))}
                {replayPreview.warnings.length > 0 ? (
                  <>
                    <p className="small">확인할 주의 사항이 있습니다.</p>
                    <AdminTechnicalDisclosure
                      items={[{ label: "주의 코드", value: replayPreview.warnings.join(", ") }]}
                    />
                  </>
                ) : null}
              </div>
            ) : (
              <p className="muted">실패한 배달을 확인한 뒤 사유를 남기고 재발송합니다.</p>
            )}
            <label className="admin-notifications__reason">
              <span>처리 사유</span>
              <textarea
                value={replayReason}
                disabled={!canReplay || busy || reasonLocked || unknownOutcome}
                onChange={(event) => onReplayReasonChange(event.currentTarget.value)}
                rows={3}
                placeholder="예: 전달 서비스 복구 후 실패 항목 재발송"
              />
            </label>
            <AdminSafeActionDock
              level="L3"
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
          title={events.length > 0 ? undefined : "표시할 발송 요청이 없습니다."}
          controls={
            hasMoreEvents ? (
              <button type="button" className="btn btn-quiet btn-sm" disabled={loadingMoreEvents} onClick={() => void onLoadMoreEvents?.()}>
                {loadingMoreEvents ? "불러오는 중" : "발송 요청 더 보기"}
              </button>
            ) : null
          }
        >
          {events.length > 0 ? (
            <div className="admin-notifications__rows">
              {events.map((item) => (
                <article key={item.eventId} className="admin-notifications__row">
                  <div>
                    <p className="admin-notifications__row-title">{item.club.name} · 알림 발송 요청</p>
                    {ledgerRowMeta(item.attemptCount, item.nextAttemptAt, item.updatedAt, sourceLabel(item.source))}
                    <AdminTechnicalDisclosure
                      items={[
                        { label: "발송 요청 식별자", value: item.eventId },
                        { label: "알림 유형 코드", value: item.eventType },
                        { label: "생성 경로 코드", value: item.source },
                        { label: "오류 코드", value: item.safeErrorCode },
                      ]}
                    />
                  </div>
                  <span className="platform-admin-domain-status">{deliveryLedgerStatusLabel(item.status)}</span>
                </article>
              ))}
            </div>
          ) : null}
        </AdminEvidenceLedger>

        <AdminEvidenceLedger
          label="배달 장부"
          count={deliveries.length > 0 ? deliveries.length : undefined}
          state={deliveries.length > 0 ? "ready" : "empty"}
          title={deliveries.length > 0 ? undefined : "표시할 배달 내역이 없습니다."}
          controls={
            hasMoreDeliveries ? (
              <button type="button" className="btn btn-quiet btn-sm" disabled={loadingMoreDeliveries} onClick={() => void onLoadMoreDeliveries?.()}>
                {loadingMoreDeliveries ? "불러오는 중" : "배달 내역 더 보기"}
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
                      {item.club.name} · {channelLabel(item.channel)} · {item.maskedRecipient ?? "수신자 비공개"}
                    </p>
                    {ledgerRowMeta(item.attemptCount, null, item.updatedAt)}
                    <AdminTechnicalDisclosure
                      items={[
                        { label: "배달 식별자", value: item.deliveryId },
                        { label: "발송 요청 식별자", value: item.eventId },
                        { label: "채널 코드", value: item.channel },
                        { label: "상태 코드", value: item.status },
                        { label: "오류 코드", value: item.safeErrorCode },
                      ]}
                    />
                  </div>
                  <span className="platform-admin-domain-status">{deliveryLedgerStatusLabel(item.status)}</span>
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
  const skippedReasons = Object.entries(result.skippedReasonCounts)
    .map(([reason, count]) => `${reason} ${count}`)
    .join(", ");
  return (
    <AdminReceiptTimeline
      level="L3"
      receiptId={`영수증 ${result.receiptId}`}
      entries={[
        {
          key: "replay",
          label: `재처리 ${result.replayedCount}건 · 건너뜀 ${result.skippedCount}건`,
          state: "succeeded",
          detail: skippedReasons ? (
            <AdminTechnicalDisclosure items={[{ label: "건너뜀 사유 코드", value: skippedReasons }]} />
          ) : undefined,
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
      convergence={<p>후속 배달 효과 · {effectLabel(result.effectStatus)}{availability}</p>}
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
      ? "서비스 상태의 발송 대기 신호에서 이동했습니다. 실패 묶음과 대기 중인 발송 요청을 먼저 확인하세요."
      : focus === "notification_dispatch_success"
        ? "알림 전달 상태에서 이동했습니다. 최근 성공과 실패 분포를 함께 확인하세요."
        : "서비스 상태 상세에서 이동했습니다.";
  return <p className="admin-notifications__focus">{copy}</p>;
}

function failureClusterEvidence(
  cluster: AdminNotificationOperationsSnapshot["failureClusters"][number],
  events: AdminNotificationOutboxEvent[],
  deliveries: AdminNotificationDelivery[],
): { clubLabel: string; eventType: string | null } {
  const matchingEvent = events.find((item) => item.safeErrorCode === cluster.safeErrorCode);
  const matchingDelivery = deliveries.find((item) => item.safeErrorCode === cluster.safeErrorCode);
  return {
    clubLabel: matchingEvent?.club.name ?? matchingDelivery?.club.name ?? "여러 클럽",
    eventType: matchingEvent?.eventType ?? null,
  };
}

function notificationOverview(snapshot: AdminNotificationOperationsSnapshot | null) {
  if (!snapshot) {
    return {
      operatorSentence: "알림 전달 상태를 확인할 수 없습니다.",
      nextSafeAction: "잠시 뒤 다시 확인하세요.",
    };
  }
  const outboxFailures = snapshot.outboxSummary.failed + snapshot.outboxSummary.dead;
  const deliveryFailures = snapshot.deliverySummary.failed + snapshot.deliverySummary.dead;
  const relayDelays = snapshot.relaySummary.stalePublishing + snapshot.relaySummary.staleSending;
  if (outboxFailures + deliveryFailures + relayDelays === 0) {
    return {
      operatorSentence: "지금 확인할 알림 전달 이상은 없습니다.",
      nextSafeAction: "새 실패 신호가 생기기 전에는 별도 조치가 필요하지 않습니다.",
    };
  }
  return {
    operatorSentence: `발송 실패 ${outboxFailures}건, 배달 실패 ${deliveryFailures}건, 중계 지연 ${relayDelays}건을 확인해야 합니다.`,
    nextSafeAction: "같은 원인의 실패와 자동 재시도 상태를 확인한 뒤 필요한 항목만 수동 재발송하세요.",
  };
}

function sourceLabel(source: AdminNotificationOutboxEvent["source"]) {
  return source === "MANUAL" ? "수동 요청" : "자동 요청";
}

function channelLabel(channel: AdminNotificationDelivery["channel"]) {
  return channel === "EMAIL" ? "이메일 배달" : "앱 안 알림";
}

function ledgerRowMeta(
  attemptCount: number,
  nextAttemptAt: string | null,
  updatedAt: string,
  source?: string,
) {
  return (
    <p className="small muted">
      {source ? <>{source} · </> : null}
      {attemptCount > 0 ? (
        <span className="admin-notifications__attempt">{deliveryAttemptBadge(attemptCount)}</span>
      ) : null}
      {nextAttemptAt ? (
        <>
          {attemptCount > 0 ? " · " : null}
          {ADMIN_COPY.nextRetry} {formatTimestamp(nextAttemptAt)}
        </>
      ) : null}
      <>
        {attemptCount > 0 || nextAttemptAt ? " · " : null}
        {formatTimestamp(updatedAt)}
      </>
    </p>
  );
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
