import { useRef, useState } from "react";
import { useLoaderData, useNavigate, useRevalidator } from "react-router-dom";
import { MemberNotificationsPage } from "../ui/member-notifications-page";
import { memberNotificationsActions, type MemberNotificationsRouteData } from "./member-notifications-data";

const READ_ACTION_ERROR = "알림을 읽음 처리하지 못했습니다. 다시 시도해 주세요.";

export function MemberNotificationsRoute() {
  const data = useLoaderData() as MemberNotificationsRouteData;
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const pendingReadIdsRef = useRef(new Set<string>());
  const markAllReadPendingRef = useRef(false);
  const [pendingReadIds, setPendingReadIds] = useState<ReadonlySet<string>>(() => new Set());
  const [markAllReadPending, setMarkAllReadPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pageState, setPageState] = useState(() => ({ source: data, page: data }));
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  if (pageState.source !== data) {
    setPageState({ source: data, page: data });
  }

  const page = pageState.source === data ? pageState.page : data;

  const setReadPending = (id: string, pending: boolean) => {
    const next = new Set(pendingReadIdsRef.current);

    if (pending) {
      next.add(id);
    } else {
      next.delete(id);
    }

    pendingReadIdsRef.current = next;
    setPendingReadIds(next);
  };

  const markRead = async (id: string) => {
    if (pendingReadIdsRef.current.has(id) || markAllReadPendingRef.current) {
      return false;
    }

    setActionError(null);
    setReadPending(id, true);

    try {
      await memberNotificationsActions.markRead(id);
      await revalidator.revalidate();
      return true;
    } catch {
      setActionError(READ_ACTION_ERROR);
      return false;
    } finally {
      setReadPending(id, false);
    }
  };

  const markAllRead = async () => {
    if (markAllReadPendingRef.current || pendingReadIdsRef.current.size > 0 || page.unreadCount === 0) {
      return;
    }

    setActionError(null);
    markAllReadPendingRef.current = true;
    setMarkAllReadPending(true);

    try {
      await memberNotificationsActions.markAllRead();
      await revalidator.revalidate();
    } catch {
      setActionError(READ_ACTION_ERROR);
    } finally {
      markAllReadPendingRef.current = false;
      setMarkAllReadPending(false);
    }
  };

  const openNotification = (id: string, href: string) => {
    void (async () => {
      if (await markRead(id)) {
        await navigate(href);
      }
    })();
  };

  const loadMore = async () => {
    if (!page.nextCursor || isLoadingMore) {
      return;
    }

    setActionError(null);
    setIsLoadingMore(true);
    try {
      const nextPage = await memberNotificationsActions.loadMore(undefined, { limit: 50, cursor: page.nextCursor });
      setPageState((current) => ({
        source: current.source,
        page: {
          unreadCount: nextPage.unreadCount,
          items: [...current.page.items, ...nextPage.items],
          nextCursor: nextPage.nextCursor,
        },
      }));
    } catch {
      setActionError("알림을 더 불러오지 못했습니다.");
    } finally {
      setIsLoadingMore(false);
    }
  };

  return (
    <MemberNotificationsPage
      unreadCount={page.unreadCount}
      items={page.items}
      hasMore={Boolean(page.nextCursor)}
      isLoadingMore={isLoadingMore}
      pendingReadIds={pendingReadIds}
      markAllReadPending={markAllReadPending}
      actionError={actionError}
      onMarkRead={(id) => {
        void markRead(id);
      }}
      onMarkAllRead={() => {
        void markAllRead();
      }}
      onOpenNotification={openNotification}
      onLoadMore={() => {
        void loadMore();
      }}
    />
  );
}
