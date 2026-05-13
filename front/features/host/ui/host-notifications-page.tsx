
import {
  type CSSProperties,
  type FormEvent,
  useState,
} from "react";
import { formatDateOnlyLabel } from "@/shared/ui/readmates-display";
import { HostNotificationsSummary } from "./notifications/host-notifications-summary";
import { ManualNotificationWorkbench } from "./notifications/manual-notification-workbench";
import { NotificationLedgerTabs } from "./notifications/notification-ledger-tabs";
import type {
  HostNotificationEventType,
  ManualNotificationConfirmRequest,
  ManualNotificationDispatchListItem,
  ManualNotificationOptionsResponse,
  ManualNotificationPreviewRequest,
  ManualNotificationPreviewResponse,
} from "@/features/host/model/host-view-types";
import {
  type HostNotificationDeliveryItem,
  type HostNotificationEventItem,
  type HostNotificationSummary,
  maskRecipient,
  type NotificationLedgerTab,
  type NotificationTestMailAuditItem,
  type SendNotificationTestMailRequest,
} from "./notifications/notification-formatters";
import { RestoreNotificationDialog } from "./notifications/restore-notification-dialog";
import { ManualNotificationDispatchLedger } from "./notifications/manual-notification-dispatch-ledger";

type HostNotificationsPageProps = {
  summary: HostNotificationSummary;
  events: HostNotificationEventItem[];
  deliveries: HostNotificationDeliveryItem[];
  audit: NotificationTestMailAuditItem[];
  manualOptions: ManualNotificationOptionsResponse;
  manualDispatches?: ManualNotificationDispatchListItem[];
  initialManualSelection: {
    sessionId: string | null;
    eventType: HostNotificationEventType | null;
  };
  hasMoreEvents?: boolean;
  hasMoreDeliveries?: boolean;
  hasMoreAudit?: boolean;
  hasMoreManualDispatches?: boolean;
  isLoadingMoreEvents?: boolean;
  isLoadingMoreDeliveries?: boolean;
  isLoadingMoreAudit?: boolean;
  isLoadingMoreManualDispatches?: boolean;
  onProcess: () => Promise<unknown>;
  onRetry: (id: string) => Promise<unknown>;
  onRestore: (id: string) => Promise<unknown>;
  onSendTestMail: (request: SendNotificationTestMailRequest) => Promise<unknown>;
  onPreviewManual: (request: ManualNotificationPreviewRequest) => Promise<ManualNotificationPreviewResponse>;
  onConfirmManual: (request: ManualNotificationConfirmRequest) => Promise<unknown>;
  onLoadMoreEvents?: () => Promise<unknown>;
  onLoadMoreDeliveries?: () => Promise<unknown>;
  onLoadMoreAudit?: () => Promise<unknown>;
  onLoadMoreManualDispatches?: () => Promise<unknown>;
  onLoadManualOptions?: (sessionId?: string, search?: string) => Promise<ManualNotificationOptionsResponse>;
  onLoadMoreManualMembers?: (sessionId?: string, search?: string, cursor?: string) => Promise<ManualNotificationOptionsResponse>;
  isRefreshing?: boolean;
};

type HostNotificationMessage = {
  kind: "alert" | "status";
  text: string;
};

type PendingAction =
  | { kind: "process" }
  | { kind: "retry"; id: string }
  | { kind: "restore"; id: string }
  | { kind: "test-mail" };

