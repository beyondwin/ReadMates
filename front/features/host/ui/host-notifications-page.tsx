"use client";

import {
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { formatDateOnlyLabel } from "@/shared/ui/readmates-display";

type HostNotificationStatus = "PENDING" | "SENDING" | "SENT" | "FAILED" | "DEAD";
type HostNotificationEventType =
  | "NEXT_BOOK_PUBLISHED"
  | "SESSION_REMINDER_DUE"
  | "FEEDBACK_DOCUMENT_PUBLISHED"
  | "REVIEW_PUBLISHED";

type HostNotificationSummary = {
  pending: number;
  failed: number;
  dead: number;
  sentLast24h: number;
};

type HostNotificationItem = {
  id: string;
  eventType: HostNotificationEventType;
  status: HostNotificationStatus;
  recipientEmail: string;
  attemptCount: number;
  nextAttemptAt: string;
  updatedAt: string;
};

type NotificationTestMailAuditItem = {
  id: string;
  recipientEmail: string;
  status: "SENT" | "FAILED";
  lastError: string | null;
  createdAt: string;
};

type SendNotificationTestMailRequest = {
  recipientEmail: string;
};

type HostNotificationsPageProps = {
  summary: HostNotificationSummary;
  items: HostNotificationItem[];
  audit: NotificationTestMailAuditItem[];
  onProcess: () => Promise<unknown>;
  onRetry: (id: string) => Promise<unknown>;
  onRestore: (id: string) => Promise<unknown>;
  onSendTestMail: (request: SendNotificationTestMailRequest) => Promise<unknown>;
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

const eventLabels: Record<HostNotificationEventType, string> = {
  NEXT_BOOK_PUBLISHED: "다음 책 공개",
  SESSION_REMINDER_DUE: "세션 리마인더",
  FEEDBACK_DOCUMENT_PUBLISHED: "피드백 문서 공개",
  REVIEW_PUBLISHED: "리뷰 공개",
};

const statusLabels: Record<HostNotificationStatus, string> = {
  PENDING: "대기",
  SENDING: "발송 중",
  SENT: "발송됨",
  FAILED: "실패",
  DEAD: "중단",
};

export function HostNotificationsPage({
  summary,
  items,
  audit,
  onProcess,
  onRetry,
  onRestore,
  onSendTestMail,
  isRefreshing = false,
}: HostNotificationsPageProps) {
  const [restoreTarget, setRestoreTarget] = useState<HostNotificationItem | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [testEmail, setTestEmail] = useState("");
  const [message, setMessage] = useState<HostNotificationMessage | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const processableNotificationCount = Math.max(0, summary.pending) + Math.max(0, summary.failed);
  const hasVisibleProcessableNotifications = items.some((item) => item.status === "PENDING" || item.status === "FAILED");
  const hasProcessableNotifications = processableNotificationCount > 0 || hasVisibleProcessableNotifications;
  const isBusy = pendingAction !== null || isRefreshing;

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

  const handleRetry = (item: HostNotificationItem) => {
    void runAction({ kind: "retry", id: item.id }, () => onRetry(item.id), "알림 재시도를 요청했습니다.");
  };

  const handleRestore = (item: HostNotificationItem) => {
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
                대기, 실패, 중단 상태를 한 화면에서 확인하고 필요한 작업만 실행합니다.
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

        <section className="rm-document-panel" aria-label="알림 발송 요약" style={{ padding: "18px 22px", marginBottom: 20 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(126px, 1fr))",
              gap: 12,
            }}
          >
            <SummaryCount label="대기" value={summary.pending} tone={summary.pending > 0 ? "accent" : "default"} />
            <SummaryCount label="실패" value={summary.failed} tone={summary.failed > 0 ? "warn" : "default"} />
            <SummaryCount label="중단" value={summary.dead} tone={summary.dead > 0 ? "warn" : "default"} />
            <SummaryCount label="최근 24시간" value={summary.sentLast24h} tone="ok" />
          </div>
        </section>

        <div
          className="rm-host-notifications-page__layout"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))",
            gap: 24,
            alignItems: "start",
          }}
        >
          <section className="surface" aria-labelledby="notification-items-title" style={{ padding: 22 }}>
            <div className="row-between" style={{ gap: 14, alignItems: "baseline", marginBottom: 12 }}>
              <h2 id="notification-items-title" className="h3 editorial" style={{ margin: 0 }}>
                발송 목록
              </h2>
              <span className="tiny mono" style={{ color: "var(--text-3)" }}>
                {items.length}건
              </span>
            </div>

            {items.length > 0 ? (
              <div className="stack" style={{ "--stack": "0px" } as CSSProperties}>
                {items.map((item, index) => (
                  <NotificationRow
                    key={item.id}
                    item={item}
                    isFirst={index === 0}
                    retryPending={isPending("retry", item.id)}
                    restorePending={isPending("restore", item.id)}
                    disabled={isBusy}
                    onRetry={() => handleRetry(item)}
                    onRestore={() => {
                      setRestoreError(null);
                      setRestoreTarget(item);
                    }}
                  />
                ))}
              </div>
            ) : (
              <p className="small" style={{ color: "var(--text-2)", margin: 0 }}>
                표시할 알림 발송 기록이 없습니다.
              </p>
            )}
          </section>

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

