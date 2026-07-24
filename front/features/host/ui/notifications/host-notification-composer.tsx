import { type CSSProperties, useState } from "react";
import {
  composerCanPreview,
  recommendedAudience,
  type HostNotificationComposerDraft,
  type HostNotificationRecipientMode,
} from "@/features/host/model/host-notification-composer-model";
import type {
  HostNotificationEventType,
  ManualNotificationOptionsResponse,
  ManualNotificationPreviewResponse,
  ManualNotificationRequestedChannels,
} from "@/features/host/model/host-view-types";
import { ManualNotificationPreviewPanel } from "./manual-notification-preview";
import { manualAudienceLabels } from "./manual-notification-labels";
import { NotificationRecipientPicker } from "./notification-recipient-picker";

export type HostNotificationComposerProps = {
  options: ManualNotificationOptionsResponse;
  eventType: HostNotificationEventType;
  draft: HostNotificationComposerDraft;
  preview: ManualNotificationPreviewResponse | null;
  busy: boolean;
  error: string | null;
  onDraftChange: (draft: HostNotificationComposerDraft) => void;
  onSearch: (search: string) => Promise<unknown>;
  onLoadMore: () => Promise<unknown>;
  onPreview: () => Promise<unknown>;
  onConfirm: (resendConfirmed: boolean) => Promise<unknown> | void;
  onSkip: () => void;
  showSkip?: boolean;
  previewButtonLabel?: string;
  recommendedRecipientLabel?: string;
  recipientModes?: readonly HostNotificationRecipientMode[];
};

const channelOptions: Array<[ManualNotificationRequestedChannels, string]> = [
  ["BOTH", "앱+이메일"],
  ["IN_APP", "앱 알림"],
  ["EMAIL", "이메일"],
];

const publicationRecipientModes: readonly HostNotificationRecipientMode[] = [
  "RECOMMENDED",
  "ALL_ACTIVE_MEMBERS",
  "SELECTED_MEMBERS",
];

function recommendedLabel(eventType: HostNotificationEventType) {
  return recommendedAudience(eventType) === "ALL_ACTIVE_MEMBERS"
    ? "전체 활성 멤버"
    : "참석 확정자";
}

export function HostNotificationComposer({
  options,
  eventType,
  draft,
  preview,
  busy,
  error,
  onDraftChange,
  onSearch,
  onLoadMore,
  onPreview,
  onConfirm,
  onSkip,
  showSkip = true,
  previewButtonLabel = "알림 미리보기",
  recommendedRecipientLabel = recommendedLabel(eventType),
  recipientModes = publicationRecipientModes,
}: HostNotificationComposerProps) {
  const template = options.templates.find((item) => item.eventType === eventType);
  const visibleRecipientModes = [...new Set(recipientModes)];
  const updateDraft = (patch: Partial<HostNotificationComposerDraft>) => {
    onDraftChange({ ...draft, ...patch });
  };

  return (
    <div
      className="stack host-notification-composer"
      style={{ "--stack": "18px" } as CSSProperties}
    >
      <header>
        <div className="eyebrow">발송 전 확인</div>
        <h2
          id="host-notification-composer-title"
          className="h2 editorial"
          style={{ margin: "6px 0 0", overflowWrap: "anywhere" }}
        >
          멤버에게 알림을 보낼까요?
        </h2>
        {options.session ? (
          <p
            className="small muted"
            style={{ margin: "6px 0 0", overflowWrap: "anywhere" }}
          >
            {options.session.sessionNumber}회차 · {options.session.bookTitle}
            {template ? ` · ${template.label}` : ""}
          </p>
        ) : null}
      </header>

      {error ? (
        <p role="alert" className="small" style={{ color: "var(--danger)", margin: 0 }}>
          {error}
        </p>
      ) : null}

      <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="label">알림 대상</legend>
        <div
          className="stack"
          style={{ "--stack": "10px", marginTop: 10 } as CSSProperties}
        >
          {visibleRecipientModes.map((mode) => {
            const label = mode === "RECOMMENDED"
              ? "추천 대상"
              : manualAudienceLabels[mode];
            const ariaLabel = mode === "RECOMMENDED"
              ? `${label} · ${recommendedRecipientLabel}`
              : label;
            return (
              <label key={mode}>
                <input
                  type="radio"
                  name="notification-recipient-mode"
                  aria-label={ariaLabel}
                  checked={draft.recipientMode === mode}
                  onChange={() => updateDraft({ recipientMode: mode })}
                />{" "}
                {label}
                {mode === "RECOMMENDED" ? (
                  <> <span className="tiny muted">{recommendedRecipientLabel}</span></>
                ) : null}
              </label>
            );
          })}
        </div>
      </fieldset>

      {draft.recipientMode === "SELECTED_MEMBERS" ? (
        <NotificationRecipientPicker
          members={options.members.items}
          selectedMembershipIds={draft.selectedMembershipIds}
          hasMore={Boolean(options.members.nextCursor)}
          busy={busy}
          onSelectedMembershipIdsChange={(selectedMembershipIds) =>
            updateDraft({ selectedMembershipIds })}
          onSearch={onSearch}
          onLoadMore={onLoadMore}
        />
      ) : null}

      <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="label">발송 채널</legend>
        <div className="row wrap" style={{ gap: 12, marginTop: 10 }}>
          {channelOptions.map(([value, label]) => (
            <label key={value}>
              <input
                type="radio"
                name="notification-channel"
                aria-label={label}
                checked={draft.requestedChannels === value}
                onChange={() => updateDraft({ requestedChannels: value })}
              />{" "}
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="row wrap" style={{ gap: 8 }}>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={
            busy
            || !draft.sessionId
            || !template?.enabled
            || !composerCanPreview(draft)
          }
          onClick={() => void onPreview()}
        >
          {busy ? "확인 중" : previewButtonLabel}
        </button>
        {showSkip ? (
          <button
            type="button"
            className="btn btn-quiet btn-sm"
            disabled={busy}
            onClick={onSkip}
          >
            이번에는 보내지 않기
          </button>
        ) : null}
      </div>

      {preview ? (
        <ComposerPreview
          key={preview.previewId}
          preview={preview}
          busy={busy}
          onConfirm={onConfirm}
        />
      ) : null}
    </div>
  );
}

function ComposerPreview({
  preview,
  busy,
  onConfirm,
}: {
  preview: ManualNotificationPreviewResponse;
  busy: boolean;
  onConfirm: (resendConfirmed: boolean) => Promise<unknown> | void;
}) {
  const [resendConfirmed, setResendConfirmed] = useState(false);
  const requiresResend = preview.duplicates.requiresResendConfirmation;

  return (
    <ManualNotificationPreviewPanel
      preview={preview}
      resendConfirmed={resendConfirmed}
      disabled={busy || (requiresResend && !resendConfirmed)}
      busy={busy}
      onResendConfirmedChange={setResendConfirmed}
      onConfirm={() => void onConfirm(resendConfirmed)}
    />
  );
}
