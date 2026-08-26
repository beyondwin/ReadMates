import { useEffect, useMemo, useState } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import type { PlatformAdminAiOpsAction } from "@/features/platform-admin/api/platform-admin-contracts";
import { canAdmin } from "@/features/platform-admin/model/platform-admin-capabilities";
import {
  aiOpsFilterFromSearchParams,
  aiOpsFilterToQuery,
  aiOpsSearchFromFilter,
  aiOpsWindowFromSearchParams,
  classifyAiOpsError,
  EMPTY_AI_OPS_FILTER,
  mergeAiOpsJobPages,
} from "@/features/platform-admin/model/platform-admin-ai-ops-model";
import {
  platformAdminAiOpsJobQuery,
  platformAdminAiOpsJobsInfiniteQuery,
  platformAdminAiOpsSummaryQuery,
  useConfirmPlatformAdminAiJobCommandMutation,
  usePreviewPlatformAdminAiJobCommandMutation,
} from "@/features/platform-admin/queries/platform-admin-ai-ops-queries";
import {
  installPlatformAdminAuthorityLossHandler,
  isPlatformAdminAuthorityLossError,
  platformAdminCapabilitiesQuery,
  platformAdminSummaryQuery,
  subscribePlatformAdminAuthorityLoss,
} from "@/features/platform-admin/queries/platform-admin-queries";
import {
  PlatformAdminAiOps,
  type PlatformAdminAiOpsCommandState,
  type PlatformAdminAiOpsJobView,
  type PlatformAdminAiOpsSummaryView,
} from "@/features/platform-admin/ui/platform-admin-ai-ops";

export function AdminAiOpsRoute() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const filter = useMemo(() => aiOpsFilterFromSearchParams(searchParams), [searchParams]);
  const window = useMemo(() => aiOpsWindowFromSearchParams(searchParams), [searchParams]);
  const adminSummaryQuery = useQuery(platformAdminSummaryQuery());
  const capabilitiesQuery = useQuery(platformAdminCapabilitiesQuery());
  const summaryQuery = useQuery(platformAdminAiOpsSummaryQuery(window));
  const jobsQuery = useInfiniteQuery(platformAdminAiOpsJobsInfiniteQuery(aiOpsFilterToQuery(filter)));
  const jobQuery = useQuery(platformAdminAiOpsJobQuery(filter.jobId ?? ""));
  const jobs = useMemo(() => mergeAiOpsJobPages(jobsQuery.data?.pages ?? []), [jobsQuery.data?.pages]);
  const canManageActions =
    capabilitiesQuery.data != null && canAdmin(capabilitiesQuery.data, "MANAGE_AI_OPERATIONS");

  useEffect(() => {
    installPlatformAdminAuthorityLossHandler(queryClient);
  }, [queryClient]);

  const summaryError = summaryQuery.error ? classifyAiOpsError(summaryQuery.error) : null;
  const jobsError = jobsQuery.error ? classifyAiOpsError(jobsQuery.error) : null;
  const jobError = jobQuery.error ? classifyAiOpsError(jobQuery.error) : null;
  const disabled = summaryError?.kind === "DISABLED" || jobsError?.kind === "DISABLED";

  function updateSearch(nextFilter: typeof filter, nextWindow = window) {
    const params = aiOpsSearchFromFilter(nextFilter);
    if (nextWindow !== "30d") {
      params.set("window", nextWindow);
    }
    setSearchParams(params);
  }

  if (disabled) {
    return (
      <section className="admin-ai-ops admin-ai-ops--disabled" aria-labelledby="admin-ai-ops-title">
        <h1 id="admin-ai-ops-title" className="h1 editorial">AI Ops</h1>
        <div className="admin-ai-ops__disabled-card">
          <p className="eyebrow">기능 비활성</p>
          <p className="body">AI generation 운영 기능이 현재 비활성 상태입니다.</p>
        </div>
      </section>
    );
  }

  if (!adminSummaryQuery.data || !capabilitiesQuery.data) {
    return (
      <section className="admin-ai-ops" aria-labelledby="admin-ai-ops-title">
        <h1 id="admin-ai-ops-title" className="h1 editorial">AI Ops</h1>
        <p className="platform-admin-ai-ops__error" role="status" aria-label="관리자 권한 확인 중">
          관리자 권한을 다시 확인하고 있습니다.
        </p>
      </section>
    );
  }

  const readError = summaryError && !jobsError ? summaryError : null;
  const queryError =
    jobError && filter.jobId
      ? "선택한 AI 작업 상세를 불러오지 못했습니다."
      : readError
        ? "일부 AI 운영 데이터를 불러오지 못했습니다."
        : null;

  return (
    <AiOpsCommandSession
      key={canManageActions ? "manage-allowed" : "manage-denied"}
      canManageActions={canManageActions}
      role={adminSummaryQuery.data.platformRole}
      summary={summaryQuery.data ?? null}
      jobs={jobs}
      loading={summaryQuery.isLoading || jobsQuery.isLoading}
      queryError={queryError}
      jobsUnavailable={Boolean(jobsError)}
      filter={filter}
      window={window}
      selectedJob={filter.jobId ? (jobQuery.data ?? null) : null}
      hasNextPage={jobsQuery.hasNextPage}
      fetchingNextPage={jobsQuery.isFetchingNextPage}
      onUpdateSearch={updateSearch}
      onLoadMore={() => void jobsQuery.fetchNextPage()}
      jobDetail={filter.jobId === jobQuery.data?.jobId ? jobQuery.data : null}
    />
  );
}

