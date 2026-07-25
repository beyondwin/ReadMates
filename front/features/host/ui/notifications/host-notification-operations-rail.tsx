import { useState } from "react";
import type { HostNotificationPolicyResponse } from "@/features/host/model/host-view-types";
import { summaryBadgeClass, type HostNotificationSummary } from "./notification-formatters";

export type HostNotificationOperationsRailProps = {
  summary: HostNotificationSummary;
  policy?: HostNotificationPolicyResponse;
  processableCount: number;
  hasProcessableNotifications: boolean;
  processPending: boolean;
  isRefreshing: boolean;
  policyPending: boolean;
  policyError: string | null;
  policyLoadError: string | null;
  policyLoading: boolean;
  onProcess: () => void;
  onPolicyChange: (enabled: boolean) => Promise<unknown>;
  onPolicyRetry: () => Promise<unknown>;
};

const policyErrorId = "host-notification-operations-rail-policy-error";

export function HostNotificationOperationsRail({
  summary,
  policy,
  processableCount,
  hasProcessableNotifications,
  processPending,
  isRefreshing,
  policyPending,
  policyError,
  policyLoadError,
  policyLoading,
  onProcess,
  onPolicyChange,
  onPolicyRetry,
}: HostNotificationOperationsRailProps) {
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const metrics = [
    { label: "대기", value: Math.max(0, summary.pending), tone: summary.pending > 0 ? "accent" : "default" },
    { label: "실패", value: Math.max(0, summary.failed), tone: summary.failed > 0 ? "warn" : "default" },
    { label: "중단", value: Math.max(0, summary.dead), tone: summary.dead > 0 ? "warn" : "default" },
    { label: "최근 24시간", value: Math.max(0, summary.sentLast24h), tone: "ok" },
  ] as const;
  const enabled = policy?.sessionReminderEnabled ?? false;
  const busy = policyPending || policyLoading || submitting;
  const visibleError = policyError ?? policyLoadError ?? localError;

  const handlePolicyChange = async (nextEnabled: boolean) => {
    if (!policy || policyPending || policyLoading || submitting) return;

    setSubmitting(true);
    setLocalError(null);
    try {
      await onPolicyChange(nextEnabled);
    } catch {
      setLocalError("리마인더 정책을 저장하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section
      className="rm-document-panel rm-host-notifications-rail"
      aria-label="알림 운영 상태"
      style={{ padding: 0, overflow: "hidden" }}
    >
      <div className="rm-host-notifications-rail__grid">
        <div className="rm-host-notifications-rail__cell rm-host-notifications-rail__policy">
          <div className="eyebrow">자동 리마인더</div>
          <div className="small" style={{ color: "var(--text-3)", marginTop: 4 }}>
            {enabled ? "모임 전날 · 켜짐" : "모임 전날 · 기본 꺼짐"}
          </div>
          <label
            htmlFor="host-session-reminder-policy"
            className="surface-quiet"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              marginTop: 14,
              padding: "12px 14px",
              cursor: policy && !busy ? "pointer" : "not-allowed",
            }}
          >
            <span className="small" style={{ fontWeight: 650 }}>
              모임 전날 자동 리마인더
            </span>
            <input
              id="host-session-reminder-policy"
              type="checkbox"
              aria-label="모임 전날 자동 리마인더"
              aria-describedby={visibleError ? policyErrorId : undefined}
              checked={enabled}
              disabled={!policy || busy}
              onChange={(event) => void handlePolicyChange(event.currentTarget.checked)}
              style={{ width: 20, height: 20, margin: 0, flex: "0 0 auto", accentColor: "var(--accent)" }}
            />
          </label>
          {visibleError ? (
            <div style={{ marginTop: 10 }}>
              <p id={policyErrorId} role="alert" className="small" style={{ color: "var(--danger)", margin: 0 }}>
                {visibleError}
              </p>
              {policyLoadError && !policy && !policyLoading ? (
                <button
                  type="button"
                  className="btn btn-quiet btn-sm"
                  onClick={() => void onPolicyRetry()}
                  style={{ marginTop: 8 }}
                >
                  정책 다시 불러오기
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        {metrics.map((metric) => (
          <div
            key={metric.label}
            className="rm-host-notifications-rail__cell"
          >
            <div className="tiny" style={{ color: "var(--text-3)" }}>{metric.label}</div>
            <div className="row" style={{ gap: 8, alignItems: "baseline", marginTop: 6 }}>
              <strong className="h3 mono" style={{ margin: 0 }}>{metric.value}</strong>
              <span className={summaryBadgeClass(metric.tone)}>건</span>
            </div>
          </div>
        ))}
      </div>

      {hasProcessableNotifications ? (
        <div style={{ display: "flex", justifyContent: "flex-end", padding: "12px 20px" }}>
          <button
            type="button"
            className="btn btn-primary btn-sm rm-host-notifications-rail__process"
            disabled={processPending || isRefreshing}
            onClick={onProcess}
          >
            {processPending
              ? "처리 중"
              : isRefreshing
                ? "새로고침 중"
                : processableCount > 0
                  ? `${processableCount}건 처리`
                  : "대기·실패 처리"}
          </button>
        </div>
      ) : null}
    </section>
  );
}
