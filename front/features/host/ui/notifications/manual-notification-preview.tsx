import { type ReactElement, useState } from "react";
import type { ManualNotificationPreviewResponse } from "@/features/host/model/host-view-types";

export type ManualNotificationPreviewConfirmationProps = {
  preview: ManualNotificationPreviewResponse;
  busy: boolean;
  presentation?: "centered" | "side-sheet";
  error?: string | null;
  onRefreshPreview?: () => Promise<unknown> | void;
  onConfirm: (resendConfirmed: boolean) => Promise<unknown> | void;
};

export function ManualNotificationPreviewPanel({
  preview,
  resendConfirmed,
  disabled,
  busy,
  confirmLabel,
  showTitle,
  presentation,
  error,
  onRefreshPreview,
  onResendConfirmedChange,
  onConfirm,
}: {
  preview: ManualNotificationPreviewResponse;
  resendConfirmed: boolean;
  disabled: boolean;
  busy: boolean;
  confirmLabel: string;
  showTitle: boolean;
  presentation: "centered" | "side-sheet";
  error?: string | null;
  onRefreshPreview?: () => Promise<unknown> | void;
  onResendConfirmedChange: (value: boolean) => void;
  onConfirm: () => void;
}) {
  if (presentation === "centered") {
    return (
      <section
        aria-label={showTitle ? undefined : "발송 전 확인"}
        aria-labelledby={showTitle ? "manual-notification-preview-title" : undefined}
        style={{ borderTop: "1px solid var(--line-soft)", paddingTop: 16 }}
      >
        {showTitle ? (
          <h3
            id="manual-notification-preview-title"
            className="h4 editorial"
            style={{ margin: 0 }}
          >
            발송 전 확인
          </h3>
        ) : null}
        <div className="row wrap" style={{ gap: 8, marginTop: 12 }}>
          <span className="badge badge-accent badge-dot">
            앱 알림 {preview.channels.inAppEligibleCount}명
          </span>
          <span className="badge badge-accent badge-dot">
            이메일 {preview.channels.emailEligibleCount}명
          </span>
          <span className="badge">
            최종 대상 {preview.audience.finalTargetCount}명
          </span>
        </div>
        <div className="surface-subtle" style={{ marginTop: 14, padding: 12 }}>
          <p className="label" style={{ margin: 0 }}>
            {preview.template.subject}
          </p>
          <p
            className="small"
            style={{ margin: "6px 0 0", color: "var(--text-2)" }}
          >
            {preview.template.bodyPreview}
          </p>
        </div>
        {preview.warnings.map((warning) => (
          <p
            key={warning.code}
            role="status"
            className="small"
            style={{ color: "var(--text-2)", margin: "10px 0 0" }}
          >
            {warning.message}
          </p>
        ))}
        {preview.duplicates.requiresResendConfirmation ? (
          <div
            style={{
              marginTop: 14,
              padding: "12px 0",
              borderTop: "1px solid var(--line-soft)",
            }}
          >
            <p className="body" style={{ margin: 0, fontWeight: 700 }}>
              이미 발송된 알림입니다.
            </p>
            <label className="row" style={{ gap: 8, marginTop: 10 }}>
              <input
                type="checkbox"
                checked={resendConfirmed}
                onChange={(event) =>
                  onResendConfirmedChange(event.currentTarget.checked)}
              />
              <span className="small">재발송을 확인했습니다</span>
            </label>
          </div>
        ) : null}
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={disabled || busy}
          style={{ marginTop: 14 }}
          onClick={onConfirm}
        >
          {busy ? "발송 요청 중" : confirmLabel}
        </button>
      </section>
    );
  }

  return (
    <section
      className="rm-notification-preview rm-notification-preview--side-sheet"
      aria-label={showTitle ? undefined : "발송 전 확인"}
      aria-labelledby={showTitle ? "manual-notification-preview-title" : undefined}
    >
      {showTitle ? (
        <h3
          id="manual-notification-preview-title"
          className="h4 editorial"
          style={{ margin: 0 }}
        >
          발송 전 확인
        </h3>
      ) : null}
      <dl className="rm-notification-preview__counts">
        <div>
          <dt>최종 대상</dt>
          <dd>{preview.audience.finalTargetCount}명</dd>
        </div>
        <div>
          <dt>앱 알림 가능</dt>
          <dd>{preview.channels.inAppEligibleCount}명</dd>
        </div>
        <div>
          <dt>이메일 가능</dt>
          <dd>{preview.channels.emailEligibleCount}명</dd>
        </div>
      </dl>
      <div className="rm-notification-preview__message">
        <span>{preview.template.label}</span>
        <strong>{preview.template.subject}</strong>
        <p>{preview.template.bodyPreview}</p>
      </div>
      {preview.warnings.map((warning) => (
        <p key={warning.code} role="status" className="rm-notification-preview__warning">
          {warning.message}
        </p>
      ))}
      {error ? (
        <div className="rm-notification-preview__error">
          <p role="alert">{error}</p>
          {onRefreshPreview ? (
            <button
              type="button"
              className="btn btn-quiet btn-sm"
              onClick={() => void onRefreshPreview()}
            >
              미리보기 다시 만들기
            </button>
          ) : null}
        </div>
      ) : null}
      {preview.duplicates.requiresResendConfirmation ? (
        <div className="rm-notification-preview__resend">
          <p className="body">
            이미 발송된 알림입니다.
          </p>
          <label className="row">
            <input
              type="checkbox"
              checked={resendConfirmed}
              onChange={(event) => onResendConfirmedChange(event.currentTarget.checked)}
            />
            <span className="small">재발송을 확인했습니다</span>
          </label>
        </div>
      ) : null}
      <button
        type="button"
        className="btn btn-primary btn-sm rm-notification-preview__confirm"
        disabled={disabled || busy}
        onClick={onConfirm}
      >
        {busy ? "발송 요청 중" : confirmLabel}
      </button>
    </section>
  );
}

export function ManualNotificationPreviewConfirmation({
  preview,
  ...props
}: ManualNotificationPreviewConfirmationProps): ReactElement {
  return (
    <ManualNotificationPreviewConfirmationState
      key={preview.previewId}
      preview={preview}
      {...props}
    />
  );
}

function ManualNotificationPreviewConfirmationState({
  preview,
  busy,
  presentation = "centered",
  error,
  onRefreshPreview,
  onConfirm,
}: ManualNotificationPreviewConfirmationProps): ReactElement {
  const [resendConfirmed, setResendConfirmed] = useState(false);
  const requiresResend = preview.duplicates.requiresResendConfirmation;
  const isSideSheet = presentation === "side-sheet";

  return (
    <ManualNotificationPreviewPanel
      preview={preview}
      resendConfirmed={resendConfirmed}
      disabled={busy || Boolean(error) || (requiresResend && !resendConfirmed)}
      busy={busy}
      confirmLabel={isSideSheet
        ? `${preview.audience.finalTargetCount}명에게 알림 발송`
        : "발송 확인"}
      showTitle={!isSideSheet}
      presentation={presentation}
      error={error}
      onRefreshPreview={onRefreshPreview}
      onResendConfirmedChange={setResendConfirmed}
      onConfirm={() => void onConfirm(resendConfirmed)}
    />
  );
}
