import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { platformAdminSummaryQuery } from "@/features/platform-admin/queries/platform-admin-queries";
import {
  platformAdminNotificationDeliveriesQuery,
  platformAdminNotificationEventsQuery,
  platformAdminNotificationSnapshotQuery,
  useConfirmAdminNotificationReplayMutation,
  usePreviewAdminNotificationReplayMutation,
} from "@/features/platform-admin/queries/platform-admin-notifications-queries";
import type { AdminNotificationReplayPreview } from "@/features/platform-admin/model/platform-admin-notifications-model";
import { AdminNotificationsPage } from "@/features/platform-admin/ui/admin-notifications-page";

const GENERIC_ERROR = "알림 운영 정보를 처리하지 못했습니다. 다시 시도해 주세요.";

export function AdminNotificationsRoute() {
  const [searchParams] = useSearchParams();
  const focus = searchParams.get("focus");
  const clubId = searchParams.get("clubId") ?? undefined;
  const [replayPreview, setReplayPreview] = useState<AdminNotificationReplayPreview | null>(null);
  const [replayReason, setReplayReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const summaryQuery = useQuery(platformAdminSummaryQuery());
  const snapshotQuery = useQuery(platformAdminNotificationSnapshotQuery());
  const eventsQuery = useQuery(platformAdminNotificationEventsQuery(clubId ? { clubId } : undefined));
  const deliveriesQuery = useQuery(platformAdminNotificationDeliveriesQuery(clubId ? { clubId } : undefined));
  const previewMutation = usePreviewAdminNotificationReplayMutation();
  const confirmMutation = useConfirmAdminNotificationReplayMutation();

  const role = summaryQuery.data?.platformRole ?? "SUPPORT";
  const canReplay = role === "OWNER" || role === "OPERATOR";
  const busy = previewMutation.isPending || confirmMutation.isPending;

  async function previewReplay() {
    if (!canReplay) {
      setError("현재 역할은 재처리를 실행할 수 없습니다.");
      return;
    }
    setError(null);
    setSuccess(null);
    try {
      const preview = await previewMutation.mutateAsync({ clubId });
      setReplayPreview(preview);
    } catch {
      setError("재처리 대상을 확인하는 중입니다.");
    }
  }

  async function confirmReplay() {
    if (!replayPreview || !replayReason.trim()) return;
    setError(null);
    setSuccess(null);
    try {
      const result = await confirmMutation.mutateAsync({
        previewId: replayPreview.previewId,
        selectionHash: replayPreview.selectionHash,
        reason: replayReason,
      });
      setReplayPreview(null);
      setReplayReason("");
      setSuccess(`${result.replayedCount}건 재처리를 기록했습니다.`);
    } catch {
      setError("재처리를 기록하는 중입니다.");
    }
  }

  if (snapshotQuery.isLoading || eventsQuery.isLoading || deliveriesQuery.isLoading) {
    return <p className="admin-notifications__loading">알림 운영 정보를 불러오는 중입니다.</p>;
  }

  if (snapshotQuery.isError || !snapshotQuery.data) {
    return <p className="admin-notifications__error" role="alert">{GENERIC_ERROR}</p>;
  }

  return (
    <AdminNotificationsPage
      snapshot={snapshotQuery.data}
      events={eventsQuery.data?.items ?? []}
      deliveries={deliveriesQuery.data?.items ?? []}
      focus={focus}
      replayPreview={replayPreview}
      replayReason={replayReason}
      canReplay={canReplay}
      busy={busy}
      error={error ?? (eventsQuery.isError || deliveriesQuery.isError ? GENERIC_ERROR : null)}
      success={success}
      onPreviewReplay={previewReplay}
      onConfirmReplay={confirmReplay}
      onReplayReasonChange={setReplayReason}
    />
  );
}
