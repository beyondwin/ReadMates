import type { ComponentType, ReactNode } from "react";
import type {
  ManualNotificationPreviewResponse,
  ManualNotificationRequestedChannels,
} from "@/features/host/model/host-view-types";
import { hostScheduleSeenStateLabel, type ScheduleSeenState } from "@/features/host/model/host-schedule-seen-model";
import { AvatarChip } from "@/shared/ui/avatar-chip";
import { ManualNotificationPreviewConfirmation } from "../notifications/manual-notification-preview";
import {
  HostScheduleReviewHeader,
  type HostScheduleReviewLinkProps,
} from "./host-schedule-review-header";
import "./host-schedule-review.css";

export type HostScheduleReviewRecipient = {
  membershipId: string;
  displayName: string;
  avatarKey?: string | null;
  scheduleSeenState: ScheduleSeenState;
};

export type HostScheduleReviewPageProps = {
  returnHref: string;
  sessionNumber: number;
  bookTitle: string;
  scheduleRevision: number;
  unreadMemberCount: number;
  excludedCurrentCount?: number;
  recipients: readonly HostScheduleReviewRecipient[];
  selectedMembershipIds: readonly string[];
  subject: string;
  body: string;
  requestedChannels: ManualNotificationRequestedChannels;
  busy?: boolean;
  error?: string | null;
  preview?: ManualNotificationPreviewResponse | null;
  previewPending?: boolean;
  confirmBusy?: boolean;
  receipt?: ReactNode;
  LinkComponent?: ComponentType<HostScheduleReviewLinkProps>;
  onSelectedMembershipIdsChange?: (ids: string[]) => void;
  onSubjectChange?: (value: string) => void;
  onBodyChange?: (value: string) => void;
  onRequestedChannelsChange?: (value: ManualNotificationRequestedChannels) => void;
  onPreview?: () => void;
  onConfirm?: (resendConfirmed: boolean) => void | Promise<unknown>;
  onRefreshPreview?: () => void | Promise<unknown>;
};

const CHANNELS: readonly ManualNotificationRequestedChannels[] = ["BOTH", "IN_APP", "EMAIL"];

