import { useState, type CSSProperties } from "react";
import type { HostNotificationPolicyResponse } from "@/features/host/model/host-view-types";

type HostNotificationPolicyCardProps = {
  policy?: HostNotificationPolicyResponse;
  pending?: boolean;
  error?: string | null;
  onChange: (enabled: boolean) => Promise<unknown>;
};

const policyDescriptionId = "host-notification-policy-description";
const policyErrorId = "host-notification-policy-error";

export function HostNotificationPolicyCard({
  policy,
  pending = false,
  error = null,
  onChange,
}: HostNotificationPolicyCardProps) {
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const busy = pending || submitting;
  const enabled = policy?.sessionReminderEnabled ?? false;
  const visibleError = error ?? localError;

  const handleChange = async (nextEnabled: boolean) => {
    if (!policy || busy) {
      return;
    }

    setSubmitting(true);
    setLocalError(null);
    try {
      await onChange(nextEnabled);
    } catch {
      setLocalError("리마인더 정책을 저장하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section
      className="rm-document-panel"
      aria-labelledby="host-notification-policy-title"
      data-testid="host-notification-policy-card"
      style={{ padding: "20px 22px", marginBottom: 20 }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))",
          gap: 18,
          alignItems: "center",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div className="eyebrow">클럽 정책 · opt-in</div>
          <h2
            id="host-notification-policy-title"
            className="h3 editorial"
            style={{ margin: "6px 0 0", overflowWrap: "anywhere" }}
          >
            자동 리마인더 정책
          </h2>
          <p
            id={policyDescriptionId}
            className="small"
            style={{ color: "var(--text-2)", margin: "8px 0 0", overflowWrap: "anywhere" }}
          >
            <strong style={{ color: "var(--text)" }}>기본은 꺼짐입니다.</strong>{" "}
            호스트가 직접 켠 클럽만 Asia/Seoul 기준 모임 전날 리마인더를 자동 발송합니다.
          </p>
        </div>

        <label
          htmlFor="host-session-reminder-policy"
          className="surface-quiet"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            minWidth: 0,
            padding: "14px 16px",
            cursor: policy && !busy ? "pointer" : "not-allowed",
          }}
        >
          <span style={{ minWidth: 0 }}>
            <span className="body" style={{ display: "block", fontWeight: 650, overflowWrap: "anywhere" }}>
              모임 전날 자동 리마인더
            </span>
            <span className="tiny" style={{ color: "var(--text-3)" }}>
              {!policy ? "정책 불러오는 중" : busy ? "저장 중" : enabled ? "켜짐" : "꺼짐"}
            </span>
          </span>
          <input
            id="host-session-reminder-policy"
            data-testid="host-session-reminder-policy"
            type="checkbox"
            aria-label="모임 전날 자동 리마인더"
            aria-describedby={`${policyDescriptionId}${visibleError ? ` ${policyErrorId}` : ""}`}
            checked={enabled}
            disabled={!policy || busy}
            onChange={(event) => void handleChange(event.currentTarget.checked)}
            style={{
              width: 22,
              height: 22,
              margin: 0,
              flex: "0 0 auto",
              accentColor: "var(--accent)",
            } as CSSProperties}
          />
        </label>
      </div>

      {visibleError ? (
        <p
          id={policyErrorId}
          role="alert"
          className="small"
          style={{ color: "var(--danger)", margin: "12px 0 0" }}
        >
          {visibleError}
        </p>
      ) : null}
    </section>
  );
}
