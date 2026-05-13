import type { CSSProperties } from "react";
import type {
  HostNotificationEventType,
  ManualNotificationDispatchListItem,
  SessionRecordVisibility,
} from "@/features/host/model/host-view-types";
import type { SessionState } from "@/shared/model/readmates-types";
import { formatDateOnlyLabel } from "@/shared/ui/readmates-display";
import {
  DefaultLinkComponent,
  type HostSessionEditorLinkComponent,
} from "./session-editor-links";

type NotificationAction = {
  eventType: Extract<
    HostNotificationEventType,
    "NEXT_BOOK_PUBLISHED" | "SESSION_REMINDER_DUE" | "FEEDBACK_DOCUMENT_PUBLISHED"
  >;
  label: string;
  enabled: boolean;
  disabledReason: string;
};

function notificationHref(sessionId: string, eventType: HostNotificationEventType) {
  const params = new URLSearchParams({
    sessionId,
    eventType,
  });

  return `/app/host/notifications?${params.toString()}`;
}

export function HostSessionNotificationActions({
  sessionId,
  state,
  visibility,
  feedbackDocumentUploaded,
  dispatches = [],
  LinkComponent = DefaultLinkComponent,
}: {
  sessionId: string;
  state: SessionState;
  visibility: SessionRecordVisibility;
  feedbackDocumentUploaded: boolean;
  dispatches?: ManualNotificationDispatchListItem[];
  LinkComponent?: HostSessionEditorLinkComponent;
}) {
  const actions: NotificationAction[] = [
    {
      eventType: "NEXT_BOOK_PUBLISHED",
      label: "다음 책 공개",
      enabled: state === "DRAFT" && (visibility === "MEMBER" || visibility === "PUBLIC"),
      disabledReason: "멤버에게 공개된 예정 세션만 다음 책 알림을 보낼 수 있습니다.",
    },
    {
      eventType: "SESSION_REMINDER_DUE",
      label: "모임 전날 리마인더",
      enabled: state === "DRAFT" || state === "OPEN",
      disabledReason: "예정 또는 열린 세션만 리마인더를 보낼 수 있습니다.",
    },
    {
      eventType: "FEEDBACK_DOCUMENT_PUBLISHED",
      label: "피드백 문서 등록",
      enabled: (state === "CLOSED" || state === "PUBLISHED") && feedbackDocumentUploaded,
      disabledReason: "닫힌 세션의 피드백 문서가 등록된 뒤 발송할 수 있습니다.",
    },
  ];

  return (
    <section className="surface-quiet" aria-labelledby="session-notifications-title" style={{ padding: "22px" }}>
      <div className="eyebrow" id="session-notifications-title" style={{ marginBottom: "10px" }}>
        알림 발송
      </div>
      <div className="stack" style={{ "--stack": "0px" } as CSSProperties}>
        {actions.map((action, index) => {
          const latestDispatch = latestDispatchFor(dispatches, action.eventType);
          return (
            <div
              key={action.eventType}
              className="row-between"
              style={{
                gap: 12,
                padding: "12px 0",
                borderTop: index === 0 ? undefined : "1px solid var(--line-soft)",
                flexWrap: "wrap",
              }}
            >
              <span style={{ minWidth: 0 }}>
                <span className="body" style={{ display: "block", fontSize: "13.5px", fontWeight: 600 }}>
                  {action.label}
                </span>
                {latestDispatch ? (
                  <span className="row wrap" style={{ gap: 6, marginTop: 6 }}>
                    <span className="badge badge-ok badge-dot">이미 발송됨</span>
                    <span className="tiny muted">{formatDateOnlyLabel(latestDispatch.createdAt)}</span>
                  </span>
                ) : null}
              </span>
              {action.enabled ? (
                <LinkComponent
                  className="btn btn-quiet btn-sm"
                  to={notificationHref(sessionId, action.eventType)}
                >
                  {latestDispatch ? `재발송 검토 · ${action.label}` : action.label}
                </LinkComponent>
              ) : (
                <button
                  type="button"
                  className="btn btn-quiet btn-sm"
                  disabled
                  aria-label={`${action.label}: ${action.disabledReason}`}
                >
                  준비 필요
                </button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function latestDispatchFor(
  dispatches: ManualNotificationDispatchListItem[],
  eventType: HostNotificationEventType,
) {
  return dispatches
    .filter((dispatch) => dispatch.eventType === eventType)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ?? null;
}