export function HostScheduleReviewPage({
  returnHref,
  sessionNumber,
  bookTitle,
  scheduleRevision,
  unreadMemberCount,
  excludedCurrentCount = 0,
  recipients,
  selectedMembershipIds,
  subject,
  body,
  requestedChannels,
  busy = false,
  error = null,
  preview = null,
  previewPending = false,
  confirmBusy = false,
  receipt,
  LinkComponent,
  onSelectedMembershipIdsChange,
  onSubjectChange,
  onBodyChange,
  onRequestedChannelsChange,
  onPreview,
  onConfirm,
  onRefreshPreview,
}: HostScheduleReviewPageProps) {
  const selectedCount = selectedMembershipIds.length;
  const canPreview = selectedCount > 0
    && subject.trim().length > 0
    && body.trim().length > 0
    && !busy
    && Boolean(onPreview);

  return (
    <main className="rm-schedule-review">
      <HostScheduleReviewHeader
        returnHref={returnHref}
        sessionNumber={sessionNumber}
        bookTitle={bookTitle}
        scheduleRevision={scheduleRevision}
        unreadMemberCount={unreadMemberCount}
        LinkComponent={LinkComponent}
      />

      {receipt ? receipt : (
        <div className={preview ? "rm-schedule-review__layout rm-schedule-review__layout--previewed" : "rm-schedule-review__layout"}>
          <section className="rm-schedule-review__recipients" aria-labelledby="schedule-review-recipients-title">
            <div className="rm-schedule-review__section-heading">
              <h2 id="schedule-review-recipients-title">안내 대상 {unreadMemberCount}명</h2>
              <span>미열람 {unreadMemberCount}명</span>
            </div>
            <p>
              {excludedCurrentCount > 0
                ? `현재 일정 확인 ${excludedCurrentCount}명은 자동으로 제외했어요. 미리보기 뒤에만 보냅니다.`
                : "변경 전 확인과 미열람만 선택됩니다. 현재 일정을 확인한 멤버는 보이지만 발송 대상에서는 제외됩니다."}
            </p>
            <ul>
              {recipients.map((recipient) => {
                const eligible = recipient.scheduleSeenState === "STALE" || recipient.scheduleSeenState === "UNSEEN";
                const checked = selectedMembershipIds.includes(recipient.membershipId);
                return (
                  <li key={recipient.membershipId} data-state={recipient.scheduleSeenState}>
                    <label>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={!eligible || busy}
                        onChange={(event) => {
                          if (!onSelectedMembershipIdsChange) return;
                          const next = event.currentTarget.checked
                            ? [...selectedMembershipIds, recipient.membershipId]
                            : selectedMembershipIds.filter((id) => id !== recipient.membershipId);
                          onSelectedMembershipIdsChange(next);
                        }}
                      />
                      {recipient.avatarKey ? (
                        <AvatarChip
                          avatarKey={recipient.avatarKey}
                          name={recipient.displayName}
                          sizeRole="roster"
                        />
                      ) : null}
                      <span>
                        <strong>{recipient.displayName}</strong>
                        <small>{hostScheduleSeenStateLabel(recipient.scheduleSeenState)}</small>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="rm-schedule-review__composer" aria-labelledby="schedule-review-composer-title">
            <h2 id="schedule-review-composer-title">보낼 안내</h2>
            <p className="rm-schedule-review__composer-lede">
              대상과 문구를 확인한 뒤 직접 보내세요. 자동 발송하지 않아요.
            </p>
            <dl className="rm-schedule-review__composer-meta">
              <div>
                <dt>대상</dt>
                <dd>선택한 {selectedCount}명</dd>
              </div>
              <div>
                <dt>전달 방식</dt>
                <dd>앱 알림 · 이메일은 각 멤버의 수신 설정에 따라 전달</dd>
              </div>
            </dl>
            <label>
              <span>알림 제목</span>
              <input
                aria-label="알림 제목"
                maxLength={200}
                value={subject}
                disabled={busy}
                onChange={(event) => onSubjectChange?.(event.currentTarget.value)}
              />
            </label>
            <label>
              <span>알림 본문</span>
              <textarea
                aria-label="알림 본문"
                rows={6}
                maxLength={4_000}
                value={body}
                disabled={busy}
                onChange={(event) => onBodyChange?.(event.currentTarget.value)}
              />
            </label>
            <details className="rm-schedule-review__channels">
              <summary>세부 조작</summary>
              <fieldset disabled={busy}>
                <legend>발송 채널</legend>
                {CHANNELS.map((channel) => (
                  <label key={channel}>
                    <input
                      type="radio"
                      name="schedule-review-channel"
                      checked={requestedChannels === channel}
                      onChange={() => onRequestedChannelsChange?.(channel)}
                    /> {channelLabel(channel)}
                  </label>
                ))}
              </fieldset>
              {onPreview && preview ? (
                <button
                  type="button"
                  className="rm-schedule-review__preview"
                  disabled={!canPreview}
                  onClick={() => void onPreview()}
                >
                  {previewPending ? "미리보기 만드는 중" : "알림 미리보기"}
                </button>
              ) : null}
            </details>

            {error && !preview ? <p className="rm-schedule-review__error" role="alert">{error}</p> : null}
            {onPreview && !preview ? (
              <button
                type="button"
                className="rm-schedule-review__preview"
                disabled={!canPreview}
                onClick={() => void onPreview()}
              >
                {previewPending ? "미리보기 만드는 중" : "알림 미리보기"}
              </button>
            ) : null}

            {preview && onConfirm ? (
              <ManualNotificationPreviewConfirmation
                preview={preview}
                busy={confirmBusy}
                presentation="side-sheet"
                diagnostics="folded"
                error={error}
                onRefreshPreview={onRefreshPreview}
                onConfirm={onConfirm}
              />
            ) : null}
          </section>
        </div>
      )}
    </main>
  );
}

function channelLabel(channel: ManualNotificationRequestedChannels): string {
  if (channel === "IN_APP") return "앱 알림";
  if (channel === "EMAIL") return "이메일";
  return "앱 알림 + 이메일";
}
