import { useMemo, useRef, useState, type ComponentType, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router";
import type {
  HostSessionDetailResponse,
  ManualNotificationConfirmResponse,
  ManualNotificationOptionsResponse,
  ManualNotificationPreviewRequest,
  ManualNotificationPreviewResponse,
  ManualNotificationRequestedChannels,
} from "@/features/host/api/host-contracts";
import { requireHostClubContext } from "@/features/host/model/host-authority-loss";
import { hostScheduleSeenStateLabel } from "@/features/host/model/host-schedule-seen-model";
import {
  hostNotificationKeys,
  hostNotificationManualOptionsQuery,
  useConfirmManualNotificationMutation,
  usePreviewManualNotificationMutation,
} from "@/features/host/queries/host-notification-queries";
import {
  hostSessionDetailQuery,
  hostSessionKeys,
} from "@/features/host/queries/host-session-queries";
import { hostWorkboxKeys } from "@/features/host/queries/host-workbox-queries";
import { ManualNotificationPreviewConfirmation } from "@/features/host/ui/notifications/manual-notification-preview";
import { HostScheduleReviewHeader } from "@/features/host/ui/schedule-review/host-schedule-review-header";
import {
  OperationReceipt,
  operationReceiptOutcome,
  type OperationReceiptOutcome,
} from "@/features/host/ui/workbox/operation-receipt";
import { isReadmatesTransportError } from "@/shared/api/errors";
import { publishTransitionAction, TransitionOwnerObsoleteError, useTransitionSafetyOwner } from "@/shared/ui/use-transition-safety-owner";
import "@/features/host/ui/workbox/host-workbox.css";

type ScheduleReviewLinkProps = {
  to: string;
  className?: string;
  children: ReactNode;
};

const DefaultLink: ComponentType<ScheduleReviewLinkProps> = ({ to, children, ...props }) => (
  <a {...props} href={to}>{children}</a>
);

type ScheduleReviewDraft = {
  sessionId: string;
  contentRevision: string;
  scheduleRevision: number;
  selectedMembershipIds: string[];
  requestedChannels: ManualNotificationRequestedChannels;
  subject: string;
  body: string;
};

type PreviewSnapshot = {
  response: ManualNotificationPreviewResponse;
  selection: ManualNotificationPreviewRequest;
};

type DurableReceipt = {
  outcome: OperationReceiptOutcome;
  detail: string;
};

const AUTHORITY_CONFLICT_CODES = new Set([
  "MANUAL_NOTIFICATION_PREVIEW_STALE",
  "MANUAL_NOTIFICATION_CONTENT_STALE",
  "MANUAL_NOTIFICATION_STATE_INVALID",
  "MANUAL_NOTIFICATION_RECIPIENTS_CHANGED",
  "MANUAL_NOTIFICATION_RECIPIENT_INVALID",
  "MANUAL_NOTIFICATION_AUDIENCE_EMPTY",
  "MANUAL_NOTIFICATION_TEMPLATE_UNAVAILABLE",
]);

const NON_CURRENT_PREVIEW_CODES = new Set([
  "MANUAL_NOTIFICATION_PREVIEW_EXPIRED",
  "MANUAL_NOTIFICATION_PREVIEW_NOT_FOUND",
  "MANUAL_NOTIFICATION_PREVIEW_REUSED",
  "MANUAL_NOTIFICATION_SELECTION_INVALID",
  "MANUAL_NOTIFICATION_COPY_INVALID",
  "DUPLICATE_NOTIFICATION_DISPATCH",
]);

export function HostScheduleReviewRoute({
  LinkComponent = DefaultLink,
}: {
  LinkComponent?: ComponentType<ScheduleReviewLinkProps>;
}) {
  const { clubSlug, sessionId: routeSessionId } = useParams<{ clubSlug: string; sessionId: string }>();
  const sessionId = routeSessionId ?? "";
  return (
    <HostScheduleReviewSession
      key={`${clubSlug ?? "missing"}:${sessionId}`}
      clubSlug={clubSlug}
      sessionId={sessionId}
      LinkComponent={LinkComponent}
    />
  );
}

function HostScheduleReviewSession({
  clubSlug,
  sessionId,
  LinkComponent,
}: {
  clubSlug: string | undefined;
  sessionId: string;
  LinkComponent: ComponentType<ScheduleReviewLinkProps>;
}) {
  const context = useMemo(() => requireHostClubContext(clubSlug), [clubSlug]);
  const queryClient = useQueryClient();
  const detailQuery = useQuery({
    ...hostSessionDetailQuery(sessionId, context),
    enabled: Boolean(sessionId),
    retry: false,
  });
  const detail = detailQuery.data;
  const scheduleAvailable = detail?.scheduleSeenAvailability === "AVAILABLE";
  const optionsQuery = useQuery({
    ...hostNotificationManualOptionsQuery({ sessionId }, context),
    enabled: Boolean(sessionId) && scheduleAvailable,
    retry: false,
  });
  const template = optionsQuery.data?.templates.find((item) => item.eventType === "SESSION_REMINDER_DUE") ?? null;
  const previewMutation = usePreviewManualNotificationMutation(context);
  const confirmMutation = useConfirmManualNotificationMutation(context);
  const [draftOverride, setDraftOverride] = useState<ScheduleReviewDraft | null>(null);
  const [previewSnapshot, setPreviewSnapshot] = useState<PreviewSnapshot | null>(null);
  const [receipt, setReceipt] = useState<DurableReceipt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [authorityRecovery, setAuthorityRecovery] = useState<"idle" | "refreshing" | "failed">("idle");
  const currentSessionRef = useRef(sessionId);
  const transitionOwner = useTransitionSafetyOwner(
    `host-schedule-review:${sessionId}`,
    draftOverride !== null || previewSnapshot !== null,
  );
  const authorityReady = authorityRecovery === "idle"
    && hasExactScheduleAuthority(detail, optionsQuery.data, sessionId);
  const eligibleIds = useMemo(() => detail?.attendees
      .filter((attendee) => attendee.scheduleSeenState === "STALE" || attendee.scheduleSeenState === "UNSEEN")
      .map((attendee) => attendee.membershipId) ?? [], [detail?.attendees]);
  const authorityDraft = useMemo<ScheduleReviewDraft | null>(() => {
    if (!authorityReady || !detail || !template) return null;
    return {
      sessionId: detail.sessionId,
      contentRevision: template.contentRevision,
      scheduleRevision: detail.scheduleRevision,
      selectedMembershipIds: eligibleIds,
      requestedChannels: template.defaultChannels,
      subject: template.defaultSubject,
      body: template.defaultBody,
    };
  }, [authorityReady, detail, eligibleIds, template]);
  const draft = useMemo<ScheduleReviewDraft | null>(() => {
    if (!authorityDraft) return null;
    if (!draftOverride || draftOverride.sessionId !== authorityDraft.sessionId) return authorityDraft;
    return {
      ...draftOverride,
      contentRevision: authorityDraft.contentRevision,
      scheduleRevision: authorityDraft.scheduleRevision,
      selectedMembershipIds: draftOverride.selectedMembershipIds.filter((id) => eligibleIds.includes(id)),
    };
  }, [authorityDraft, draftOverride, eligibleIds]);

  const returnHref = `/clubs/${encodeURIComponent(context.clubSlug)}/app/host`;
  const notificationLedgerHref = `${returnHref}/notifications`;

  const executeAccepted = async <T,>(
    operationId: string,
    request: () => Promise<T>,
    publish: (result: T, handle: ReturnType<typeof transitionOwner.begin>) => Promise<unknown>,
  ) => {
    const handle = transitionOwner.begin(operationId, "L3", async () => ({ operationId, outcome: "still-unknown" }));
    try {
      const result = await request();
      if (await handle.settle("succeeded") !== "accepted") throw new TransitionOwnerObsoleteError();
      await publish(result, handle);
      return result;
    } catch (requestError) {
      if (requestError instanceof TransitionOwnerObsoleteError) throw requestError;
      if (await handle.settle("failed") !== "accepted") throw new TransitionOwnerObsoleteError();
      throw requestError;
    } finally {
      handle.completePublication();
    }
  };

  const updateDraft = (patch: Partial<ScheduleReviewDraft>) => {
    if (!draft) return;
    setDraftOverride({ ...draft, ...patch });
    setPreviewSnapshot(null);
    setError(null);
  };

  const buildSelection = (): ManualNotificationPreviewRequest | null => {
    if (!draft || !authorityReady || draft.selectedMembershipIds.length === 0) return null;
    return {
      sessionId: draft.sessionId,
      eventType: "SESSION_REMINDER_DUE",
      contentRevision: draft.contentRevision,
      audience: "SELECTED_MEMBERS",
      requestedChannels: draft.requestedChannels,
      selectedMembershipIds: [...draft.selectedMembershipIds].sort(),
      excludedMembershipIds: [],
      includedMembershipIds: [],
      sendMode: "NOW",
      scheduleRevision: draft.scheduleRevision,
      subject: draft.subject,
      body: draft.body,
    };
  };

  const refreshAuthority = async () => {
    setPreviewSnapshot(null);
    setAuthorityRecovery("refreshing");
    await Promise.allSettled([
      queryClient.invalidateQueries({ queryKey: hostWorkboxKeys.scope(context) }),
      queryClient.invalidateQueries({ queryKey: hostSessionKeys.operatingRoomCurrent(context) }),
    ]);
    try {
      const [detailResult, optionsResult] = await Promise.all([
        detailQuery.refetch(),
        optionsQuery.refetch(),
      ]);
      const recovered = !detailResult.isError
        && !optionsResult.isError
        && hasExactScheduleAuthority(detailResult.data, optionsResult.data, sessionId);
      if (!recovered) {
        setAuthorityRecovery("failed");
        setError("최신 권한을 확인하지 못했습니다. 다시 확인한 뒤 새 미리보기를 만들어 주세요.");
        return false;
      }
      setAuthorityRecovery("idle");
      return true;
    } catch {
      setAuthorityRecovery("failed");
      setError("최신 권한을 확인하지 못했습니다. 다시 확인한 뒤 새 미리보기를 만들어 주세요.");
      return false;
    }
  };

  const previewNotification = async () => {
    const selection = buildSelection();
    if (!selection) return;
    setError(null);
    try {
      await executeAccepted(
        `host-schedule-review:preview:${selection.sessionId}:${selection.scheduleRevision}`,
        () => previewMutation.mutateAsync(selection),
        (response, handle) => publishTransitionAction(handle, "ui", () => {
          if (currentSessionRef.current !== selection.sessionId) return;
          setPreviewSnapshot({ response, selection });
        }),
      );
    } catch (previewError) {
      if (previewError instanceof TransitionOwnerObsoleteError) return;
      const disposition = manualNotificationErrorDisposition(previewError);
      if (disposition !== "unknown") setPreviewSnapshot(null);
      if (disposition === "authority") {
        setError("일정 또는 수신 대상이 변경되었습니다. 최신 정보로 새 미리보기를 만들어 주세요.");
        await refreshAuthority();
        return;
      }
      if (disposition === "preview") {
        setError("이 미리보기는 더 이상 사용할 수 없습니다. 새 미리보기를 만들어 주세요.");
        return;
      }
      setError("미리보기를 만들지 못했습니다. 대상과 문구를 확인한 뒤 다시 시도해 주세요.");
    }
  };

  const invalidateAfterConfirm = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: hostWorkboxKeys.scope(context) }),
      queryClient.invalidateQueries({ queryKey: hostNotificationKeys.manual(context) }),
      queryClient.invalidateQueries({ queryKey: hostSessionKeys.manualDispatchesRoot(context) }),
      queryClient.invalidateQueries({ queryKey: hostSessionKeys.detail(sessionId, context) }),
      queryClient.invalidateQueries({ queryKey: hostSessionKeys.operatingRoomCurrent(context) }),
    ]);
  };

  const confirmNotification = async (resendConfirmed: boolean) => {
    const snapshot = previewSnapshot;
    if (!snapshot) return;
    setError(null);
    try {
      await executeAccepted(
        `host-schedule-review:confirm:${snapshot.response.previewId}:${resendConfirmed}`,
        () => confirmMutation.mutateAsync({
          ...snapshot.selection,
          previewId: snapshot.response.previewId,
          resendConfirmed,
        }),
        async (result, handle) => {
          await publishTransitionAction(handle, "cache", invalidateAfterConfirm);
          await publishTransitionAction(handle, "ui", () => {
            if (currentSessionRef.current !== snapshot.selection.sessionId) return;
            setReceipt(receiptFromConfirm(result));
            setPreviewSnapshot(null);
          });
        },
      );
    } catch (confirmError) {
      if (confirmError instanceof TransitionOwnerObsoleteError) return;
      if (currentSessionRef.current !== snapshot.selection.sessionId) return;
      if (isReadmatesTransportError(confirmError)) {
        setReceipt({
          outcome: "unknown",
          detail: "요청 결과를 확인할 수 없습니다. 같은 알림을 다시 보내지 말고 알림 장부에서 확인해 주세요.",
        });
        setPreviewSnapshot(null);
        await invalidateAfterConfirm();
        return;
      }
      const disposition = manualNotificationErrorDisposition(confirmError);
      if (disposition !== "unknown") setPreviewSnapshot(null);
      if (disposition === "authority") {
        setError("미리보기 이후 일정 또는 수신 대상이 변경되었습니다. 최신 정보로 새 미리보기를 만들어 주세요.");
        await refreshAuthority();
        return;
      }
      if (disposition === "preview") {
        setError("이 미리보기는 더 이상 사용할 수 없습니다. 새 미리보기를 만들어 주세요.");
        return;
      }
      setError("발송 요청이 완료되지 않았습니다. 현재 미리보기와 재발송 여부를 확인해 주세요.");
    }
  };

  if (!sessionId) {
    return <ScheduleReviewUnavailable message="검토할 모임을 찾을 수 없습니다." returnHref={returnHref} LinkComponent={LinkComponent} />;
  }
  if (authorityRecovery === "refreshing") {
    return <main className="rm-schedule-review"><p role="status">최신 일정과 알림 권한을 다시 확인하는 중입니다.</p></main>;
  }
  if (authorityRecovery === "failed") {
    return (
      <ScheduleReviewUnavailable
        message="최신 권한을 확인하지 못했습니다. 다시 확인한 뒤 새 미리보기를 만들어 주세요."
        returnHref={returnHref}
        onRetry={() => {
          void refreshAuthority().then((recovered) => {
            if (recovered) setError(null);
          });
        }}
        LinkComponent={LinkComponent}
      />
    );
  }
  if (detailQuery.isPending) {
    return <main className="rm-schedule-review"><p role="status">모임 일정 상태를 불러오는 중입니다.</p></main>;
  }
  if (detailQuery.isError || !detail) {
    return (
      <ScheduleReviewUnavailable
        message="모임 일정 상태를 불러오지 못했습니다."
        returnHref={returnHref}
        onRetry={() => void detailQuery.refetch()}
        LinkComponent={LinkComponent}
      />
    );
  }
  if (!scheduleAvailable) {
    return (
      <ScheduleReviewUnavailable
        message="이 모임에서는 일정 확인 상태를 사용할 수 없습니다."
        returnHref={returnHref}
        onRetry={() => void detailQuery.refetch()}
        LinkComponent={LinkComponent}
      />
    );
  }
  if (optionsQuery.isPending) {
    return <main className="rm-schedule-review"><p role="status">알림 문구와 대상 계약을 불러오는 중입니다.</p></main>;
  }
  if (!authorityReady || !draft || !template) {
    return (
      <ScheduleReviewUnavailable
        message="현재 일정과 일치하는 알림 템플릿을 사용할 수 없습니다."
        returnHref={returnHref}
        onRetry={() => { void refreshAuthority(); }}
        LinkComponent={LinkComponent}
      />
    );
  }

  const busy = previewMutation.isPending || confirmMutation.isPending;
  const canPreview = draft.selectedMembershipIds.length > 0
    && draft.subject.trim().length > 0
    && draft.body.trim().length > 0
    && !busy;

  return (
    <main className="rm-schedule-review">
      <HostScheduleReviewHeader
        returnHref={returnHref}
        sessionNumber={detail.sessionNumber}
        bookTitle={detail.bookTitle}
        scheduleRevision={detail.scheduleRevision}
        LinkComponent={LinkComponent}
      />

      {receipt ? (
        <OperationReceipt
          outcome={receipt.outcome}
          title="일정 알림"
          detail={receipt.detail}
          ledgerHref={receipt.outcome === "unknown" ? notificationLedgerHref : null}
          LinkComponent={LinkComponent}
        />
      ) : (
        <div className="rm-schedule-review__layout">
          <section className="rm-schedule-review__recipients" aria-labelledby="schedule-review-recipients-title">
            <div className="rm-schedule-review__section-heading">
              <h2 id="schedule-review-recipients-title">대상 확인</h2>
              <span>선택 {draft.selectedMembershipIds.length}명</span>
            </div>
            <p>변경 전 확인과 미열람만 선택됩니다. 현재 일정을 확인한 멤버는 보이지만 발송 대상에서는 제외됩니다.</p>
            <ul>
              {detail.attendees.map((attendee) => {
                const eligible = attendee.scheduleSeenState === "STALE" || attendee.scheduleSeenState === "UNSEEN";
                const checked = draft.selectedMembershipIds.includes(attendee.membershipId);
                return (
                  <li key={attendee.membershipId} data-state={attendee.scheduleSeenState}>
                    <label>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={!eligible || busy}
                        onChange={(event) => {
                          const selectedMembershipIds = event.currentTarget.checked
                            ? [...draft.selectedMembershipIds, attendee.membershipId]
                            : draft.selectedMembershipIds.filter((id) => id !== attendee.membershipId);
                          updateDraft({ selectedMembershipIds });
                        }}
                      />
                      <span><strong>{attendee.displayName}</strong><small>{hostScheduleSeenStateLabel(attendee.scheduleSeenState)}</small></span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="rm-schedule-review__composer" aria-labelledby="schedule-review-composer-title">
            <h2 id="schedule-review-composer-title">문구와 채널</h2>
            <label>
              <span>알림 제목</span>
              <input
                aria-label="알림 제목"
                maxLength={200}
                value={draft.subject}
                disabled={busy}
                onChange={(event) => updateDraft({ subject: event.currentTarget.value })}
              />
            </label>
            <label>
              <span>알림 본문</span>
              <textarea
                aria-label="알림 본문"
                rows={6}
                maxLength={4_000}
                value={draft.body}
                disabled={busy}
                onChange={(event) => updateDraft({ body: event.currentTarget.value })}
              />
            </label>
            <fieldset disabled={busy}>
              <legend>발송 채널</legend>
              {(["BOTH", "IN_APP", "EMAIL"] as const).map((channel) => (
                <label key={channel}>
                  <input
                    type="radio"
                    name="schedule-review-channel"
                    checked={draft.requestedChannels === channel}
                    onChange={() => updateDraft({ requestedChannels: channel })}
                  /> {channelLabel(channel)}
                </label>
              ))}
            </fieldset>

            {error ? <p className="rm-schedule-review__error" role="alert">{error}</p> : null}
            <button
              type="button"
              className="rm-schedule-review__preview"
              disabled={!canPreview}
              onClick={() => void previewNotification()}
            >
              {previewMutation.isPending ? "미리보기 만드는 중" : "알림 미리보기"}
            </button>

            {previewSnapshot ? (
              <ManualNotificationPreviewConfirmation
                preview={previewSnapshot.response}
                busy={confirmMutation.isPending}
                presentation="side-sheet"
                error={error}
                onRefreshPreview={previewNotification}
                onConfirm={confirmNotification}
              />
            ) : null}
          </section>
        </div>
      )}
    </main>
  );
}

function ScheduleReviewUnavailable({
  message,
  returnHref,
  onRetry,
  LinkComponent,
}: {
  message: string;
  returnHref: string;
  onRetry?: () => void;
  LinkComponent: ComponentType<ScheduleReviewLinkProps>;
}) {
  return (
    <main className="rm-schedule-review rm-schedule-review--unavailable">
      <section role="alert">
        <h1>일정 미열람 검토</h1>
        <p>{message}</p>
        <div>
          {onRetry ? <button type="button" onClick={onRetry}>다시 확인</button> : null}
          <LinkComponent to={returnHref}>운영실로 돌아가기</LinkComponent>
        </div>
      </section>
    </main>
  );
}

function manualNotificationErrorDisposition(error: unknown): "authority" | "preview" | "unknown" {
  if (!error || typeof error !== "object") return "unknown";
  const code = (error as { code?: unknown }).code;
  if (typeof code !== "string") return "unknown";
  if (AUTHORITY_CONFLICT_CODES.has(code)) return "authority";
  if (NON_CURRENT_PREVIEW_CODES.has(code)) return "preview";
  return "unknown";
}

function hasExactScheduleAuthority(
  detail: HostSessionDetailResponse | undefined,
  options: ManualNotificationOptionsResponse | undefined,
  sessionId: string,
): boolean {
  const template = options?.templates.find((item) => item.eventType === "SESSION_REMINDER_DUE");
  return Boolean(
    detail
    && detail.sessionId === sessionId
    && detail.scheduleSeenAvailability === "AVAILABLE"
    && options?.session?.sessionId === sessionId
    && options.session.scheduleRevision === detail.scheduleRevision
    && template?.enabled
    && template.allowedAudiences.includes("SELECTED_MEMBERS"),
  );
}

function receiptFromConfirm(result: ManualNotificationConfirmResponse): DurableReceipt {
  let outcome = operationReceiptOutcome(result.status);
  const summary = result.summary;
  if (
    outcome === "success"
    && summary.requestedChannels === "BOTH"
    && (summary.expectedInAppCount !== summary.targetCount || summary.expectedEmailCount !== summary.targetCount)
  ) outcome = "partial";
  return {
    outcome,
    detail: `대상 ${summary.targetCount}명 · 앱 ${summary.expectedInAppCount}명 · 이메일 ${summary.expectedEmailCount}명`,
  };
}

function channelLabel(channel: ManualNotificationRequestedChannels): string {
  if (channel === "IN_APP") return "앱 알림";
  if (channel === "EMAIL") return "이메일";
  return "앱 알림 + 이메일";
}
