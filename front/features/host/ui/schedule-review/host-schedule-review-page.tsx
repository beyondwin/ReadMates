import { useState, type ComponentType, type ReactNode } from "react";
import type {
  ManualNotificationPreviewResponse,
  ManualNotificationRequestedChannels,
} from "@/features/host/model/host-view-types";
import { hostScheduleSeenStateLabel, type ScheduleSeenState } from "@/features/host/model/host-schedule-seen-model";
import { formatRecentClubAccess } from "@/features/host/ui/members/member-list-helpers";
import { AvatarChip } from "@/shared/ui/avatar-chip";
import { ReadmatesIcon } from "@/shared/ui/icon";
import { formatKoreanTime } from "@/shared/ui/readmates-display";
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
  lastClubAccessAt?: string | null;
};

export type HostScheduleReviewPageProps = {
  returnHref: string;
  sessionNumber: number;
  bookTitle: string;
  scheduleRevision: number;
  unreadMemberCount: number;
  excludedCurrentCount?: number;
  startTime?: string | null;
  previousStartTime?: string | null;
  locationLabel?: string | null;
  previousLocationLabel?: string | null;
  changeReason?: string | null;
  historyHref?: string;
  previousNotice?: string;
  now?: Date;
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
  deferLabel?: string;
  includeChanges?: boolean;
  onIncludeChangesChange?: (value: boolean) => void;
  onSelectedMembershipIdsChange?: (ids: string[]) => void;
  onSubjectChange?: (value: string) => void;
  onBodyChange?: (value: string) => void;
  onRequestedChannelsChange?: (value: ManualNotificationRequestedChannels) => void;
  onPreview?: () => void;
  onConfirm?: (resendConfirmed: boolean) => void | Promise<unknown>;
  onRefreshPreview?: () => void | Promise<unknown>;
  onDefer?: () => void;
};

const CHANNELS: readonly ManualNotificationRequestedChannels[] = ["BOTH", "IN_APP", "EMAIL"];
const BODY_MAX = 4_000;
const DEFAULT_DEFER_LABEL = "내일 09:00까지 보류";

