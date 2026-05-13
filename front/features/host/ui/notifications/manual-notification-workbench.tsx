import {
  type CSSProperties,
  useMemo,
  useState,
} from "react";
import type {
  HostSessionListItem,
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
  hostSessions,
  initialSessionId,
  initialEventType,
  preview,
  busy,
  error,
  onPreview,
  onConfirm,
  onSessionChange,
  onLoadManualOptions,
  onLoadMoreManualMembers,
}: {
  options: ManualNotificationOptionsResponse;
  hostSessions: HostSessionListItem[];
  initialSessionId: string | null;
  initialEventType: HostNotificationEventType | null;
  preview: ManualNotificationPreviewResponse | null;
  busy: boolean;
  error: string | null;
  onPreview: (request: ManualNotificationPreviewRequest) => Promise<void>;
  onConfirm: (request: ManualNotificationConfirmRequest) => Promise<void>;
  onSessionChange?: (sessionId: string) => Promise<ManualNotificationOptionsResponse>;
  onLoadManualOptions?: (sessionId?: string, search?: string) => Promise<ManualNotificationOptionsResponse>;
  onLoadMoreManualMembers?: (sessionId?: string, search?: string, cursor?: string) => Promise<ManualNotificationOptionsResponse>;
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
  const [memberSearch, setMemberSearch] = useState("");
  const [membersLoading, setMembersLoading] = useState(false);
  const selectedSession = useMemo(
    () => hostSessions.find((session) => session.sessionId === selection.sessionId) ?? null,
    [hostSessions, selection.sessionId],
  );
  const currentTemplate = useMemo(
    () => options.templates.find((template) => template.eventType === selection.eventType),
    [options.templates, selection.eventType],
  );
  const canPreview = Boolean(selectedSession && currentTemplate?.enabled && !busy);
  const requiresResend = Boolean(preview?.duplicates.requiresResendConfirmation);
  const canConfirm = Boolean(preview && !busy && (!requiresResend || resendConfirmed));
  const sessionHint = selectedSession?.date && selection.eventType === "SESSION_REMINDER_DUE"
    ? reminderDateHint(selectedSession.date)
    : null;

  const handleSessionChange = async (sessionId: string) => {
    setSelection((current) => ({
      ...current,
      sessionId,
      excludedMembershipIds: [],
      includedMembershipIds: [],
    }));
    setMemberSearch("");
    setResendConfirmed(false);
    if (!onSessionChange) return;
    try {
      await onSessionChange(sessionId);
    } catch {
      // HostNotificationsPage owns the inline error state.
    }
  };

  const submitMemberSearch = async () => {
    if (!onLoadManualOptions || membersLoading) return;
    setMembersLoading(true);
    try {
      await onLoadManualOptions(selection.sessionId || undefined, memberSearch.trim() || undefined);
    } finally {
      setMembersLoading(false);
    }
  };

  const clearMemberSearch = async () => {
    setMemberSearch("");
    if (!onLoadManualOptions || membersLoading) return;
    setMembersLoading(true);
    try {
      await onLoadManualOptions(selection.sessionId || undefined, undefined);
    } finally {
      setMembersLoading(false);
    }
  };

  const loadMoreMembers = async () => {
    if (!onLoadMoreManualMembers || membersLoading || !options.members.nextCursor) return;
    setMembersLoading(true);
    try {
      await onLoadMoreManualMembers(selection.sessionId || undefined, memberSearch.trim() || undefined, options.members.nextCursor);
    } finally {
      setMembersLoading(false);
    }
  };

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
        <section aria-labelledby="manual-step-template">
          <h3 id="manual-step-template" className="label" style={{ margin: 0 }}>템플릿</h3>
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
        </section>

        <section>
          <label id="manual-step-session" className="label" htmlFor="manual-notification-session">
            세션 선택
          </label>
          <select
            id="manual-notification-session"
            className="input"
            value={selection.sessionId}
            onChange={(event) => void handleSessionChange(event.currentTarget.value)}
            disabled={busy || hostSessions.length === 0}
          >
            {hostSessions.map((session) => (
              <option key={session.sessionId} value={session.sessionId}>
                {`${session.sessionNumber}회차 · ${session.bookTitle} · ${session.date}`}
              </option>
            ))}
          </select>
          {hostSessions.length === 0 ? (
            <p className="tiny muted" style={{ margin: "8px 0 0" }}>
              선택 가능한 세션이 없습니다.
            </p>
          ) : null}
          {selectedSession ? (
            <div
              className="surface-subtle"
              style={{
                marginTop: 10,
                padding: 12,
                display: "grid",
                gap: 4,
              }}
            >
              <strong className="row wrap" style={{ gap: 6 }}>
                <span>{`${selectedSession.sessionNumber}회차`}</span>
                <span>{selectedSession.bookTitle}</span>
              </strong>
              <p className="tiny muted" style={{ margin: 0 }}>
                {[
                  selectedSession.date,
                  selectedSession.state,
                  selectedSession.visibility,
                  sessionHint,
                ].filter(Boolean).join(" · ")}
              </p>
            </div>
          ) : null}
        </section>

        {currentTemplate ? (
          <section aria-labelledby="manual-step-audience">
            <h3 id="manual-step-audience" className="label" style={{ margin: 0 }}>대상 그룹</h3>
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
          </section>
        ) : null}

        <section aria-labelledby="manual-step-channel">
          <h3 id="manual-step-channel" className="label" style={{ margin: 0 }}>채널</h3>
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
        </section>

        <ManualNotificationMemberPicker
          members={options.members.items}
          excludedIds={selection.excludedMembershipIds}
          includedIds={selection.includedMembershipIds}
          search={memberSearch}
          hasMore={Boolean(options.members.nextCursor)}
          loading={membersLoading}
          disabled={busy}
          onSearchChange={setMemberSearch}
          onSearchSubmit={submitMemberSearch}
          onSearchClear={clearMemberSearch}
          onLoadMore={loadMoreMembers}
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

function reminderDateHint(sessionDate: string, now = new Date()) {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const [year, month, day] = sessionDate.split("-").map(Number);
  const sessionDay = new Date(year, month - 1, day).getTime();
  const days = Math.round((sessionDay - startOfToday) / 86_400_000);
  if (days === 0) return "오늘 모임";
  if (days > 0) return `D-${days}`;
  return `지난 모임 D+${Math.abs(days)}`;
}
