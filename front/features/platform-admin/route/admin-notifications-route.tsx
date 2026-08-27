import { useEffect, useState } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import type {
  AdminNotificationDelivery,
  AdminNotificationOutboxEvent,
  AdminNotificationReplayConfirmResult,
  AdminNotificationReplayPreview,
} from "@/features/platform-admin/model/platform-admin-notifications-model";
import { canAdmin } from "@/features/platform-admin/model/platform-admin-capabilities";
import {
  platformAdminNotificationDeliveriesQuery,
  platformAdminNotificationEventsQuery,
  platformAdminNotificationSnapshotQuery,
  useConfirmAdminNotificationReplayMutation,
  usePreviewAdminNotificationReplayMutation,
} from "@/features/platform-admin/queries/platform-admin-notifications-queries";
import {
  installPlatformAdminAuthorityLossHandler,
  isPlatformAdminAuthorityLossError,
  platformAdminCapabilitiesQuery,
} from "@/features/platform-admin/queries/platform-admin-queries";
import { AdminNotificationsPage } from "@/features/platform-admin/ui/admin-notifications-page";

const GENERIC_ERROR = "알림 운영 정보를 처리하지 못했습니다. 다시 시도해 주세요.";

export function AdminNotificationsRoute() {
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const focus = searchParams.get("focus");
  const clubId = searchParams.get("clubId") ?? undefined;
  const capabilities = useQuery(platformAdminCapabilitiesQuery()).data ?? null;
  const canReplay =
    capabilities != null && canAdmin(capabilities, "REPLAY_NOTIFICATIONS");
  const snapshotQuery = useQuery(platformAdminNotificationSnapshotQuery());
  const eventsQuery = useInfiniteQuery(platformAdminNotificationEventsQuery(clubId ? { clubId } : undefined));
  const deliveriesQuery = useInfiniteQuery(
    platformAdminNotificationDeliveriesQuery(clubId ? { clubId } : undefined),
  );

  useEffect(() => {
    installPlatformAdminAuthorityLossHandler(queryClient);
  }, [queryClient]);

  const events = uniqueById(eventsQuery.data?.pages.flatMap((page) => page.items) ?? [], "eventId");
  const deliveries = uniqueById(
    deliveriesQuery.data?.pages.flatMap((page) => page.items) ?? [],
    "deliveryId",
  );
  const listsLoading = eventsQuery.isLoading || deliveriesQuery.isLoading;
  if (snapshotQuery.isLoading && listsLoading) {
    return <p className="admin-notifications__loading">알림 운영 정보를 불러오는 중입니다.</p>;
  }

  const queryError =
    snapshotQuery.isError || eventsQuery.isError || deliveriesQuery.isError ? GENERIC_ERROR : null;

  return (
    <NotificationReplaySession
      key={canReplay ? "replay-allowed" : "replay-denied"}
      canReplay={canReplay}
      clubId={clubId}
      focus={focus}
      snapshot={snapshotQuery.data ?? null}
      events={events}
      deliveries={deliveries}
      queryError={queryError}
      hasMoreEvents={eventsQuery.hasNextPage}
      hasMoreDeliveries={deliveriesQuery.hasNextPage}
      loadingMoreEvents={eventsQuery.isFetchingNextPage}
      loadingMoreDeliveries={deliveriesQuery.isFetchingNextPage}
      onLoadMoreEvents={() => eventsQuery.fetchNextPage().then(() => undefined)}
      onLoadMoreDeliveries={() => deliveriesQuery.fetchNextPage().then(() => undefined)}
    />
  );
}

