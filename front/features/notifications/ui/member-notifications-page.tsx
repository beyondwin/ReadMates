import type { MouseEvent } from "react";
import { useInRouterContext, useLocation } from "react-router-dom";
import { scopedAppLinkTarget } from "@/shared/routing/scoped-app-link-target";

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
  hasMore?: boolean;
  isLoadingMore?: boolean;
  pendingReadIds?: ReadonlySet<string>;
  markAllReadPending?: boolean;
  actionError?: string | null;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  onOpenNotification?: (id: string, href: string) => void;
  onLoadMore?: () => void;
}

const EMPTY_PENDING_READ_IDS = new Set<string>();

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

function isPrimaryLinkActivation(event: MouseEvent<HTMLAnchorElement>) {
  return event.button === 0 && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && event.currentTarget.target !== "_blank";
}

export function MemberNotificationsPage({
  ...props
}: MemberNotificationsPageProps) {
  const inRouter = useInRouterContext();

  if (inRouter) {
    return <RouterAwareMemberNotificationsPage {...props} />;
  }

  return <MemberNotificationsPageContent {...props} routePathname={globalThis.location?.pathname ?? ""} />;
}

function RouterAwareMemberNotificationsPage(props: MemberNotificationsPageProps) {
  const location = useLocation();

  return <MemberNotificationsPageContent {...props} routePathname={location.pathname} />;
}

function MemberNotificationsPageContent({
  unreadCount,
  items,
  hasMore = false,
  isLoadingMore = false,
  pendingReadIds = EMPTY_PENDING_READ_IDS,
  markAllReadPending = false,
  actionError = null,
  onMarkRead,
  onMarkAllRead,
  onOpenNotification,
  onLoadMore,
  routePathname,
}: MemberNotificationsPageProps & { routePathname: string }) {
  const unreadLabel = unreadCount > 0 ? `읽지 않은 알림 ${unreadCount}개` : "새 알림이 없습니다";
  const readAllDisabled = unreadCount === 0 || markAllReadPending;

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
          <button type="button" className="btn btn-quiet btn-sm" onClick={onMarkAllRead} disabled={readAllDisabled}>
            {markAllReadPending ? "모두 읽음 처리 중" : "모두 읽음"}
          </button>
        </header>

        {actionError ? (
          <p role="alert" className="small" style={{ color: "var(--danger)", margin: "0 0 14px" }}>
            {actionError}
          </p>
        ) : null}

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
                const href = scopedAppLinkTarget(routePathname, notificationHref(item.deepLinkPath));
                const readPending = pendingReadIds.has(item.id) || markAllReadPending;

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
                        href={href}
                        className="h3 editorial"
                        style={{ display: "inline-block", margin: 0, textDecoration: "none" }}
                        onClick={
                          unread && onOpenNotification
                            ? (event) => {
                                if (!isPrimaryLinkActivation(event)) {
                                  return;
                                }

                                event.preventDefault();
                                onOpenNotification(item.id, href);
                              }
                            : undefined
                        }
                      >
                        {item.title}
                      </a>
                      <p className="body muted" style={{ margin: "8px 0 0" }}>
                        {item.body}
                      </p>
                    </div>
                    {unread ? (
                      <button
                        type="button"
                        className="btn btn-quiet btn-sm"
                        onClick={() => onMarkRead(item.id)}
                        disabled={readPending}
                      >
                        {readPending ? "읽음 처리 중" : "읽음"}
                      </button>
                    ) : null}
                  </article>
                );
              })}
            </div>
          )}
          {hasMore && onLoadMore ? (
            <button
              type="button"
              className="btn btn-quiet btn-sm"
              disabled={isLoadingMore}
              style={{ marginTop: 12 }}
              onClick={onLoadMore}
            >
              {isLoadingMore ? "불러오는 중" : "더 보기"}
            </button>
          ) : null}
        </section>
      </section>
    </main>
  );
}
