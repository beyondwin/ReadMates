import type { MouseEvent } from "react";
import { useInRouterContext, useLocation } from "react-router-dom";
import { getMemberNotificationLinkView } from "@/features/notifications/model/notification-link-model";
import type { ReadmatesReturnState } from "@/shared/routing/readmates-route-state";
import { scopedAppLinkTarget } from "@/shared/routing/scoped-app-link-target";
import { MemberNotificationTabs } from "./member-notification-tabs";

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
  onMarkAllRead: () => void;
  onOpenNotification?: (
    id: string,
    href: string,
    state?: ReadmatesReturnState,
  ) => void;
  onNavigateNotification?: (
    href: string,
    state: ReadmatesReturnState,
  ) => void;
  onLoadMore?: () => void;
}

const EMPTY_PENDING_READ_IDS = new Set<string>();

const eventLabels: Record<NotificationEventType, string> = {
  NEXT_BOOK_PUBLISHED: "다음 책",
  SESSION_REMINDER_DUE: "모임 전날",
  FEEDBACK_DOCUMENT_PUBLISHED: "피드백 문서",
  REVIEW_PUBLISHED: "서평",
};

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
  return (
    event.button === 0 &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey &&
    event.currentTarget.target !== "_blank"
  );
}

export function MemberNotificationsPage({
  ...props
}: MemberNotificationsPageProps) {
  const inRouter = useInRouterContext();

  if (inRouter) {
    return <RouterAwareMemberNotificationsPage {...props} />;
  }

  return (
    <MemberNotificationsPageContent
      {...props}
      routePathname={globalThis.location?.pathname ?? ""}
    />
  );
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
  onMarkAllRead,
  onOpenNotification,
  onNavigateNotification,
  onLoadMore,
  routePathname,
}: MemberNotificationsPageProps & { routePathname: string }) {
  const unreadLabel =
    unreadCount > 0 ? `새 알림 ${unreadCount}개` : "새 알림이 없습니다";
  const readAllDisabled =
    unreadCount === 0 || markAllReadPending || pendingReadIds.size > 0;

  return (
    <main className="rm-member-notifications-page">
      <section className="container rm-member-notifications-page__body">
        <header className="rm-member-notifications-header">
          <div>
            <h1 className="rm-member-notifications-header__title">알림</h1>
            <p className="rm-member-notifications-header__summary">
              {unreadLabel}
            </p>
          </div>
          <button
            type="button"
            className="rm-member-notifications-header__read-all"
            onClick={onMarkAllRead}
            disabled={readAllDisabled}
            aria-busy={markAllReadPending || undefined}
          >
            {markAllReadPending ? "읽음 처리 중…" : "모두 읽음"}
          </button>
        </header>

        <MemberNotificationTabs
          active="inbox"
          basePath={scopedAppLinkTarget(routePathname, "/app")}
        />

        {actionError ? (
          <p role="alert" className="rm-member-notifications-page__error">
            {actionError}
          </p>
        ) : null}

        <section
          className="rm-member-notifications-list"
          aria-label="알림 목록"
        >
          {items.length === 0 ? (
            <div className="rm-member-notifications-list__empty">
              <p className="rm-member-notifications-list__empty-title">
                아직 받은 알림이 없습니다.
              </p>
              <p className="rm-member-notifications-list__empty-copy">
                책, 모임, 피드백 문서 알림이 이곳에 차곡차곡 쌓입니다.
              </p>
            </div>
          ) : (
            items.map((item) => {
              const unread = item.readAt === null;
              const readPending =
                pendingReadIds.has(item.id) || markAllReadPending;
              const linkView = getMemberNotificationLinkView({
                eventType: item.eventType,
                deepLinkPath: item.deepLinkPath,
              });
              const href = scopedAppLinkTarget(routePathname, linkView.href);
              const state = linkView.state
                ? {
                    ...linkView.state,
                    readmatesReturnTo: scopedAppLinkTarget(
                      routePathname,
                      linkView.state.readmatesReturnTo,
                    ),
                  }
                : undefined;
              const openNotification = () => {
                if (state) {
                  onOpenNotification?.(item.id, href, state);
                  return;
                }

                onOpenNotification?.(item.id, href);
              };

              return (
                <a
                  key={item.id}
                  href={href}
                  className="rm-member-notifications-list__item"
                  data-unread={unread ? "true" : "false"}
                  aria-label={`${unread ? "읽지 않음 · " : ""}${item.title} 열기`}
                  aria-busy={readPending || undefined}
                  onClick={
                    unread && onOpenNotification
                      ? (event) => {
                          if (!isPrimaryLinkActivation(event)) return;
                          event.preventDefault();
                          if (!readPending) openNotification();
                        }
                      : !unread && state && onNavigateNotification
                        ? (event) => {
                            if (!isPrimaryLinkActivation(event)) return;
                            event.preventDefault();
                            onNavigateNotification(href, state);
                          }
                      : undefined
                  }
                >
                  <span
                    className="rm-member-notifications-list__unread-dot"
                    aria-hidden="true"
                  />
                  <span className="rm-member-notifications-list__content">
                    <span className="rm-member-notifications-list__meta">
                      <span className="rm-member-notifications-list__category">
                        {eventLabels[item.eventType]}
                      </span>
                      <span>{formatNotificationDate(item.createdAt)}</span>
                    </span>
                    <span className="rm-member-notifications-list__title">
                      {item.title}
                    </span>
                    <span className="rm-member-notifications-list__copy">
                      {item.body}
                    </span>
                  </span>
                  <span
                    className="rm-member-notifications-list__arrow"
                    aria-hidden="true"
                  >
                    ›
                  </span>
                </a>
              );
            })
          )}
        </section>

        {hasMore && onLoadMore ? (
          <button
            type="button"
            className="rm-member-notifications-page__load-more"
            disabled={isLoadingMore}
            onClick={onLoadMore}
          >
            {isLoadingMore ? "불러오는 중…" : "더 보기"}
          </button>
        ) : null}
      </section>
    </main>
  );
}