function NotificationReplaySession({
  canReplay,
  clubId,
  focus,
  snapshot,
  events,
  deliveries,
  queryError,
  hasMoreEvents,
  hasMoreDeliveries,
  loadingMoreEvents,
  loadingMoreDeliveries,
  onLoadMoreEvents,
  onLoadMoreDeliveries,
}: {
  canReplay: boolean;
  clubId: string | undefined;
  focus: string | null;
  snapshot: Parameters<typeof AdminNotificationsPage>[0]["snapshot"];
  events: AdminNotificationOutboxEvent[];
  deliveries: AdminNotificationDelivery[];
  queryError: string | null;
  hasMoreEvents: boolean | undefined;
  hasMoreDeliveries: boolean | undefined;
  loadingMoreEvents: boolean;
  loadingMoreDeliveries: boolean;
  onLoadMoreEvents: () => Promise<void>;
  onLoadMoreDeliveries: () => Promise<void>;
}) {
  const [replayPreview, setReplayPreview] = useState<AdminNotificationReplayPreview | null>(null);
  const [replayReason, setReplayReason] = useState("");
  const [replayIntentKey, setReplayIntentKey] = useState<string | null>(null);
  const [commandSubmitted, setCommandSubmitted] = useState(false);
  const [unknownOutcome, setUnknownOutcome] = useState(false);
  const [replayResult, setReplayResult] = useState<AdminNotificationReplayConfirmResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const previewMutation = usePreviewAdminNotificationReplayMutation();
  const confirmMutation = useConfirmAdminNotificationReplayMutation();
  const busy = previewMutation.isPending || confirmMutation.isPending;

  function purgeReplayState() {
    previewMutation.reset();
    confirmMutation.reset();
    setReplayPreview(null);
    setReplayReason("");
    setReplayIntentKey(null);
    setCommandSubmitted(false);
    setUnknownOutcome(false);
    setReplayResult(null);
    setError(null);
  }

  async function previewReplay() {
    if (commandSubmitted) {
      setError("기존 재처리 결과를 같은 요청으로 먼저 확인해 주세요.");
      return;
    }
    if (!canReplay) return;
    setError(null);
    setReplayResult(null);
    setReplayIntentKey(null);
    setCommandSubmitted(false);
    setUnknownOutcome(false);
    try {
      const preview = await previewMutation.mutateAsync({ clubId });
      setReplayPreview(preview);
      setReplayIntentKey(crypto.randomUUID());
    } catch (caught) {
      if (isPlatformAdminAuthorityLossError(caught)) {
        purgeReplayState();
        return;
      }
      setError("재처리 대상을 확인하지 못했습니다. 다시 시도해 주세요.");
    }
  }

  async function confirmReplay() {
    if (!canReplay || !replayPreview || !replayReason.trim() || !replayIntentKey) return;
    setError(null);
    setCommandSubmitted(true);
    try {
      const result = await confirmMutation.mutateAsync({
        previewId: replayPreview.previewId,
        selectionHash: replayPreview.selectionHash,
        reason: replayReason,
        idempotencyKey: replayIntentKey,
      });
      setReplayResult(result);
      setUnknownOutcome(false);
    } catch (caught) {
      if (isPlatformAdminAuthorityLossError(caught)) {
        purgeReplayState();
        return;
      }
      setUnknownOutcome(true);
      setError("재처리 결과를 확인하지 못했습니다. 같은 요청으로 다시 확인해 주세요.");
    }
  }

  return (
    <AdminNotificationsPage
      snapshot={snapshot}
      events={events}
      deliveries={deliveries}
      focus={focus}
      replayPreview={replayPreview}
      replayReason={replayReason}
      replayResult={replayResult}
      canReplay={canReplay}
      busy={busy}
      reasonLocked={commandSubmitted}
      unknownOutcome={unknownOutcome}
      error={error ?? queryError}
      onPreviewReplay={previewReplay}
      onConfirmReplay={confirmReplay}
      onReplayReasonChange={setReplayReason}
      hasMoreEvents={hasMoreEvents}
      hasMoreDeliveries={hasMoreDeliveries}
      loadingMoreEvents={loadingMoreEvents}
      loadingMoreDeliveries={loadingMoreDeliveries}
      onLoadMoreEvents={onLoadMoreEvents}
      onLoadMoreDeliveries={onLoadMoreDeliveries}
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
