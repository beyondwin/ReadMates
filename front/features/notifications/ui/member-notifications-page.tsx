type NotificationEventType =
  | "NEXT_BOOK_PUBLISHED"
  | "SESSION_REMINDER_DUE"
  | "FEEDBACK_DOCUMENT_PUBLISHED"
  | "REVIEW_PUBLISHED";

interface MemberNotificationItem {
  id: string;
  eventType: NotificationEventType;
  title: string;
  body: string;
  deepLinkPath: string;
  readAt: string | null;
  createdAt: string;
}

interface MemberNotificationsPageProps {
  unreadCount: number;
  items: MemberNotificationItem[];
  onMarkRead: (id: string) => void | Promise<void>;
  onMarkAllRead: () => void | Promise<void>;
}

const eventLabels: Record<NotificationEventType, string> = {
  NEXT_BOOK_PUBLISHED: "다음 책",
  SESSION_REMINDER_DUE: "모임 리마인더",
  FEEDBACK_DOCUMENT_PUBLISHED: "피드백 문서",
  REVIEW_PUBLISHED: "리뷰",
};

function notificationHref(deepLinkPath: string) {
  if (!deepLinkPath.startsWith("/") || deepLinkPath.startsWith("//")) {
    return "/app/notifications";
  }

  if (deepLinkPath.startsWith("/app/")) {
    return deepLinkPath;
  }

  if (deepLinkPath.startsWith("/sessions/")) {
    return `/app${deepLinkPath}`;
  }

  if (deepLinkPath === "/feedback-documents") {
    return "/app/archive?view=report";
  }

  if (deepLinkPath.startsWith("/notes")) {
    return `/app${deepLinkPath}`;
  }

  return deepLinkPath;
}

function formatNotificationDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function MemberNotificationsPage({
  unreadCount,
  items,
  onMarkRead,
  onMarkAllRead,
}: MemberNotificationsPageProps) {
  const unreadLabel = unreadCount > 0 ? `읽지 않은 알림 ${unreadCount}개` : "새 알림이 없습니다";

  return (
    <main className="rm-member-notifications-page">
      <section className="container" style={{ paddingTop: 36, paddingBottom: 72 }}>
        <header
          className="rm-document-panel"
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 18,
            padding: "24px 26px",
            marginBottom: 18,
          }}
        >
          <div>
            <div className="eyebrow">읽는사이 · 알림함</div>
            <h1 className="display editorial" style={{ margin: "8px 0 8px", fontSize: "clamp(30px, 5vw, 48px)" }}>
              알림
            </h1>
            <p className="body muted" style={{ margin: 0 }}>
              {unreadLabel}
            </p>
          </div>
          <button type="button" className="btn btn-quiet btn-sm" onClick={onMarkAllRead} disabled={unreadCount === 0}>
            모두 읽음
          </button>
        </header>

        <section className="surface" aria-label="알림 목록" style={{ padding: 6 }}>
          {items.length === 0 ? (
            <div className="surface-quiet" style={{ padding: "28px 24px" }}>
              <p className="body" style={{ margin: 0, fontWeight: 700 }}>
                아직 받은 알림이 없습니다.
              </p>
              <p className="tiny muted" style={{ margin: "8px 0 0" }}>
                책, 모임, 피드백 문서 알림이 이곳에 차곡차곡 쌓입니다.
              </p>
            </div>
          ) : (
            <div style={{ display: "grid", gap: 6 }}>
              {items.map((item) => {
                const unread = item.readAt === null;

                return (
                  <article
                    key={item.id}
                    className="surface-quiet"
                    data-unread={unread ? "true" : "false"}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(0, 1fr) auto",
                      alignItems: "center",
                      gap: 16,
                      padding: "18px 20px",
                      borderColor: unread ? "var(--line-strong)" : undefined,
                      background: unread ? "var(--bg)" : undefined,
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div className="row wrap" style={{ gap: 8, marginBottom: 8 }}>
                        <span className="tiny mono">{eventLabels[item.eventType]}</span>
                        <span className="tiny muted">{formatNotificationDate(item.createdAt)}</span>
                        {unread ? (
                          <span className="tiny" style={{ fontWeight: 800, color: "var(--accent)" }}>
                            읽지 않음
                          </span>
                        ) : null}
                      </div>
                      <a
                        href={notificationHref(item.deepLinkPath)}
                        className="h3 editorial"
                        style={{ display: "inline-block", margin: 0, textDecoration: "none" }}
                      >
                        {item.title}
                      </a>
                      <p className="body muted" style={{ margin: "8px 0 0" }}>
                        {item.body}
                      </p>
                    </div>
                    {unread ? (
                      <button type="button" className="btn btn-quiet btn-sm" onClick={() => onMarkRead(item.id)}>
                        읽음
                      </button>
                    ) : null}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