export function HostNotificationsPage({
  summary,
  events,
  deliveries,
  audit,
  manualOptions,
  manualDispatches,
  initialManualSelection,
  hasMoreEvents = false,
  hasMoreDeliveries = false,
  hasMoreAudit = false,
  hasMoreManualDispatches = false,
  isLoadingMoreEvents = false,
  isLoadingMoreDeliveries = false,
  isLoadingMoreAudit = false,
  isLoadingMoreManualDispatches = false,
  onProcess,
  onRetry,
  onRestore,
  onSendTestMail,
  onPreviewManual,
  onConfirmManual,
  onLoadMoreEvents,
  onLoadMoreDeliveries,
  onLoadMoreAudit,
  onLoadMoreManualDispatches,
  onLoadManualOptions,
  onLoadMoreManualMembers,
  isRefreshing = false,
}: HostNotificationsPageProps) {
  const [activeLedgerTab, setActiveLedgerTab] = useState<NotificationLedgerTab>("events");
  const [restoreTarget, setRestoreTarget] = useState<HostNotificationDeliveryItem | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [testEmail, setTestEmail] = useState("");
  const [message, setMessage] = useState<HostNotificationMessage | null>(null);
  const [manualPreview, setManualPreview] = useState<ManualNotificationPreviewResponse | null>(null);
  const [manualOptionsState, setManualOptionsState] = useState(() => ({
    source: manualOptions,
    value: manualOptions,
  }));
  const [manualError, setManualError] = useState<string | null>(null);
  const [manualBusy, setManualBusy] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const processableNotificationCount = Math.max(0, summary.pending) + Math.max(0, summary.failed);
  const hasVisibleProcessableDelivery = deliveries.some(
    (delivery) => delivery.channel === "EMAIL" && (delivery.status === "PENDING" || delivery.status === "FAILED"),
  );
  const hasVisibleProcessableEvent = events.some((event) => event.status === "PENDING" || event.status === "FAILED");
  const hasProcessableNotifications = processableNotificationCount > 0 || hasVisibleProcessableDelivery || hasVisibleProcessableEvent;
  const isBusy = pendingAction !== null || manualBusy || isRefreshing;
  if (manualOptionsState.source !== manualOptions) {
    setManualOptionsState({
      source: manualOptions,
      value: manualOptions,
    });
  }
  const visibleManualOptions = manualOptionsState.source === manualOptions ? manualOptionsState.value : manualOptions;
  const visibleManualDispatches = manualDispatches ?? visibleManualOptions.recentDispatches;

  const isPending = (kind: PendingAction["kind"], id?: string) => {
    if (!pendingAction || pendingAction.kind !== kind) {
      return false;
    }

    return "id" in pendingAction ? pendingAction.id === id : true;
  };

  const runAction = async (action: PendingAction, callback: () => Promise<unknown>, successMessage: string) => {
    if (isBusy) {
      return;
    }

    setPendingAction(action);
    setMessage(null);
    try {
      await callback();
      setMessage({ kind: "status", text: successMessage });
    } catch {
      setMessage({ kind: "alert", text: "작업을 완료하지 못했습니다. 목록을 새로고침한 뒤 다시 시도해 주세요." });
    } finally {
      setPendingAction(null);
    }
  };

  const handleProcess = () => {
    if (!hasProcessableNotifications) {
      return;
    }

    void runAction({ kind: "process" }, onProcess, "대기/실패 알림 처리를 요청했습니다.");
  };

  const handleRetry = (item: HostNotificationDeliveryItem) => {
    void runAction({ kind: "retry", id: item.id }, () => onRetry(item.id), "알림 재시도를 요청했습니다.");
  };

  const handleRestore = (item: HostNotificationDeliveryItem) => {
    if (isBusy) {
      return;
    }

    setPendingAction({ kind: "restore", id: item.id });
    setMessage(null);
    setRestoreError(null);

    void (async () => {
      try {
        await onRestore(item.id);
        setRestoreTarget(null);
        setMessage({ kind: "status", text: "중단된 알림을 발송 대기 상태로 복구했습니다." });
      } catch {
        setRestoreError("복구하지 못했습니다. 목록을 새로고침한 뒤 다시 시도해 주세요.");
      } finally {
        setPendingAction(null);
      }
    })();
  };

  const submitTestMail = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const recipientEmail = testEmail.trim();
    if (!recipientEmail) {
      setMessage({ kind: "alert", text: "테스트 메일 주소를 입력해 주세요." });
      return;
    }

    void runAction({ kind: "test-mail" }, async () => {
      await onSendTestMail({ recipientEmail });
      setTestEmail("");
    }, "테스트 메일 발송을 요청했습니다.");
  };

  const handleManualPreview = async (request: ManualNotificationPreviewRequest) => {
    if (isBusy) {
      return;
    }

    setManualBusy(true);
    setManualError(null);
    setManualPreview(null);
    try {
      const preview = await onPreviewManual(request);
      setManualPreview(preview);
    } catch {
      setManualError("미리보기를 만들지 못했습니다. 세션과 대상 조건을 확인해 주세요.");
    } finally {
      setManualBusy(false);
    }
  };

  const handleManualConfirm = async (request: ManualNotificationConfirmRequest) => {
    if (isBusy) {
      return;
    }

    setManualBusy(true);
    setManualError(null);
    try {
      await onConfirmManual(request);
      setManualPreview(null);
      setMessage({ kind: "status", text: "수동 알림 발송을 요청했습니다." });
    } catch {
      setManualError("발송을 요청하지 못했습니다. 미리보기 만료 또는 중복 발송 여부를 확인해 주세요.");
    } finally {
      setManualBusy(false);
    }
  };

  const handleLoadManualOptions = async (sessionId?: string, search?: string) => {
    if (!onLoadManualOptions) return visibleManualOptions;
    const nextOptions = await onLoadManualOptions(sessionId, search);
    setManualOptionsState((current) => ({
      ...current,
      value: nextOptions,
    }));
    return nextOptions;
  };

  const handleLoadMoreManualMembers = async (sessionId?: string, search?: string, cursor?: string) => {
    if (!onLoadMoreManualMembers || !cursor) return visibleManualOptions;
    const nextOptions = await onLoadMoreManualMembers(sessionId, search, cursor);
    setManualOptionsState((current) => ({
      ...current,
      value: {
        ...nextOptions,
        members: {
          items: [...current.value.members.items, ...nextOptions.members.items],
          nextCursor: nextOptions.members.nextCursor,
        },
      },
    }));
    return nextOptions;
  };

  return (
    <main className="rm-host-notifications-page">
      <section className="page-header-compact">
        <div className="container">
          <div className="row-between" style={{ alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
            <div>
              <div className="eyebrow">운영 · 알림 발송</div>
              <h1 className="h1 editorial" style={{ margin: "6px 0 4px" }}>
                알림 발송 장부
              </h1>
              <p className="small" style={{ color: "var(--text-2)", margin: 0 }}>
                Kafka 이벤트와 배송 상태를 나누어 확인하고 필요한 작업만 실행합니다.
              </p>
            </div>
            <button
              className="btn btn-primary btn-sm"
              type="button"
              disabled={isBusy || !hasProcessableNotifications}
              onClick={handleProcess}
            >
              {isPending("process")
                ? "처리 중"
                : isRefreshing
                  ? "새로고침 중"
                  : hasProcessableNotifications
                    ? "대기/실패 처리"
                    : "처리할 알림 없음"}
            </button>
          </div>
        </div>
      </section>

      <section className="container rm-host-notifications-page__body" style={{ paddingTop: 8, paddingBottom: 72 }}>
        {message ? (
          <p
            role={message.kind === "alert" ? "alert" : "status"}
            className="small"
            style={{
              color: message.kind === "alert" ? "var(--danger)" : "var(--text-2)",
              margin: "0 0 14px",
            }}
          >
            {message.text}
          </p>
        ) : null}

        <ManualNotificationWorkbench
          options={visibleManualOptions}
          initialSessionId={initialManualSelection.sessionId}
          initialEventType={initialManualSelection.eventType}
          preview={manualPreview}
          busy={manualBusy || isRefreshing}
          error={manualError}
          onPreview={handleManualPreview}
          onConfirm={handleManualConfirm}
          onLoadManualOptions={handleLoadManualOptions}
          onLoadMoreManualMembers={handleLoadMoreManualMembers}
        />

        <ManualNotificationDispatchLedger
          dispatches={visibleManualDispatches}
          hasMore={hasMoreManualDispatches}
          loading={isLoadingMoreManualDispatches}
          onLoadMore={onLoadMoreManualDispatches}
        />

        <HostNotificationsSummary summary={summary} />

        <div
          className="rm-host-notifications-page__layout"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))",
            gap: 24,
            alignItems: "start",
          }}
        >
          <NotificationLedgerTabs
            events={events}
            deliveries={deliveries}
            activeLedgerTab={activeLedgerTab}
            retryPendingId={pendingAction?.kind === "retry" ? pendingAction.id : null}
            restorePendingId={pendingAction?.kind === "restore" ? pendingAction.id : null}
            disabled={isBusy}
            hasMoreEvents={hasMoreEvents}
            hasMoreDeliveries={hasMoreDeliveries}
            isLoadingMoreEvents={isLoadingMoreEvents}
            isLoadingMoreDeliveries={isLoadingMoreDeliveries}
            onActiveLedgerTabChange={setActiveLedgerTab}
            onRetry={handleRetry}
            onRestore={(item) => {
              setRestoreError(null);
              setRestoreTarget(item);
            }}
            onLoadMoreEvents={onLoadMoreEvents}
            onLoadMoreDeliveries={onLoadMoreDeliveries}
          />

          <section className="surface" aria-labelledby="test-mail-title" style={{ padding: 22 }}>
            <h2 id="test-mail-title" className="h3 editorial" style={{ margin: 0 }}>
              테스트 메일
            </h2>
            <form onSubmit={submitTestMail} className="stack" style={{ "--stack": "12px", marginTop: 14 } as CSSProperties}>
              <div>
                <label className="label" htmlFor="notification-test-mail">
                  테스트 메일 주소
                </label>
                <input
                  id="notification-test-mail"
                  className="input"
                  type="email"
                  value={testEmail}
                  onChange={(event) => setTestEmail(event.currentTarget.value)}
                  aria-label="테스트 메일 주소"
                  autoComplete="email"
                  required
                />
              </div>
              <button className="btn btn-primary btn-sm" type="submit" disabled={isBusy}>
                {isPending("test-mail") ? "발송 중" : "테스트 발송"}
              </button>
            </form>

            <div style={{ marginTop: 20 }}>
              <div className="eyebrow" style={{ marginBottom: 8 }}>
                테스트 발송 기록
              </div>
              {audit.length > 0 ? (
                <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                  {audit.map((row, index) => (
                    <li
                      key={row.id}
                      className="row-between"
                      style={{
                        gap: 10,
                        padding: "10px 0",
                        borderTop: index === 0 ? undefined : "1px solid var(--line-soft)",
                      }}
                    >
                      <span style={{ minWidth: 0 }}>
                        <strong className="tiny mono" style={{ display: "block", color: "var(--text)" }}>
                          {maskRecipient(row.recipientEmail)}
                        </strong>
                        <span className="tiny" style={{ color: "var(--text-3)" }}>
                          {formatDateOnlyLabel(row.createdAt)}
                        </span>
                      </span>
                      <span className={row.status === "SENT" ? "badge badge-ok badge-dot" : "badge badge-warn badge-dot"}>
                        {row.status}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="small" style={{ color: "var(--text-2)", margin: 0 }}>
                  테스트 발송 기록이 없습니다.
                </p>
              )}
              {hasMoreAudit && onLoadMoreAudit ? (
                <LoadMoreButton loading={isLoadingMoreAudit} onLoadMore={onLoadMoreAudit} />
              ) : null}
            </div>
          </section>
        </div>
      </section>

      {restoreTarget ? (
        <RestoreNotificationDialog
          item={restoreTarget}
          submitting={isPending("restore", restoreTarget.id)}
          error={restoreError}
          onClose={() => setRestoreTarget(null)}
          onConfirm={() => handleRestore(restoreTarget)}
        />
      ) : null}
    </main>
  );
}

function LoadMoreButton({ loading, onLoadMore }: { loading: boolean; onLoadMore: () => Promise<unknown> }) {
  return (
    <button
      type="button"
      className="btn btn-quiet btn-sm"
      disabled={loading}
      style={{ marginTop: 12 }}
      onClick={() => void onLoadMore()}
    >
      {loading ? "불러오는 중" : "더 보기"}
    </button>
  );
}
