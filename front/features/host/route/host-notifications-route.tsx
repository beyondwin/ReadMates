import { useLoaderData, useRevalidator } from "react-router-dom";
import { useState } from "react";
import { HostNotificationsPage } from "@/features/host/ui/host-notifications-page";
import { hostNotificationsActions, type HostNotificationsRouteData } from "./host-notifications-data";

export function HostNotificationsRoute() {
  const data = useLoaderData() as HostNotificationsRouteData;
  const revalidator = useRevalidator();
  const [pages, setPages] = useState(() => ({
    source: data,
    events: data.events,
    deliveries: data.deliveries,
    audit: data.audit,
  }));
  const [loadingMore, setLoadingMore] = useState<null | "events" | "deliveries" | "audit">(null);

  if (pages.source !== data) {
    setPages({
      source: data,
      events: data.events,
      deliveries: data.deliveries,
      audit: data.audit,
    });
  }

  const activePages = pages.source === data
    ? pages
    : {
        source: data,
        events: data.events,
        deliveries: data.deliveries,
        audit: data.audit,
      };
  const { events, deliveries, audit } = activePages;

  const refreshAfter = async (action: () => Promise<unknown>) => {
    await action();
    await revalidator.revalidate();
  };

  const loadMoreEvents = async () => {
    if (!events.nextCursor || loadingMore) return;
    setLoadingMore("events");
    try {
      const nextPage = await hostNotificationsActions.loadEvents({ limit: 50, cursor: events.nextCursor });
      setPages((current) => ({
        ...current,
        events: { items: [...current.events.items, ...nextPage.items], nextCursor: nextPage.nextCursor },
      }));
    } finally {
      setLoadingMore(null);
    }
  };

  const loadMoreDeliveries = async () => {
    if (!deliveries.nextCursor || loadingMore) return;
    setLoadingMore("deliveries");
    try {
      const nextPage = await hostNotificationsActions.loadDeliveries({ limit: 50, cursor: deliveries.nextCursor });
      setPages((current) => ({
        ...current,
        deliveries: { items: [...current.deliveries.items, ...nextPage.items], nextCursor: nextPage.nextCursor },
      }));
    } finally {
      setLoadingMore(null);
    }
  };

  const loadMoreAudit = async () => {
    if (!audit.nextCursor || loadingMore) return;
    setLoadingMore("audit");
    try {
      const nextPage = await hostNotificationsActions.loadAudit({ limit: 50, cursor: audit.nextCursor });
      setPages((current) => ({
        ...current,
        audit: { items: [...current.audit.items, ...nextPage.items], nextCursor: nextPage.nextCursor },
      }));
    } finally {
      setLoadingMore(null);
    }
  };

  return (
    <HostNotificationsPage
      summary={data.summary}
      events={events.items}
      deliveries={deliveries.items}
      audit={audit.items}
      hasMoreEvents={Boolean(events.nextCursor)}
      hasMoreDeliveries={Boolean(deliveries.nextCursor)}
      hasMoreAudit={Boolean(audit.nextCursor)}
      isLoadingMoreEvents={loadingMore === "events"}
      isLoadingMoreDeliveries={loadingMore === "deliveries"}
      isLoadingMoreAudit={loadingMore === "audit"}
      isRefreshing={revalidator.state !== "idle"}
      onLoadMoreEvents={loadMoreEvents}
      onLoadMoreDeliveries={loadMoreDeliveries}
      onLoadMoreAudit={loadMoreAudit}
      onProcess={() => refreshAfter(hostNotificationsActions.process)}
      onRetry={(id) => refreshAfter(() => hostNotificationsActions.retry(id))}
      onRestore={(id) => refreshAfter(() => hostNotificationsActions.restore(id))}
      onSendTestMail={(request) => refreshAfter(() => hostNotificationsActions.sendTestMail(request))}
    />
  );
}
