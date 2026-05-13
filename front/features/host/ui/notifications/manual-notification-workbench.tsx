import {
  type CSSProperties,
  useMemo,
  useState,
} from "react";
import type {
  HostNotificationEventType,
  ManualNotificationAudience,
  ManualNotificationConfirmRequest,
  ManualNotificationOptionsResponse,
  ManualNotificationPreviewRequest,
  ManualNotificationPreviewResponse,
  ManualNotificationRequestedChannels,
} from "@/features/host/model/host-view-types";
import { ManualNotificationMemberPicker } from "./manual-notification-member-picker";
import { ManualNotificationPreviewPanel } from "./manual-notification-preview";

type Selection = {
  sessionId: string;
  eventType: HostNotificationEventType;
  audience: ManualNotificationAudience;
  requestedChannels: ManualNotificationRequestedChannels;
  excludedMembershipIds: string[];
  includedMembershipIds: string[];
  sendMode: "NOW";
};

const audienceLabels: Record<ManualNotificationAudience, string> = {
  ALL_ACTIVE_MEMBERS: "전체 활성 멤버",
  SESSION_PARTICIPANTS: "세션 참가자",
  CONFIRMED_ATTENDEES: "참석 확정자",
};

export function ManualNotificationWorkbench({
  options,
  initialSessionId,
  initialEventType,
  preview,
  busy,
  error,
  onPreview,
  onConfirm,
}: {
  options: ManualNotificationOptionsResponse;
  initialSessionId: string | null;
  initialEventType: HostNotificationEventType | null;
  preview: ManualNotificationPreviewResponse | null;
  busy: boolean;
  error: string | null;
  onPreview: (request: ManualNotificationPreviewRequest) => Promise<void>;
  onConfirm: (request: ManualNotificationConfirmRequest) => Promise<void>;
}) {
  const firstEnabledTemplate = options.templates.find((template) => template.enabled);
  const initialTemplate = options.templates.find((template) => template.eventType === initialEventType && template.enabled) ?? firstEnabledTemplate;
  const [selection, setSelection] = useState<Selection>(() => ({
    sessionId: initialSessionId ?? "",
    eventType: initialTemplate?.eventType ?? "SESSION_REMINDER_DUE",
    audience: initialTemplate?.defaultAudience ?? "ALL_ACTIVE_MEMBERS",
    requestedChannels: initialTemplate?.defaultChannels ?? "BOTH",
    excludedMembershipIds: [],
    includedMembershipIds: [],
    sendMode: "NOW",
  }));
  const [resendConfirmed, setResendConfirmed] = useState(false);
  const currentTemplate = useMemo(
    () => options.templates.find((template) => template.eventType === selection.eventType),
    [options.templates, selection.eventType],
  );
  const canPreview = Boolean(selection.sessionId && currentTemplate?.enabled && !busy);
  const requiresResend = Boolean(preview?.duplicates.requiresResendConfirmation);
  const canConfirm = Boolean(preview && !busy && (!requiresResend || resendConfirmed));

  return (
    <section className="rm-document-panel" aria-labelledby="manual-notification-title" style={{ padding: "22px 24px", marginBottom: 20 }}>
      <div className="row-between" style={{ gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div>
          <div className="eyebrow">운영 · 수동 발송</div>
          <h2 id="manual-notification-title" className="h2 editorial" style={{ margin: "6px 0 0" }}>
            새 알림 발송
          </h2>
        </div>
      </div>
      {error ? (
        <p role="alert" className="small" style={{ color: "var(--danger)", margin: "12px 0 0" }}>
          {error}
        </p>
      ) : null}
      <div className="stack" style={{ "--stack": "18px", marginTop: 18 } as CSSProperties}>
        <div>
          <div className="label">템플릿</div>
          <div className="row wrap" style={{ gap: 8, marginTop: 8 }}>
            {options.templates.map((template) => (
              <button
                key={template.eventType}
                type="button"
                className={`btn btn-sm ${selection.eventType === template.eventType ? "btn-primary" : "btn-quiet"}`}
                disabled={!template.enabled || busy}
                aria-label={template.disabledReason ? `${template.label}: ${template.disabledReason}` : template.label}
                onClick={() => {
                  setSelection((current) => ({
                    ...current,
                    eventType: template.eventType,
                    audience: template.defaultAudience,
                    requestedChannels: template.defaultChannels,
                  }));
                  setResendConfirmed(false);
                }}
              >
                {template.label}
              </button>
            ))}
          </div>
          {currentTemplate?.disabledReason ? (
            <p className="tiny muted" style={{ margin: "8px 0 0" }}>
              {currentTemplate.disabledReason}
            </p>
          ) : null}
        </div>

        <div>
          <label className="label" htmlFor="manual-notification-session">
            세션 ID
          </label>
          <input
            id="manual-notification-session"
            className="input"
            value={selection.sessionId}
            onChange={(event) => setSelection((current) => ({ ...current, sessionId: event.currentTarget.value }))}
            placeholder="세션을 선택하거나 세션 화면에서 진입하세요"
          />
        </div>

        {currentTemplate ? (
          <div>
            <div className="label">대상 그룹</div>
            <div className="row wrap" style={{ gap: 8, marginTop: 8 }}>
              {currentTemplate.allowedAudiences.map((audience) => (
                <button
                  key={audience}
                  type="button"
                  className={`btn btn-sm ${selection.audience === audience ? "btn-primary" : "btn-quiet"}`}
                  disabled={busy}
                  onClick={() => setSelection((current) => ({ ...current, audience }))}
                >
                  {audienceLabels[audience]}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div>
          <div className="label">채널</div>
          <div className="row wrap" style={{ gap: 8, marginTop: 8 }}>
            {[
              ["BOTH", "앱+이메일"],
              ["IN_APP", "앱 알림"],
              ["EMAIL", "이메일"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={`btn btn-sm ${selection.requestedChannels === value ? "btn-primary" : "btn-quiet"}`}
                disabled={busy}
                onClick={() => setSelection((current) => ({ ...current, requestedChannels: value as ManualNotificationRequestedChannels }))}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <ManualNotificationMemberPicker
          members={options.members.items}
          excludedIds={selection.excludedMembershipIds}
          includedIds={selection.includedMembershipIds}
          disabled={busy}
          onExcludedIdsChange={(excludedMembershipIds) => setSelection((current) => ({ ...current, excludedMembershipIds }))}
          onIncludedIdsChange={(includedMembershipIds) => setSelection((current) => ({ ...current, includedMembershipIds }))}
        />

        <button type="button" className="btn btn-primary btn-sm" disabled={!canPreview} onClick={() => onPreview(selection)}>
          {busy ? "확인 중" : "미리보기"}
        </button>

        {preview ? (
          <ManualNotificationPreviewPanel
            preview={preview}
            resendConfirmed={resendConfirmed}
            disabled={!canConfirm}
            busy={busy}
            onResendConfirmedChange={setResendConfirmed}
            onConfirm={() => onConfirm({ ...selection, previewId: preview.previewId, resendConfirmed })}
          />
        ) : null}
      </div>
    </section>
  );
}
