import { useMemo, useState, type CSSProperties } from "react";
import {
  type HostNotificationComposerDraft,
  type HostNotificationRecipientMode,
} from "@/features/host/model/host-notification-composer-model";
import type {
  HostNotificationPolicyResponse,
  ManualNotificationDispatchListItem,
  ManualNotificationOptionsResponse,
  ManualNotificationPreviewResponse,
} from "@/features/host/model/host-view-types";
import { formatDateLabel } from "@/shared/ui/readmates-display";
import { HostNotificationComposer } from "@/features/host/ui/notifications/host-notification-composer";
import type { MeetingResponseLedgerRow } from "./meeting-response-ledger";

const SHORT_NOTICE_LIMIT = 140;

const REMINDER_RECIPIENT_MODES = [
  "SELECTED_MEMBERS",
  "ALL_ACTIVE_MEMBERS",
] as const satisfies readonly HostNotificationRecipientMode[];

export function nonResponderMembershipIds(
  rows: ReadonlyArray<MeetingResponseLedgerRow>,
): string[] {
  return rows
    .filter((row) => row.response === "NO_RESPONSE")
    .map((row) => row.membershipId);
}

export type MeetingNotificationRailProps = {
  policy: HostNotificationPolicyResponse | undefined;
  policyPending: boolean;
  policyLoading: boolean;
  policyError: string | null;
  onPolicyChange: (enabled: boolean) => Promise<unknown>;
  dispatches: ReadonlyArray<ManualNotificationDispatchListItem>;
  responseRows: ReadonlyArray<MeetingResponseLedgerRow>;
  options: ManualNotificationOptionsResponse | null;
  workbenchHref: string;
  busy: boolean;
  error: string | null;
  preview?: ManualNotificationPreviewResponse | null;
  onSearch: (search: string) => Promise<unknown>;
  onLoadMore: () => Promise<unknown>;
  onPreview: (draft: HostNotificationComposerDraft) => Promise<unknown>;
  onConfirm: (
    draft: HostNotificationComposerDraft,
    resendConfirmed: boolean,
  ) => Promise<unknown> | void;
};

function dispatchStatusLabel(
  status: ManualNotificationDispatchListItem["eventStatus"],
): string {
  if (status === "PUBLISHED") return "발송됨";
  if (status === "PENDING" || status === "PUBLISHING") return "예정";
  if (status === "FAILED" || status === "DEAD") return "실패";
  return status;
}

function audienceDetail(
  audience: ManualNotificationDispatchListItem["audience"],
): string {
  if (audience === "SELECTED_MEMBERS") return "선택 멤버";
  if (audience === "ALL_ACTIVE_MEMBERS") return "전체 활성 멤버";
  if (audience === "CONFIRMED_ATTENDEES") return "참석 확정자";
  return "모임 참가자";
}

function buildInitialDraft(
  options: ManualNotificationOptionsResponse,
  nonResponderIds: string[],
): HostNotificationComposerDraft | null {
  const template = options.templates.find((item) => item.eventType === "SESSION_REMINDER_DUE");
  if (!options.session || !template) return null;
  return {
    sessionId: options.session.sessionId,
    eventType: "SESSION_REMINDER_DUE",
    contentRevision: template.contentRevision,
    recipientMode: "SELECTED_MEMBERS",
    requestedChannels: template.defaultChannels,
    selectedMembershipIds: nonResponderIds,
  };
}

