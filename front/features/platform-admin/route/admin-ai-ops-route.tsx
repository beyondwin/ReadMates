import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { PlatformAdminAiOps } from "@/features/platform-admin/ui/platform-admin-ai-ops";
import {
  platformAdminAiOpsJobsQuery,
  platformAdminAiOpsSummaryQuery,
  useForceCancelPlatformAdminAiJobMutation,
  useRetryCommitPlatformAdminAiJobMutation,
} from "@/features/platform-admin/queries/platform-admin-ai-ops-queries";
import { platformAdminSummaryQuery } from "@/features/platform-admin/queries/platform-admin-queries";
import {
  aiOpsFilterFromSearchParams,
  aiOpsFilterToQuery,
  aiOpsSearchFromFilter,
  aiOpsWindowFromSearchParams,
  EMPTY_AI_OPS_FILTER,
} from "@/features/platform-admin/model/platform-admin-ai-ops-model";

export function AdminAiOpsRoute() {
  const [searchParams, setSearchParams] = useSearchParams();
  const filter = useMemo(() => aiOpsFilterFromSearchParams(searchParams), [searchParams]);
  const window = useMemo(() => aiOpsWindowFromSearchParams(searchParams), [searchParams]);
  const role = useQuery(platformAdminSummaryQuery()).data!.platformRole;
  const summaryQuery = useQuery(platformAdminAiOpsSummaryQuery(window));
  const jobsQuery = useQuery(platformAdminAiOpsJobsQuery(aiOpsFilterToQuery(filter)));
  const forceCancel = useForceCancelPlatformAdminAiJobMutation();
  const retryCommit = useRetryCommitPlatformAdminAiJobMutation();

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
        onRetryCommit={(jobId) => retryCommit.mutate(jobId)}
        activeFilter={filter}
        onSelectFailureCode={(code) =>
          setSearchParams(aiOpsSearchFromFilter({ ...EMPTY_AI_OPS_FILTER, errorCode: code }))
        }
        onClearFilter={() => setSearchParams(aiOpsSearchFromFilter(EMPTY_AI_OPS_FILTER))}
        window={window}
        onSelectWindow={(next) => {
          const params = aiOpsSearchFromFilter(filter);
          params.set("window", next);
          setSearchParams(params);
        }}
      />
    </section>
  );
}