function SummaryCount({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "accent" | "default" | "ok" | "warn";
}) {
  return (
    <div>
      <div className="tiny" style={{ color: "var(--text-3)" }}>
        {label}
      </div>
      <div className="row" style={{ gap: 8, alignItems: "baseline", marginTop: 4 }}>
        <strong className="h3 mono" style={{ margin: 0 }}>
          {Math.max(0, value)}
        </strong>
        <span className={summaryBadgeClass(tone)}>건</span>
      </div>
    </div>
  );
}

function NotificationRow({
  item,
  isFirst,
  retryPending,
  restorePending,
  disabled,
  onRetry,
  onRestore,
}: {
  item: HostNotificationItem;
  isFirst: boolean;
  retryPending: boolean;
  restorePending: boolean;
  disabled: boolean;
  onRetry: () => void;
  onRestore: () => void;
}) {
  const canRetry = item.status === "PENDING" || item.status === "FAILED";
  const canRestore = item.status === "DEAD";

  return (
    <article
      className="row-between"
      style={{
        gap: 14,
        alignItems: "center",
        padding: "14px 0",
        borderTop: isFirst ? undefined : "1px solid var(--line-soft)",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <strong className="body" style={{ minWidth: 0 }}>
            {eventLabels[item.eventType]}
          </strong>
          <span className={statusBadgeClass(item.status)}>{item.status}</span>
        </div>
        <div className="tiny" style={{ color: "var(--text-2)", marginTop: 5 }}>
          <span>{maskRecipient(item.recipientEmail)}</span>
          <span> · {statusLabels[item.status]} · </span>
          <span>{Math.max(0, item.attemptCount)}회 시도</span>
        </div>
        <div className="tiny" style={{ color: "var(--text-3)", marginTop: 3 }}>
          업데이트 {formatDateOnlyLabel(item.updatedAt)}
        </div>
      </div>
      <div className="row" style={{ gap: 8, flex: "0 0 auto" }}>
        {canRetry ? (
          <button className="btn btn-quiet btn-sm" type="button" disabled={disabled} onClick={onRetry}>
            {retryPending ? "재시도 중" : "재시도"}
          </button>
        ) : null}
        {canRestore ? (
          <button className="btn btn-quiet btn-sm" type="button" disabled={disabled} onClick={onRestore}>
            {restorePending ? "복구 중" : "복구"}
          </button>
        ) : null}
      </div>
    </article>
  );
}

function RestoreNotificationDialog({
  item,
  submitting,
  error,
  onClose,
  onConfirm,
}: {
  item: HostNotificationItem;
  submitting: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    confirmButtonRef.current?.focus();

    return () => {
      previousFocus?.focus();
    };
  }, []);

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" && !submitting) {
      event.preventDefault();
      onClose();
      return;
    }

    if (event.key !== "Tab") {
      return;
    }

    const focusableButtons = [cancelButtonRef.current, confirmButtonRef.current].filter(
      (button): button is HTMLButtonElement => Boolean(button && !button.disabled),
    );
    if (focusableButtons.length === 0) {
      event.preventDefault();
      return;
    }

    const firstButton = focusableButtons[0];
    const lastButton = focusableButtons[focusableButtons.length - 1];
    const activeElement = document.activeElement;
    const focusIsInsideDialog = activeElement instanceof Node && Boolean(dialogRef.current?.contains(activeElement));

    if (event.shiftKey) {
      if (activeElement === firstButton || !focusIsInsideDialog) {
        event.preventDefault();
        lastButton.focus();
      }
      return;
    }

    if (activeElement === lastButton || !focusIsInsideDialog) {
      event.preventDefault();
      firstButton.focus();
    }
  };

  return (
    <div
      role="presentation"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(22, 24, 29, 0.46)",
        zIndex: 70,
        display: "grid",
        placeItems: "center",
        padding: "20px",
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="restore-notification-title"
        className="surface"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        style={{ width: "min(460px, 100%)", padding: "24px" }}
      >
        <h2 id="restore-notification-title" style={{ margin: 0 }}>
          중단된 알림을 복구할까요?
        </h2>
        <p className="small" style={{ color: "var(--text-2)", margin: "10px 0 18px" }}>
          {maskRecipient(item.recipientEmail)} 알림을 다시 발송 대기 상태로 돌립니다.
        </p>
        <div className="surface-quiet" style={{ padding: 14 }}>
          <div className="tiny mono" style={{ color: "var(--text)" }}>
            {item.eventType}
          </div>
          <div className="tiny" style={{ color: "var(--text-3)", marginTop: 4 }}>
            {Math.max(0, item.attemptCount)}회 시도 · {formatDateOnlyLabel(item.updatedAt)}
          </div>
        </div>
        {error ? (
          <p role="alert" className="small" style={{ color: "var(--danger)", margin: "14px 0 0" }}>
            {error}
          </p>
        ) : null}
        <div className="actions" style={{ marginTop: "22px", justifyContent: "flex-end" }}>
          <button ref={cancelButtonRef} className="btn btn-ghost btn-sm" type="button" disabled={submitting} onClick={onClose}>
            취소
          </button>
          <button ref={confirmButtonRef} className="btn btn-primary btn-sm" type="button" disabled={submitting} onClick={onConfirm}>
            {submitting ? "복구 중" : "복구 확인"}
          </button>
        </div>
      </div>
    </div>
  );
}

function maskRecipient(email: string) {
  if (email.includes("***")) {
    return email;
  }

  const [localPart, domain] = email.split("@");
  if (!localPart || !domain) {
    return "숨김";
  }

  return `${localPart[0]}***@${domain}`;
}

function statusBadgeClass(status: HostNotificationStatus) {
  if (status === "SENT") {
    return "badge badge-ok badge-dot";
  }

  if (status === "FAILED" || status === "DEAD") {
    return "badge badge-warn badge-dot";
  }

  if (status === "PENDING" || status === "SENDING") {
    return "badge badge-accent badge-dot";
  }

  return "badge";
}

function summaryBadgeClass(tone: "accent" | "default" | "ok" | "warn") {
  if (tone === "accent") {
    return "badge badge-accent badge-dot";
  }

  if (tone === "ok") {
    return "badge badge-ok badge-dot";
  }

  if (tone === "warn") {
    return "badge badge-warn badge-dot";
  }

  return "badge";
}