export function MeetingNotificationRail({
  policy,
  policyPending,
  policyLoading,
  policyError,
  onPolicyChange,
  dispatches,
  responseRows,
  options,
  workbenchHref,
  busy,
  error,
  preview = null,
  onSearch,
  onLoadMore,
  onPreview,
  onConfirm,
}: MeetingNotificationRailProps) {
  const nonResponderIds = useMemo(
    () => nonResponderMembershipIds(responseRows),
    [responseRows],
  );
  const nonResponderLabel = `미응답 ${nonResponderIds.length}명`;

  const draftSeed = useMemo(
    () => (options ? buildInitialDraft(options, nonResponderIds) : null),
    [options, nonResponderIds],
  );
  const [draftOverride, setDraftOverride] = useState<HostNotificationComposerDraft | null>(null);
  const draft = useMemo(() => {
    if (!draftSeed) return null;
    if (!draftOverride || draftOverride.sessionId !== draftSeed.sessionId) {
      return draftSeed;
    }
    if (draftOverride.recipientMode === "SELECTED_MEMBERS") {
      return {
        ...draftOverride,
        selectedMembershipIds: nonResponderIds,
        contentRevision: draftSeed.contentRevision,
      };
    }
    return { ...draftOverride, contentRevision: draftSeed.contentRevision };
  }, [draftOverride, draftSeed, nonResponderIds]);
  const setDraft = setDraftOverride;
  const [shortNotice, setShortNotice] = useState("");
  const [policySaving, setPolicySaving] = useState(false);

  const reminderEnabled = policy?.sessionReminderEnabled ?? false;
  const policyBusy = policyPending || policyLoading || policySaving;
  const policyStateLabel = policyLoading
    ? "불러오는 중"
    : !policy
      ? "상태 확인 필요"
      : policyBusy
        ? "저장 중"
        : reminderEnabled
          ? "켜짐"
          : "꺼짐";

  const handlePolicyChange = async (enabled: boolean) => {
    if (!policy || policyBusy) return;
    setPolicySaving(true);
    try {
      await onPolicyChange(enabled);
    } finally {
      setPolicySaving(false);
    }
  };

  const ledgerRows = useMemo(() => {
    const fromDispatches = dispatches.map((dispatch) => ({
      id: dispatch.manualDispatchId,
      title: "모임 리마인더",
      detail: `${dispatch.targetCount}명 · ${audienceDetail(dispatch.audience)}`,
      status: dispatchStatusLabel(dispatch.eventStatus),
      dateLabel: formatDateLabel(dispatch.createdAt),
    }));

    if (
      reminderEnabled
      && !dispatches.some((dispatch) => (
        dispatch.eventStatus === "PENDING" || dispatch.eventStatus === "PUBLISHING"
      ))
    ) {
      return [
        ...fromDispatches,
        {
          id: "scheduled-session-reminder",
          title: "모임 전날 리마인더",
          detail: "자동 발송 예정",
          status: "예정",
          dateLabel: "전날",
        },
      ];
    }

    return fromDispatches;
  }, [dispatches, reminderEnabled]);

  return (
    <section
      className="rm-meeting-notification-rail"
      aria-label="자동 알림"
      style={{ display: "grid", gap: 18 }}
    >
      <div className="rm-meeting-notification-rail__policy">
        <div className="eyebrow">자동 알림</div>
        <label className="rm-meeting-notification-rail__switch">
          <div>
            <strong>모임 전날 자동 리마인더</strong>
            <p className="small muted" style={{ margin: "4px 0 0" }}>
              {reminderEnabled
                ? "예정된 모임의 리마인더가 전날 자동 발송됩니다."
                : "예정된 모임에 자동 알림을 보내지 않습니다."}
            </p>
          </div>
          <span className="tiny muted" aria-live="polite">{policyStateLabel}</span>
          <input
            type="checkbox"
            role="switch"
            aria-label="모임 전날 자동 리마인더"
            checked={reminderEnabled}
            disabled={!policy || policyBusy}
            onChange={(event) => void handlePolicyChange(event.currentTarget.checked)}
          />
        </label>
        {policyError ? (
          <p role="alert" className="small" style={{ color: "var(--danger)", margin: 0 }}>
            {policyError}
          </p>
        ) : null}

        <ul
          className="rm-meeting-notification-rail__ledger"
          style={{ listStyle: "none", padding: 0, margin: "12px 0 0" }}
        >
          {ledgerRows.length === 0 ? (
            <li className="small muted">아직 발송되거나 예정된 리마인더가 없습니다.</li>
          ) : (
            ledgerRows.map((row) => (
              <li
                key={row.id}
                className="rm-meeting-notification-rail__row"
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto auto",
                  gap: 10,
                  alignItems: "baseline",
                  padding: "8px 0",
                  borderTop: "1px solid var(--line-soft, var(--border))",
                }}
              >
                <div>
                  <div>{row.title}</div>
                  <div className="tiny muted">{row.detail}</div>
                </div>
                <span className="tiny">{row.status}</span>
                <span className="tiny mono muted">{row.dateLabel}</span>
              </li>
            ))
          )}
        </ul>
      </div>

      <div className="rm-meeting-notification-rail__composer">
        <div className="eyebrow">짧은 공지</div>
        <p className="small muted" style={{ margin: "4px 0 10px" }}>
          미응답 멤버에게 짧은 리마인드를 보냅니다. 참석 확정 멤버에게는 재촉 알림을 보내지 않습니다.
        </p>

        <label className="stack" style={{ "--stack": "6px" } as CSSProperties}>
          <span className="label">짧은 공지</span>
          <textarea
            aria-label="짧은 공지"
            rows={3}
            value={shortNotice}
            maxLength={SHORT_NOTICE_LIMIT}
            placeholder="예) 이번 주 모임 참석 여부를 알려주세요."
            onChange={(event) => setShortNotice(event.currentTarget.value)}
          />
          <span className="tiny muted">
            {shortNotice.length} / {SHORT_NOTICE_LIMIT}
            {" · "}
            <a href={workbenchHref}>길게 쓰려면 알림 작업대로</a>
          </span>
        </label>

        {options && draft ? (
          <HostNotificationComposer
            options={options}
            eventType={draft.eventType}
            draft={draft}
            preview={preview}
            busy={busy}
            error={error}
            onDraftChange={setDraft}
            onSearch={onSearch}
            onLoadMore={onLoadMore}
            onPreview={() => onPreview(draft)}
            onConfirm={(resendConfirmed) => onConfirm(draft, resendConfirmed)}
            onSkip={() => undefined}
            presentation="dialog"
            showSkip={false}
            previewButtonLabel={`${nonResponderLabel}에게 미리보기`}
            recipientModes={REMINDER_RECIPIENT_MODES}
            recipientModeLabels={{
              SELECTED_MEMBERS: nonResponderLabel,
              ALL_ACTIVE_MEMBERS: "전원",
            }}
          />
        ) : (
          <p className="small muted" role="status">알림 작성 정보를 불러오는 중입니다.</p>
        )}
      </div>
    </section>
  );
}
