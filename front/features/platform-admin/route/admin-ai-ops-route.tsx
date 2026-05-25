import { useQuery } from "@tanstack/react-query";
import { PlatformAdminAiOps } from "@/features/platform-admin/ui/platform-admin-ai-ops";
import {
  platformAdminAiOpsJobsQuery,
  platformAdminAiOpsSummaryQuery,
  useForceCancelPlatformAdminAiJobMutation,
} from "@/features/platform-admin/queries/platform-admin-ai-ops-queries";
import { platformAdminSummaryQuery } from "@/features/platform-admin/queries/platform-admin-queries";

export function AdminAiOpsRoute() {
  const role = useQuery(platformAdminSummaryQuery()).data!.platformRole;
  const summaryQuery = useQuery(platformAdminAiOpsSummaryQuery());
  const jobsQuery = useQuery(platformAdminAiOpsJobsQuery());
  const forceCancel = useForceCancelPlatformAdminAiJobMutation();

  const disabled = summaryQuery.error instanceof Response && summaryQuery.error.status === 503;

  if (disabled) {
    return (
      <section className="admin-ai-ops admin-ai-ops--disabled" aria-labelledby="admin-ai-ops-title">
        <h1 id="admin-ai-ops-title" className="h1 editorial">AI Ops</h1>
        <div className="admin-ai-ops__disabled-card">
          <p className="eyebrow">운영 정상</p>
          <p className="body">AI generation이 일시 비활성 상태입니다. 활성화되면 작업 큐가 자동으로 다시 채워집니다.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="admin-ai-ops" aria-labelledby="admin-ai-ops-title">
      <h1 id="admin-ai-ops-title" className="h1 editorial">AI Ops</h1>
      <PlatformAdminAiOps
        role={role}
        summary={summaryQuery.data ?? null}
        jobs={jobsQuery.data?.items ?? []}
        loading={summaryQuery.isLoading || jobsQuery.isLoading}
        error={summaryQuery.error instanceof Error ? summaryQuery.error.message : null}
        onForceCancel={(jobId) => forceCancel.mutate(jobId)}
      />
    </section>
  );
}
