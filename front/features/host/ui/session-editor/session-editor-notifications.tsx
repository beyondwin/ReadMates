import type { CSSProperties } from "react";
import type {
  HostNotificationEventType,
  SessionRecordVisibility,
} from "@/features/host/model/host-view-types";
import type { SessionState } from "@/shared/model/readmates-types";
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
  LinkComponent = DefaultLinkComponent,
}: {
  sessionId: string;
  state: SessionState;
  visibility: SessionRecordVisibility;
  feedbackDocumentUploaded: boolean;
  LinkComponent?: HostSessionEditorLinkComponent;
}) {
  const actions: NotificationAction[] = [
    {
      eventType: "NEXT_BOOK_PUBLISHED",
      label: "다음 책 공개",
      enabled: visibility === "MEMBER" || visibility === "PUBLIC",
      disabledReason: "멤버에게 보이는 세션만 발송할 수 있습니다.",
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
      enabled: feedbackDocumentUploaded,
      disabledReason: "피드백 문서를 먼저 등록해야 합니다.",
    },
  ];

  return (
    <section className="surface-quiet" aria-labelledby="session-notifications-title" style={{ padding: "22px" }}>
      <div className="eyebrow" id="session-notifications-title" style={{ marginBottom: "10px" }}>
        알림 발송
      </div>
      <div className="stack" style={{ "--stack": "0px" } as CSSProperties}>
        {actions.map((action, index) => (
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
            <span className="body" style={{ fontSize: "13.5px", fontWeight: 600 }}>
              {action.label}
            </span>
            {action.enabled ? (
              <LinkComponent
                className="btn btn-quiet btn-sm"
                to={notificationHref(sessionId, action.eventType)}
              >
                {action.label}
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
        ))}
      </div>
    </section>
  );
}
