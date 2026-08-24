import { useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import type {
  AdminNotificationDelivery,
  AdminNotificationOutboxEvent,
  AdminNotificationReplayConfirmResult,
  AdminNotificationReplayPreview,
} from "@/features/platform-admin/model/platform-admin-notifications-model";
import {
  platformAdminNotificationDeliveriesQuery,
  platformAdminNotificationEventsQuery,
  platformAdminNotificationSnapshotQuery,
  useConfirmAdminNotificationReplayMutation,
  usePreviewAdminNotificationReplayMutation,
} from "@/features/platform-admin/queries/platform-admin-notifications-queries";
import { platformAdminSummaryQuery } from "@/features/platform-admin/queries/platform-admin-queries";
import { AdminNotificationsPage } from "@/features/platform-admin/ui/admin-notifications-page";

const GENERIC_ERROR = "알림 운영 정보를 처리하지 못했습니다. 다시 시도해 주세요.";

export function AdminNotificationsRoute() {
  const [searchParams] = useSearchParams();
  const focus = searchParams.get("focus");
  const clubId = searchParams.get("clubId") ?? undefined;
  const [replayPreview, setReplayPreview] = useState<AdminNotificationReplayPreview | null>(null);
  const [replayReason, setReplayReason] = useState("");
  const [replayIntentKey, setReplayIntentKey] = useState<string | null>(null);
  const [commandSubmitted, setCommandSubmitted] = useState(false);
  const [replayResult, setReplayResult] = useState<AdminNotificationReplayConfirmResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const summaryQuery = useQuery(platformAdminSummaryQuery());
  const snapshotQuery = useQuery(platformAdminNotificationSnapshotQuery());
  const eventsQuery = useInfiniteQuery(platformAdminNotificationEventsQuery(clubId ? { clubId } : undefined));
  const deliveriesQuery = useInfiniteQuery(
    platformAdminNotificationDeliveriesQuery(clubId ? { clubId } : undefined),
  );
  const previewMutation = usePreviewAdminNotificationReplayMutation();
  const confirmMutation = useConfirmAdminNotificationReplayMutation();

  const role = summaryQuery.data?.platformRole ?? "SUPPORT";
  const canReplay = role === "OWNER" || role === "OPERATOR";
  const busy = previewMutation.isPending || confirmMutation.isPending;
  const events = uniqueById(eventsQuery.data?.pages.flatMap((page) => page.items) ?? [], "eventId");
  const deliveries = uniqueById(
    deliveriesQuery.data?.pages.flatMap((page) => page.items) ?? [],
    "deliveryId",
  );

  async function previewReplay() {
    if (!canReplay) {
      setError("현재 역할은 재처리를 실행할 수 없습니다.");
      return;
    }
    setError(null);
    setReplayResult(null);
    setReplayIntentKey(null);
    setCommandSubmitted(false);
    try {
      const preview = await previewMutation.mutateAsync({ clubId });
      setReplayPreview(preview);
      setReplayIntentKey(crypto.randomUUID());
    } catch {
      setError("재처리 대상을 확인하지 못했습니다. 다시 시도해 주세요.");
    }
  }

  async function confirmReplay() {
    if (!replayPreview || !replayReason.trim() || !replayIntentKey) return;
    setError(null);
    setCommandSubmitted(true);
    try {
      const result =
        await confirmMutation.mutateAsync({
          previewId: replayPreview.previewId,
          selectionHash: replayPreview.selectionHash,
          reason: replayReason,
          idempotencyKey: replayIntentKey,
        });
      setReplayResult(result);
    } catch {
      setError("재처리 결과를 확인하지 못했습니다. 같은 요청으로 다시 확인해 주세요.");
    }
  }

  const listsLoading = eventsQuery.isLoading || deliveriesQuery.isLoading;
  if (snapshotQuery.isLoading && listsLoading) {
    return <p className="admin-notifications__loading">알림 운영 정보를 불러오는 중입니다.</p>;
  }

  const queryError =
    snapshotQuery.isError || eventsQuery.isError || deliveriesQuery.isError ? GENERIC_ERROR : null;

  return (
    <AdminNotificationsPage
      snapshot={snapshotQuery.data ?? null}
      events={events}
      deliveries={deliveries}
      focus={focus}
      replayPreview={replayPreview}
      replayReason={replayReason}
      replayResult={replayResult}
      canReplay={canReplay}
      busy={busy}
      reasonLocked={commandSubmitted}
      error={error ?? queryError}
      onPreviewReplay={previewReplay}
      onConfirmReplay={confirmReplay}
      onReplayReasonChange={setReplayReason}
      hasMoreEvents={eventsQuery.hasNextPage}
      hasMoreDeliveries={deliveriesQuery.hasNextPage}
      loadingMoreEvents={eventsQuery.isFetchingNextPage}
      loadingMoreDeliveries={deliveriesQuery.isFetchingNextPage}
      onLoadMoreEvents={() => eventsQuery.fetchNextPage().then(() => undefined)}
      onLoadMoreDeliveries={() => deliveriesQuery.fetchNextPage().then(() => undefined)}
    />
  );
}

function uniqueById<T extends AdminNotificationOutboxEvent | AdminNotificationDelivery>(
  items: T[],
  id: T extends AdminNotificationOutboxEvent ? "eventId" : "deliveryId",
): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const value = item[id as keyof T];
    if (typeof value !== "string" || seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}
