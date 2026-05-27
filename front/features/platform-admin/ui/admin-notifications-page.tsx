import type { ReactNode } from "react";
import type {
  AdminNotificationDelivery,
  AdminNotificationOperationsSnapshot,
  AdminNotificationOutboxEvent,
  AdminNotificationReplayPreview,
} from "@/features/platform-admin/model/platform-admin-notifications-model";

export type AdminNotificationsPageProps = {
  snapshot: AdminNotificationOperationsSnapshot;
  events: AdminNotificationOutboxEvent[];
  deliveries: AdminNotificationDelivery[];
  focus: string | null;
  replayPreview: AdminNotificationReplayPreview | null;
  replayReason: string;
  canReplay: boolean;
  busy: boolean;
  error: string | null;
  success: string | null;
  onPreviewReplay: () => Promise<void>;
  onConfirmReplay: () => Promise<void>;
  onReplayReasonChange: (value: string) => void;
};

export function AdminNotificationsPage({
  snapshot,
  events,
  deliveries,
  focus,
  replayPreview,
  replayReason,
  canReplay,
  busy,
  error,
  success,
  onPreviewReplay,
  onConfirmReplay,
  onReplayReasonChange,
}: AdminNotificationsPageProps) {
  const confirmDisabled = !replayPreview || !replayReason.trim() || !canReplay || busy;

  return (
    <section className="admin-notifications" aria-labelledby="admin-notifications-title">
      <header className="admin-notifications__header">
        <div>
          <p className="eyebrow">S5 Operations</p>
          <h1 id="admin-notifications-title" className="h1 editorial">
            알림 / Outbox 운영
          </h1>
        </div>
        <p className="admin-notifications__timestamp">생성 {formatTimestamp(snapshot.generatedAt)}</p>
      </header>

      {focus ? <FocusBanner focus={focus} /> : null}
      {error ? <p className="admin-notifications__error" role="alert">{error}</p> : null}
      {success ? <p className="admin-notifications__success" role="status">{success}</p> : null}

      <div className="admin-notifications__summary" aria-label="알림 운영 요약">
        <Metric label="Outbox pending" value={snapshot.outboxSummary.pending} />
        <Metric label="Outbox failed" value={snapshot.outboxSummary.failed + snapshot.outboxSummary.dead} />
        <Metric label="Delivery pending" value={snapshot.deliverySummary.pending} />
        <Metric label="Delivery failed" value={snapshot.deliverySummary.failed + snapshot.deliverySummary.dead} />
        <Metric label="Relay stale" value={snapshot.relaySummary.stalePublishing + snapshot.relaySummary.staleSending} />
      </div>

      <div className="admin-notifications__grid">
        <section className="admin-notifications__panel" aria-labelledby="admin-notifications-failures-title">
          <h2 id="admin-notifications-failures-title" className="h3 editorial">Failure clusters</h2>
          {snapshot.failureClusters.length > 0 ? (
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
            <h2 id="admin-notifications-replay-title" className="h3 editorial">Replay</h2>
            {busy ? <span className="platform-admin-domain-status">처리 중</span> : null}
          </div>
          {!canReplay ? <p className="muted">현재 역할은 재처리를 실행할 수 없습니다.</p> : null}
          {replayPreview ? (
            <div className="admin-notifications__preview">
              <p>
                대상 <strong>{replayPreview.matchedCount}</strong>건 · 제외 {replayPreview.excludedCount}건
              </p>
              <p className="tiny muted">만료 {formatTimestamp(replayPreview.expiresAt)}</p>
            </div>
          ) : (
            <p className="muted">실패/Dead delivery를 확인한 뒤 사유를 남기고 재처리합니다.</p>
          )}
          <label className="admin-notifications__reason">
            <span>처리 사유</span>
            <textarea
              value={replayReason}
              onChange={(event) => onReplayReasonChange(event.currentTarget.value)}
              rows={3}
              placeholder="예: 공급자 복구 후 실패 delivery 재처리"
            />
          </label>
          <div className="admin-notifications__actions">
            <button type="button" className="btn btn-quiet btn-sm" disabled={!canReplay || busy} onClick={() => void onPreviewReplay()}>
              대상 확인
            </button>
            <button type="button" className="btn btn-primary btn-sm" disabled={confirmDisabled} onClick={() => void onConfirmReplay()}>
              재처리 확정
            </button>
          </div>
        </section>
      </div>

      <LedgerSection title="Outbox ledger" empty="표시할 outbox event가 없습니다.">
        {events.map((event) => (
          <article key={event.eventId} className="admin-notifications__row">
            <div>
              <p className="admin-notifications__row-title">{event.club.name} · {event.eventType}</p>
              <p className="tiny muted">{event.source} · attempts {event.attemptCount} · {formatTimestamp(event.updatedAt)}</p>
            </div>
            <span className="platform-admin-domain-status">{event.status}</span>
            {event.safeErrorCode ? <span className="admin-notifications__safe-code">{event.safeErrorCode}</span> : null}
          </article>
        ))}
      </LedgerSection>

      <LedgerSection title="Delivery ledger" empty="표시할 delivery가 없습니다.">
        {deliveries.map((delivery) => (
          <article key={delivery.deliveryId} className="admin-notifications__row">
            <div>
              <p className="admin-notifications__row-title">
                {delivery.club.name} · {delivery.channel} · {delivery.maskedRecipient ?? "recipient masked"}
              </p>
              <p className="tiny muted">attempts {delivery.attemptCount} · {formatTimestamp(delivery.updatedAt)}</p>
            </div>
            <span className="platform-admin-domain-status">{delivery.status}</span>
            {delivery.safeErrorCode ? <span className="admin-notifications__safe-code">{delivery.safeErrorCode}</span> : null}
          </article>
        ))}
      </LedgerSection>
    </section>
  );
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

function LedgerSection({ title, empty, children }: { title: string; empty: string; children: ReactNode[] }) {
  return (
    <section className="admin-notifications__ledger" aria-labelledby={`${title.replace(/\s+/g, "-").toLowerCase()}-title`}>
      <h2 id={`${title.replace(/\s+/g, "-").toLowerCase()}-title`} className="h3 editorial">{title}</h2>
      {children.length > 0 ? <div className="admin-notifications__rows">{children}</div> : <p className="muted">{empty}</p>}
    </section>
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