export function HostScheduleReviewPage({
  returnHref,
  sessionNumber,
  bookTitle,
  scheduleRevision,
  unreadMemberCount,
  excludedCurrentCount = 0,
  startTime,
  previousStartTime,
  locationLabel,
  previousLocationLabel,
  changeReason,
  historyHref,
  previousNotice = "이전 안내 없음",
  now,
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
  deferLabel = DEFAULT_DEFER_LABEL,
  includeChanges,
  onIncludeChangesChange,
  onSelectedMembershipIdsChange,
  onSubjectChange,
  onBodyChange,
  onRequestedChannelsChange,
  onPreview,
  onConfirm,
  onRefreshPreview,
  onDefer,
}: HostScheduleReviewPageProps) {
  const selectedCount = selectedMembershipIds.length;
  const eligibleIds = recipients
    .filter((recipient) => recipient.scheduleSeenState === "STALE" || recipient.scheduleSeenState === "UNSEEN")
    .map((recipient) => recipient.membershipId);
  const allEligibleSelected = eligibleIds.length > 0
    && eligibleIds.every((id) => selectedMembershipIds.includes(id));
  const canPreview = selectedCount > 0
    && subject.trim().length > 0
    && body.trim().length > 0
    && !busy
    && Boolean(onPreview);
  const requiresResend = Boolean(preview?.duplicates.requiresResendConfirmation);
  const [resendState, setResendState] = useState({ previewId: preview?.previewId ?? null, confirmed: false });
  const [includeChangesLocal, setIncludeChangesLocal] = useState(true);
  const includeChangesValue = includeChanges ?? includeChangesLocal;
  const previewId = preview?.previewId ?? null;
  if (resendState.previewId !== previewId) {
    setResendState({ previewId, confirmed: false });
  }
  const resendConfirmed = resendState.confirmed;

  const sendCount = preview?.audience.finalTargetCount ?? selectedCount;
  const canConfirm = Boolean(preview && onConfirm)
    && !busy
    && !confirmBusy
    && !error
    && (!requiresResend || resendConfirmed);

  const Link = LinkComponent ?? DefaultReviewLink;

  return (
    <main className="rm-schedule-review">
      <HostScheduleReviewHeader
        returnHref={returnHref}
        sessionNumber={sessionNumber}
        bookTitle={bookTitle}
        scheduleRevision={scheduleRevision}
        unreadMemberCount={unreadMemberCount}
        LinkComponent={Link}
      />

      {receipt ? receipt : (
        <div className={preview ? "rm-schedule-review__layout rm-schedule-review__layout--previewed" : "rm-schedule-review__layout"}>
          <div className="rm-schedule-review__primary">
            <section aria-labelledby="schedule-review-changes-title">
              <h2 id="schedule-review-changes-title">변경 내용</h2>
              <table className="rm-schedule-review__changes">
                <tbody>
                  <ChangeRow
                    label="시작 시간"
                    previous={previousStartTime ? formatKoreanTime(previousStartTime) : null}
                    current={formatKoreanTime(startTime)}
                  />
                  <ChangeRow
                    label="장소"
                    previous={previousLocationLabel?.trim() || null}
                    current={locationLabel?.trim() || "장소 미정"}
                  />
                  <ChangeRow
                    label="변경 사유"
                    previous={null}
                    current={changeReason?.trim() || "변경 없음"}
                    reason
                  />
                </tbody>
              </table>
            </section>

            <section className="rm-schedule-review__recipients" aria-labelledby="schedule-review-recipients-title">
              <div className="rm-schedule-review__section-heading">
                <h2 id="schedule-review-recipients-title">안내 대상 {unreadMemberCount}명</h2>
              </div>
              <p>
                {excludedCurrentCount > 0
                  ? `현재 일정 확인 ${excludedCurrentCount}명은 자동으로 제외했어요.`
                  : "변경 전 확인과 미열람만 선택됩니다. 현재 일정을 확인한 멤버는 발송 대상에서 제외됩니다."}
              </p>
              <table className="rm-schedule-review__targets">
                <thead>
                  <tr>
                    <th scope="col">
                      <span className="rm-sr-only">선택</span>
                    </th>
                    <th scope="col">이름</th>
                    <th scope="col">
                      최신 일정 상태
                      {" "}
                      <ReadmatesIcon name="info" size={16} />
                    </th>
                    <th scope="col">최근 클럽 접속</th>
                  </tr>
                </thead>
                <tbody>
                  {recipients.map((recipient) => {
                    const eligible = recipient.scheduleSeenState === "STALE" || recipient.scheduleSeenState === "UNSEEN";
                    const checked = selectedMembershipIds.includes(recipient.membershipId);
                    const statusLabel = hostScheduleSeenStateLabel(recipient.scheduleSeenState);
                    return (
                      <tr key={recipient.membershipId} data-state={recipient.scheduleSeenState}>
                        <td>
                          <input
                            type="checkbox"
                            aria-label={recipient.displayName}
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
                        </td>
                        <td>
                          <span className="rm-schedule-review__person">
                            {recipient.avatarKey ? (
                              <AvatarChip
                                avatarKey={recipient.avatarKey}
                                name={recipient.displayName}
                                sizeRole="roster"
                              />
                            ) : null}
                            <strong>{recipient.displayName}</strong>
                          </span>
                        </td>
                        <td>
                          <span className="rm-schedule-review__seen">
                            <span
                              className="rm-schedule-review__status-dot"
                              data-tone={seenTone(recipient.scheduleSeenState)}
                            />
                            {statusLabel}
                          </span>
                        </td>
                        <td>{formatRecentClubAccess(recipient.lastClubAccessAt, now)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="rm-schedule-review__select-all">
                <label>
                  <input
                    type="checkbox"
                    checked={allEligibleSelected}
                    disabled={eligibleIds.length === 0 || busy || !onSelectedMembershipIdsChange}
                    onChange={(event) => {
                      if (!onSelectedMembershipIdsChange) return;
                      onSelectedMembershipIdsChange(event.currentTarget.checked ? [...eligibleIds] : []);
                    }}
                  />
                  전체 선택
                </label>
                <a className="rm-schedule-review__excluded" href="#schedule-review-excluded">
                  제외된 {excludedCurrentCount}명 보기 ›
                </a>
              </div>
              <p className="info rm-schedule-review__info" id="schedule-review-excluded">
                <ReadmatesIcon name="info" size={16} />
                최근 접속은 클럽 공간 기준이며 페이지별 활동은 표시하지 않아요.
              </p>
            </section>
          </div>

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
              <span>제목</span>
              <input
                aria-label="알림 제목"
                maxLength={200}
                value={subject}
                disabled={busy}
                onChange={(event) => onSubjectChange?.(event.currentTarget.value)}
              />
            </label>
            <label className="rm-schedule-review__body">
              <span>본문</span>
              <textarea
                aria-label="알림 본문"
                rows={6}
                maxLength={BODY_MAX}
                value={body}
                disabled={busy}
                onChange={(event) => onBodyChange?.(event.currentTarget.value)}
              />
              <span className="rm-schedule-review__counter">{body.length} / {BODY_MAX}</span>
            </label>
            <label className="rm-schedule-review__include">
              <input
                type="checkbox"
                checked={includeChangesValue}
                disabled={busy}
                onChange={(event) => {
                  const next = event.currentTarget.checked;
                  if (onIncludeChangesChange) onIncludeChangesChange(next);
                  else setIncludeChangesLocal(next);
                }}
              />
              변경 내용 포함
            </label>
            <fieldset className="rm-schedule-review__channels" disabled={busy}>
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

            {error && !preview ? <p className="rm-schedule-review__error" role="alert">{error}</p> : null}
            {onPreview ? (
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
                hideConfirm
                resendConfirmed={resendConfirmed}
                onResendConfirmedChange={(confirmed) => setResendState({ previewId, confirmed })}
                onRefreshPreview={onRefreshPreview}
                onConfirm={onConfirm}
              />
            ) : null}

            <div className="rm-schedule-review__actions">
              <button
                type="button"
                className="btn btn-primary"
                disabled={!canConfirm}
                onClick={() => void onConfirm?.(resendConfirmed)}
              >
                {confirmBusy ? "발송 요청 중" : `${sendCount}명에게 안내 보내기`}
              </button>
              <button
                type="button"
                className="rm-schedule-review__defer"
                disabled={!onDefer || busy}
                onClick={() => onDefer?.()}
              >
                <ReadmatesIcon name="clock" size={16} />
                {deferLabel}
              </button>
            </div>
            <Link className="rm-schedule-review__cancel" to={returnHref}>취소하고 운영실로</Link>
            <p className="info rm-schedule-review__info">
              <ReadmatesIcon name="info" size={16} />
              자동 발송하지 않아요. 미리보기 뒤에만 직접 보냅니다.
            </p>
            <footer className="rm-schedule-review__footer">
              <ReadmatesIcon name="clock" size={16} />
              <span>{previousNotice}</span>
              {historyHref ? (
                <Link to={historyHref}>변경 이력</Link>
              ) : null}
            </footer>
          </section>
        </div>
      )}
    </main>
  );
}

function ChangeRow({
  label,
  previous,
  current,
  reason = false,
}: {
  label: string;
  previous: string | null;
  current: string;
  reason?: boolean;
}) {
  const unchanged = reason || !previous || previous === current;
  return (
    <tr>
      <th scope="row">{label}</th>
      <td>
        {unchanged ? (
          reason ? current : <>{current} · 변경 없음</>
        ) : (
          <>
            {previous}
            {" "}
            <ReadmatesIcon name="arrow-right" size={16} />
            {" "}
            <span data-new>{current}</span>
          </>
        )}
      </td>
    </tr>
  );
}

function seenTone(state: ScheduleSeenState): "ok" | "warn" | "info" {
  if (state === "CURRENT") return "ok";
  if (state === "STALE") return "warn";
  return "info";
}

const DefaultReviewLink: ComponentType<HostScheduleReviewLinkProps> = ({ to, children, ...props }) => (
  <a {...props} href={to}>{children}</a>
);

function channelLabel(channel: ManualNotificationRequestedChannels): string {
  if (channel === "IN_APP") return "앱 알림";
  if (channel === "EMAIL") return "이메일";
  return "앱 알림 + 이메일";
}
