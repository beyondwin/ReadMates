import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { platformAdminAiOpsJobsQuery, platformAdminAiOpsSummaryQuery } from "@/features/platform-admin/queries/platform-admin-ai-ops-queries";
import { platformAdminNotificationSnapshotQuery } from "@/features/platform-admin/queries/platform-admin-notifications-queries";
import { platformAdminClubsQuery, platformAdminSummaryQuery } from "@/features/platform-admin/queries/platform-admin-queries";
import {
  buildPlatformAdminWorkbench,
  type PlatformAdminWorkbenchInput,
  type WorkbenchQueueItem,
} from "@/features/platform-admin/model/platform-admin-workbench-model";
import { AdminTodayLedger } from "@/features/platform-admin/ui/admin-today-ledger";
import { isReadmatesApiError } from "@/shared/api/errors";

export function AdminTodayRoute() {
  const summaryQuery = useQuery(platformAdminSummaryQuery());
  const clubsQuery = useQuery(platformAdminClubsQuery());
  const notificationQuery = useQuery(platformAdminNotificationSnapshotQuery());
  const aiSummaryQuery = useQuery(platformAdminAiOpsSummaryQuery());
  const aiJobsQuery = useQuery(platformAdminAiOpsJobsQuery());
  const [searchParams, setSearchParams] = useSearchParams();
  const filter = searchParams.get("filter");
  const selectedItemId = searchParams.get("selected");

  const summary = summaryQuery.data;
  const clubs = clubsQuery.data;

  if (summaryQuery.isLoading || clubsQuery.isLoading) {
    return <p className="admin-today-ledger__loading">오늘 할 일을 불러오는 중입니다.</p>;
  }

  if (summaryQuery.isError || clubsQuery.isError || !summary || !clubs) {
    return (
      <section className="admin-today-ledger" aria-labelledby="admin-today-title">
        <h1 id="admin-today-title" className="h1 editorial">오늘 할 일</h1>
        <p className="admin-today-ledger__error" role="alert">
          플랫폼 작업 큐를 불러오지 못했습니다. 잠시 뒤 다시 시도해 주세요.
        </p>
      </section>
    );
  }

  const aiDisabled = isReadmatesApiError(aiSummaryQuery.error) && aiSummaryQuery.error.status === 503;
  const input: PlatformAdminWorkbenchInput = {
    role: summary.platformRole,
    activeClubCount: summary.activeClubCount,
    domainActionRequiredCount: summary.domainActionRequiredCount,
    selectedClubId: null,
    selectedItemId,
    clubs: clubs.items.map((club) => ({
      clubId: club.clubId,
      slug: club.slug,
      name: club.name,
      tagline: club.tagline,
      about: club.about,
      status: club.status,
      publicVisibility: club.publicVisibility,
      domainCount: club.domainCount,
      domainActionRequiredCount: club.domainActionRequiredCount,
      firstHostOnboardingState: club.firstHostOnboardingState,
    })),
    domains: (summary.domains ?? summary.domainsRequiringAction ?? []).map((domain) => ({
      id: domain.id,
      clubId: domain.clubId,
      hostname: domain.hostname,
      kind: domain.kind,
      status: domain.status,
      desiredState: domain.desiredState,
      manualAction: domain.manualAction,
      errorCode: domain.errorCode,
      isPrimary: domain.isPrimary,
      verifiedAt: domain.verifiedAt,
      lastCheckedAt: domain.lastCheckedAt,
    })),
    notificationSnapshot: notificationQuery.data ?? null,
    notificationUnavailable: notificationQuery.isError,
    aiJobs: (aiJobsQuery.data?.items ?? []).map((job) => ({
      jobId: job.jobId,
      clubId: job.club.clubId,
      clubName: job.club.name ?? job.club.slug ?? "클럽",
      sessionTitle: job.session.bookTitle ?? "세션",
      status: job.status,
      errorCode: job.errorCode,
      stale: job.staleCandidate,
      startedAt: job.createdAt,
    })),
    aiDisabled,
    aiUnavailable: (aiSummaryQuery.isError || aiJobsQuery.isError) && !aiDisabled,
  };
  const workbench = buildPlatformAdminWorkbench(input);
  const filteredItems = filterQueueItems(workbench.queueItems, filter);
  const filteredWorkbench = { ...workbench, queueItems: filteredItems };

  function handleSelectItem(itemId: string) {
    const next = new URLSearchParams(searchParams);
    next.set("selected", itemId);
    setSearchParams(next, { replace: true });
  }

  function clearFilter() {
    const next = new URLSearchParams(searchParams);
    next.delete("filter");
    setSearchParams(next, { replace: true });
  }

  return (
    <AdminTodayLedger
      workbench={filteredWorkbench}
      selectedItemId={selectedItemId}
      filterLabel={filter ? filterLabel(filter) : null}
      onClearFilter={filter ? clearFilter : undefined}
      onSelectItem={handleSelectItem}
    />
  );
}

function filterQueueItems(items: ReadonlyArray<WorkbenchQueueItem>, filter: string | null): WorkbenchQueueItem[] {
  if (!filter) return [...items];
  return items.filter((item) => matchesFilter(item, filter));
}

function matchesFilter(item: WorkbenchQueueItem, filter: string): boolean {
  if (filter === "setup_required") return item.badges.some((badge) => badge === "SETUP_REQUIRED");
  if (filter === "ready_to_publish") return item.primaryActionLabel === "공개 전환";
  if (filter === "domain_action") return item.badges.some((badge) => badge.includes("FAILED") || badge.includes("ACTION_REQUIRED"));
  if (filter === "operations_warning") return item.severity === "critical" || item.severity === "warn";
  return true;
}

function filterLabel(filter: string): string {
  if (filter === "setup_required") return "조치 필요";
  if (filter === "ready_to_publish") return "공개 준비";
  if (filter === "domain_action") return "도메인 조치";
  if (filter === "operations_warning") return "운영 경고";
  return filter;
}
