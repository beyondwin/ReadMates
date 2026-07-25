
import { type FormEvent, useState } from "react";
import { HostNotificationOperationsRail } from "./notifications/host-notification-operations-rail";
import { ManualNotificationWorkbench } from "./notifications/manual-notification-workbench";
import { NotificationOperationsDisclosure } from "./notifications/notification-operations-disclosure";
import type {
  HostSessionListItem,
  HostNotificationEventType,
  HostNotificationPolicyResponse,
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
  hostSessions?: HostSessionListItem[];
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
  manualPending?: boolean;
  policy?: HostNotificationPolicyResponse;
  policyPending?: boolean;
  policyError?: string | null;
  policyLoadError?: string | null;
  policyLoading?: boolean;
  onPolicyChange?: (enabled: boolean) => Promise<unknown>;
  onPolicyRetry?: () => Promise<unknown>;
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
  hostSessions = [],
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
  manualPending = false,
  policy,
  policyPending = false,
  policyError = null,
  policyLoadError = null,
  policyLoading = false,
  onPolicyChange = async () => undefined,
  onPolicyRetry = async () => undefined,
}: HostNotificationsPageProps) {
  const [restoreTarget, setRestoreTarget] = useState<HostNotificationDeliveryItem | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [testEmail, setTestEmail] = useState("");
  const [message, setMessage] = useState<HostNotificationMessage | null>(null);
  const [manualPreview, setManualPreview] = useState<ManualNotificationPreviewResponse | null>(null);
  const [manualError, setManualError] = useState<string | null>(null);
  const manualBusy = manualPending;
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const processableCount = Math.max(0, summary.pending) + Math.max(0, summary.failed);
  const hasVisibleProcessableDelivery = deliveries.some(
    (item) => item.status === "PENDING" || item.status === "FAILED",
  );
  const hasVisibleProcessableEvent = events.some(
    (item) => item.status === "PENDING" || item.status === "FAILED",
  );
  const hasProcessableNotifications =
    processableCount > 0
    || hasVisibleProcessableDelivery
    || hasVisibleProcessableEvent;
  const isBusy = pendingAction !== null || manualBusy || isRefreshing;
  const visibleManualOptions = manualOptions;
  const visibleManualDispatches = manualDispatches ?? manualOptions.recentDispatches;

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

    setManualError(null);
    setManualPreview(null);
    try {
      const preview = await onPreviewManual(request);
      setManualPreview(preview);
    } catch {
      setManualError("미리보기를 만들지 못했습니다. 세션과 대상 조건을 확인해 주세요.");
    }
  };

  const handleManualConfirm = async (request: ManualNotificationConfirmRequest) => {
    if (isBusy) {
      return;
    }

    setManualError(null);
    try {
      await onConfirmManual(request);
      setManualPreview(null);
      setMessage({ kind: "status", text: "수동 알림 발송을 요청했습니다." });
    } catch {
      setManualError("발송을 요청하지 못했습니다. 미리보기 만료 또는 중복 발송 여부를 확인해 주세요.");
    }
  };

  const handleManualSessionChange = async (sessionId: string) => {
    if (!onLoadManualOptions) return visibleManualOptions;
    setManualError(null);
    setManualPreview(null);
    try {
      return await onLoadManualOptions(sessionId, undefined);
    } catch (error) {
      setManualError("세션 정보를 불러오지 못했습니다.");
      throw error;
    }
  };

  const handleLoadManualOptions = async (sessionId?: string, search?: string) => {
    if (!onLoadManualOptions) return visibleManualOptions;
    return onLoadManualOptions(sessionId, search);
  };

  const handleLoadMoreManualMembers = async (sessionId?: string, search?: string, cursor?: string) => {
    if (!onLoadMoreManualMembers || !cursor) return visibleManualOptions;
    return onLoadMoreManualMembers(sessionId, search, cursor);
  };

  return (
    <main className="rm-host-notifications-page">
      <header className="rm-host-notifications-page__header">
        <div className="container">
          <div className="eyebrow">운영 · 알림 발송</div>
          <h1>알림 발송 작업대</h1>
          <p>필요한 알림을 고르고, 확인한 뒤 발송합니다.</p>
        </div>
      </header>

      <div className="container rm-host-notifications-page__body">
        {message ? (
          <p role={message.kind === "alert" ? "alert" : "status"}>
            {message.text}
          </p>
        ) : null}

        <HostNotificationOperationsRail
          summary={summary}
          policy={policy}
          processableCount={processableCount}
          hasProcessableNotifications={hasProcessableNotifications}
          processPending={isPending("process")}
          isRefreshing={isRefreshing}
          onProcess={handleProcess}
          onPolicyChange={onPolicyChange}
          onPolicyRetry={onPolicyRetry}
          policyPending={policyPending}
          policyError={policyError}
          policyLoadError={policyLoadError}
          policyLoading={policyLoading}
        />

        <ManualNotificationWorkbench
          options={visibleManualOptions}
          hostSessions={hostSessions}
          initialSessionId={initialManualSelection.sessionId}
          initialEventType={initialManualSelection.eventType}
          preview={manualPreview}
          busy={manualBusy || isRefreshing}
          error={manualError}
          onPreview={handleManualPreview}
          onConfirm={handleManualConfirm}
          onPreviewDismiss={() => {
            setManualPreview(null);
            setManualError(null);
          }}
          onSessionChange={handleManualSessionChange}
          onLoadManualOptions={handleLoadManualOptions}
          onLoadMoreManualMembers={handleLoadMoreManualMembers}
          onDraftInvalidated={() => {
            setManualPreview(null);
            setManualError(null);
          }}
        />

        <ManualNotificationDispatchLedger
          variant="recent"
          limit={3}
          dispatches={visibleManualDispatches}
        />

        <NotificationOperationsDisclosure
          summary={summary}
          events={events}
          deliveries={deliveries}
          manualDispatches={visibleManualDispatches}
          audit={audit}
          retryPendingId={pendingAction?.kind === "retry" ? pendingAction.id : null}
          restorePendingId={pendingAction?.kind === "restore" ? pendingAction.id : null}
          disabled={isBusy}
          hasMoreEvents={hasMoreEvents}
          hasMoreDeliveries={hasMoreDeliveries}
          hasMoreManualDispatches={hasMoreManualDispatches}
          hasMoreAudit={hasMoreAudit}
          isLoadingMoreEvents={isLoadingMoreEvents}
          isLoadingMoreDeliveries={isLoadingMoreDeliveries}
          isLoadingMoreManualDispatches={isLoadingMoreManualDispatches}
          isLoadingMoreAudit={isLoadingMoreAudit}
          testMailValue={testEmail}
          testMailPending={isPending("test-mail")}
          onTestMailValueChange={setTestEmail}
          onSubmitTestMail={submitTestMail}
          onRetry={handleRetry}
          onRestore={(item) => {
            setRestoreError(null);
            setRestoreTarget(item);
          }}
          onLoadMoreEvents={onLoadMoreEvents}
          onLoadMoreDeliveries={onLoadMoreDeliveries}
          onLoadMoreManualDispatches={onLoadMoreManualDispatches}
          onLoadMoreAudit={onLoadMoreAudit}
        />
      </div>

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
