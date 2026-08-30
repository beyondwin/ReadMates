import { useRef, useState } from "react";
import { useLoaderData, useNavigate, useRevalidator } from "react-router";
import type { ReadmatesReturnState } from "@/shared/routing/readmates-route-state";
import { publishTransitionAction, useTransitionSafetyOwner } from "@/shared/ui/use-transition-safety-owner";
import { MemberNotificationsPage } from "../ui/member-notifications-page";
import { memberNotificationsActions, publishMemberNotificationsRefresh, type MemberNotificationsRouteData } from "./member-notifications-data";

const READ_ACTION_ERROR = "알림을 읽음 처리하지 못했습니다. 다시 시도해 주세요.";

export function MemberNotificationsRoute() {
  const data = useLoaderData() as MemberNotificationsRouteData;
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const transitionOwner = useTransitionSafetyOwner("member-notifications");
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

  const markRead = async (id: string, onAccepted?: () => void | Promise<void>) => {
    if (pendingReadIdsRef.current.has(id) || markAllReadPendingRef.current) {
      return false;
    }

    setActionError(null);
    setReadPending(id, true);
    const operationId = `member-notification-read-${id}`;
    const handle = transitionOwner.begin(operationId, "L1", async () => ({ operationId, outcome: "still-unknown" }));

    try {
      await memberNotificationsActions.markRead(id);
      if (await handle.settle("succeeded") !== "accepted") return false;
      await publishTransitionAction(handle, "cache", () => publishMemberNotificationsRefresh(() => revalidator.revalidate()));
      if (onAccepted) await publishTransitionAction(handle, "navigation", onAccepted);
      return true;
    } catch {
      if (await handle.settle("failed") === "accepted") {
        handle.publishAccepted({ surface: "errorCopy", publish: () => setActionError(READ_ACTION_ERROR) });
      }
      return false;
    } finally {
      handle.publishAccepted({ surface: "ui", publish: () => setReadPending(id, false) });
    }
  };

  const markAllRead = async () => {
    if (markAllReadPendingRef.current || pendingReadIdsRef.current.size > 0 || page.unreadCount === 0) {
      return;
    }

    setActionError(null);
    markAllReadPendingRef.current = true;
    setMarkAllReadPending(true);
    const operationId = `member-notifications-read-all-${globalThis.crypto.randomUUID()}`;
    const handle = transitionOwner.begin(operationId, "L1", async () => ({ operationId, outcome: "still-unknown" }));

    try {
      await memberNotificationsActions.markAllRead();
      if (await handle.settle("succeeded") === "accepted") {
        await publishTransitionAction(handle, "cache", () => publishMemberNotificationsRefresh(() => revalidator.revalidate()));
      }
    } catch {
      if (await handle.settle("failed") === "accepted") {
        handle.publishAccepted({ surface: "errorCopy", publish: () => setActionError(READ_ACTION_ERROR) });
      }
    } finally {
      handle.publishAccepted({
        surface: "ui",
        publish: () => {
          markAllReadPendingRef.current = false;
          setMarkAllReadPending(false);
        },
      });
    }
  };

  const openNotification = (id: string, href: string, state?: ReadmatesReturnState) => {
    void markRead(id, () => navigate(href, { state }));
  };

  const navigateNotification = (href: string, state: ReadmatesReturnState) => {
    void navigate(href, { state });
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
      onMarkAllRead={() => {
        void markAllRead();
      }}
      onOpenNotification={openNotification}
      onNavigateNotification={navigateNotification}
      onLoadMore={() => {
        void loadMore();
      }}
    />
  );
}
