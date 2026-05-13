import type { ManualNotificationPreviewResponse } from "@/features/host/model/host-view-types";

export function ManualNotificationPreviewPanel({
  preview,
  resendConfirmed,
  disabled,
  busy,
  onResendConfirmedChange,
  onConfirm,
}: {
  preview: ManualNotificationPreviewResponse;
  resendConfirmed: boolean;
  disabled: boolean;
  busy: boolean;
  onResendConfirmedChange: (value: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <section aria-labelledby="manual-notification-preview-title" style={{ borderTop: "1px solid var(--line-soft)", paddingTop: 16 }}>
      <h3 id="manual-notification-preview-title" className="h4 editorial" style={{ margin: 0 }}>
        발송 전 확인
      </h3>
      <div className="row wrap" style={{ gap: 8, marginTop: 12 }}>
        <span className="badge badge-accent badge-dot">앱 알림 {preview.channels.inAppEligibleCount}명</span>
        <span className="badge badge-accent badge-dot">이메일 {preview.channels.emailEligibleCount}명</span>
        <span className="badge">최종 대상 {preview.audience.finalTargetCount}명</span>
      </div>
      <div className="surface-subtle" style={{ marginTop: 14, padding: 12 }}>
        <p className="label" style={{ margin: 0 }}>
          {preview.template.subject}
        </p>
        <p className="small" style={{ margin: "6px 0 0", color: "var(--text-2)" }}>
          {preview.template.bodyPreview}
        </p>
      </div>
      {preview.warnings.map((warning) => (
        <p key={warning.code} role="status" className="small" style={{ color: "var(--text-2)", margin: "10px 0 0" }}>
          {warning.message}
        </p>
      ))}
      {preview.duplicates.requiresResendConfirmation ? (
        <div style={{ marginTop: 14, padding: "12px 0", borderTop: "1px solid var(--line-soft)" }}>
          <p className="body" style={{ margin: 0, fontWeight: 700 }}>
            이미 발송된 알림입니다.
          </p>
          <label className="row" style={{ gap: 8, marginTop: 10 }}>
            <input
              type="checkbox"
              checked={resendConfirmed}
              onChange={(event) => onResendConfirmedChange(event.currentTarget.checked)}
            />
            <span className="small">재발송을 확인했습니다</span>
          </label>
        </div>
      ) : null}
      <button type="button" className="btn btn-primary btn-sm" disabled={disabled || busy} style={{ marginTop: 14 }} onClick={onConfirm}>
        {busy ? "발송 요청 중" : "발송 확인"}
      </button>
    </section>
  );
}