function AiOpsCommandSession({
  canManageActions,
  role,
  summary,
  jobs,
  loading,
  queryError,
  jobsUnavailable,
  filter,
  window,
  selectedJob,
  hasNextPage,
  fetchingNextPage,
  onUpdateSearch,
  onLoadMore,
  jobDetail,
}: {
  canManageActions: boolean;
  role: "OWNER" | "OPERATOR" | "SUPPORT";
  summary: PlatformAdminAiOpsSummaryView | null;
  jobs: PlatformAdminAiOpsJobView[];
  loading: boolean;
  queryError: string | null;
  jobsUnavailable: boolean;
  filter: ReturnType<typeof aiOpsFilterFromSearchParams>;
  window: ReturnType<typeof aiOpsWindowFromSearchParams>;
  selectedJob: PlatformAdminAiOpsJobView | null;
  hasNextPage: boolean;
  fetchingNextPage: boolean;
  onUpdateSearch: (nextFilter: ReturnType<typeof aiOpsFilterFromSearchParams>, nextWindow?: ReturnType<typeof aiOpsWindowFromSearchParams>) => void;
  onLoadMore: () => void;
  jobDetail: PlatformAdminAiOpsJobView | null;
}) {
  const [commandState, setCommandState] = useState<PlatformAdminAiOpsCommandState | null>(null);
  const [commandError, setCommandError] = useState<string | null>(null);
  const previewCommand = usePreviewPlatformAdminAiJobCommandMutation();
  const confirmCommandMutation = useConfirmPlatformAdminAiJobCommandMutation();

  useEffect(
    () =>
      subscribePlatformAdminAuthorityLoss(() => {
        setCommandState(null);
        setCommandError(null);
      }),
    [],
  );

  async function requestPreview(jobId: string, action: PlatformAdminAiOpsAction) {
    if (!canManageActions) return;
    const job = jobs.find((item) => item.jobId === jobId) ?? (filter.jobId === jobId ? jobDetail : null);
    if (!job) {
      setCommandError("작업의 최신 상태를 찾지 못했습니다. 목록을 새로고침해 주세요.");
      return;
    }
    setCommandError(null);
    try {
      const preview = await previewCommand.mutateAsync({ jobId, action });
      setCommandState({
        phase: "REVIEW",
        job,
        action,
        preview,
        idempotencyKey: preview.previewId,
      });
    } catch (error) {
      if (isPlatformAdminAuthorityLossError(error)) {
        setCommandState(null);
        setCommandError(null);
        return;
      }
      const classified = classifyAiOpsError(error);
      setCommandError(
        classified.kind === "CONFLICT"
          ? "작업 상태가 변경되었습니다. 최신 목록에서 다시 검토해 주세요."
          : classified.message,
      );
    }
  }

  async function confirmCommand() {
    const current = commandState;
    if (!canManageActions || !current || current.phase === "CONFIRMING") {
      return;
    }
    const request = {
      previewId: current.preview.previewId,
      idempotencyKey: current.idempotencyKey,
      expectedJobRevision: current.preview.jobRevision,
      confirmed: true as const,
    };
    setCommandState({ ...current, phase: "CONFIRMING" });
    try {
      const receipt = await confirmCommandMutation.mutateAsync({
        jobId: current.job.jobId,
        action: current.action,
        request,
      });
      setCommandState({ ...current, phase: "RECEIPT", receipt });
    } catch (error) {
      if (isPlatformAdminAuthorityLossError(error)) {
        setCommandState(null);
        setCommandError(null);
        return;
      }
      const classified = classifyAiOpsError(error);
      setCommandState({
        ...current,
        phase: "UNKNOWN",
        code: classified.code ?? "NETWORK_UNKNOWN",
        message:
          classified.kind === "CONFLICT"
            ? "작업 상태가 변경되었습니다. 최신 상태로 다시 검토해 주세요."
            : "명령 응답을 확인하지 못했습니다. 같은 명령으로 다시 확인해 주세요.",
      });
    }
  }

  return (
    <section className="admin-ai-ops" aria-labelledby="admin-ai-ops-title">
      <h1 id="admin-ai-ops-title" className="h1 editorial">AI Ops</h1>
      <PlatformAdminAiOps
        role={role}
        canManageActions={canManageActions}
        summary={summary}
        jobs={jobs}
        loading={loading}
        error={commandError ?? queryError}
        jobsUnavailable={jobsUnavailable}
        commandState={commandState}
        onRequestPreview={(jobId, action) => void requestPreview(jobId, action)}
        onConfirmCommand={() => void confirmCommand()}
        onRetrySameCommand={() => void confirmCommand()}
        onRestartPreview={() => {
          if (!commandState) return;
          const { job, action } = commandState;
          setCommandState(null);
          void requestPreview(job.jobId, action);
        }}
        onDismissCommand={() => setCommandState(null)}
        activeFilter={filter}
        onSelectFailureCode={(code) => onUpdateSearch({ ...filter, errorCode: code, jobId: null })}
        onClearFilter={() => onUpdateSearch(EMPTY_AI_OPS_FILTER)}
        window={window}
        onSelectWindow={(next) => onUpdateSearch(filter, next)}
        selectedJob={selectedJob}
        onSelectJob={(jobId) => onUpdateSearch({ ...filter, jobId })}
        onCloseJob={() => onUpdateSearch({ ...filter, jobId: null })}
        hasNextPage={hasNextPage}
        fetchingNextPage={fetchingNextPage}
        onLoadMore={onLoadMore}
      />
    </section>
  );
}
