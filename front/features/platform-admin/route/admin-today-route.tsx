import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { ClubOperationsBrief } from "@/features/platform-admin/ui/club-operations-brief";
import { PlatformAdminWorkQueue } from "@/features/platform-admin/ui/platform-admin-work-queue";
import {
  buildPlatformAdminWorkbench,
  type PlatformAdminWorkbenchInput,
  type WorkbenchQueueItem,
} from "@/features/platform-admin/model/platform-admin-workbench-model";
import {
  platformAdminAiOpsJobsQuery,
  platformAdminAiOpsSummaryQuery,
} from "@/features/platform-admin/queries/platform-admin-ai-ops-queries";
import {
  platformAdminClubsQuery,
  platformAdminSummaryQuery,
} from "@/features/platform-admin/queries/platform-admin-queries";

export function AdminTodayRoute() {
  const summary = useQuery(platformAdminSummaryQuery()).data!;
  const clubs = useQuery(platformAdminClubsQuery()).data!;
  const aiSummary = useQuery(platformAdminAiOpsSummaryQuery()).data ?? null;
  const aiJobsData = useQuery(platformAdminAiOpsJobsQuery()).data;
  const aiJobs = useMemo(() => aiJobsData?.items ?? [], [aiJobsData]);
  const [searchParams] = useSearchParams();
  const filter = searchParams.get("filter");
  const [selectedClubId, setSelectedClubId] = useState<string | null>(searchParams.get("selected"));

  const workbench = useMemo(() => {
    const input: PlatformAdminWorkbenchInput = {
      role: summary.platformRole,
      activeClubCount: summary.activeClubCount,
      domainActionRequiredCount: summary.domainActionRequiredCount,
      selectedClubId,
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
        clubId: domain.clubId,
        hostname: domain.hostname,
        status: domain.status,
        manualAction: domain.manualAction,
        isPrimary: domain.isPrimary,
      })),
      aiJobs: aiJobs.map((job) => ({
        jobId: job.jobId,
        clubId: job.club.clubId,
        clubName: job.club.name ?? "—",
        sessionTitle: job.session.bookTitle ?? "—",
        status: job.status,
        stale: job.staleCandidate,
      })),
      aiDisabled: false,
    };
    return buildPlatformAdminWorkbench(input);
  }, [summary, clubs, aiJobs, selectedClubId]);
  void aiSummary;

  const filteredItems = useMemo(
    () => filterQueueItems(workbench.queueItems, filter),
    [workbench.queueItems, filter],
  );

  const clubItemsOnly = useMemo(
    () => filteredItems.filter((item) => item.type !== "ai"),
    [filteredItems],
  );

  return (
    <section className="admin-today" aria-labelledby="admin-today-title">
      <header className="admin-today__header">
        <h1 id="admin-today-title" className="h1 editorial">오늘 할 일</h1>
        {filter ? <FilterBanner filter={filter} /> : null}
      </header>
      <div className="admin-today__columns">
        <section className="admin-today__queue" aria-label="작업 큐">
          <PlatformAdminWorkQueue
            items={clubItemsOnly}
            selectedClubId={selectedClubId}
            onSelectClub={setSelectedClubId}
          />
        </section>
        <section className="admin-today__brief" aria-label="선택 항목 요약">
          <ClubOperationsBrief
            club={workbench.selectedClub}
            permissions={workbench.permissions}
          />
        </section>
      </div>
    </section>
  );
}

function filterQueueItems(items: ReadonlyArray<WorkbenchQueueItem>, filter: string | null): WorkbenchQueueItem[] {
  if (!filter) return [...items];
  return items.filter((item) => matchesFilter(item, filter));
}

function matchesFilter(item: WorkbenchQueueItem, filter: string): boolean {
  if (item.type === "ai") return false;
  if (filter === "setup_required") return item.badges.some((b) => b === "SETUP_REQUIRED");
  if (filter === "ready_to_publish") return item.primaryActionLabel === "공개 전환";
  if (filter === "domain_action") return item.badges.some((b) => b.startsWith("도메인") || b.includes("FAILED") || b.includes("ACTION_REQUIRED"));
  return true;
}

function FilterBanner({ filter }: { filter: string }) {
  const label =
    filter === "setup_required" ? "조치 필요"
      : filter === "ready_to_publish" ? "공개 준비"
      : filter === "domain_action" ? "도메인 조치"
      : filter;
  return (
    <p className="admin-today__filter-banner">
      필터: {label}
      <Link to="/admin/today" className="admin-today__filter-clear"> · 해제</Link>
    </p>
  );
}
