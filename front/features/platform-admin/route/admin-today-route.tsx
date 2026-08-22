import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import type {
  AdminOperationCase,
  AdminOperationCaseFilter,
  AdminOperationCasesResponse,
  AdminOperationCaseState,
  AdminOperationSeverity,
  AdminOperationSourceType,
} from "@/features/platform-admin/api/platform-admin-operations-contracts";
import { canAdmin } from "@/features/platform-admin/model/platform-admin-capabilities";
import {
  buildAdminOperationsView,
  parseAdminOperationsSearch,
  serializeAdminOperationsSearch,
} from "@/features/platform-admin/model/platform-admin-operations-model";
import {
  adminOperationsKeys,
  platformAdminOperationCaseQuery,
  platformAdminOperationCasePagesQuery,
  useAcknowledgeAdminOperationCaseMutation,
  useResolveAdminOperationCaseMutation,
  useSnoozeAdminOperationCaseMutation,
} from "@/features/platform-admin/queries/platform-admin-operations-queries";
import {
  installPlatformAdminAuthorityLossHandler,
  platformAdminCapabilitiesQuery,
  subscribePlatformAdminAuthorityLoss,
} from "@/features/platform-admin/queries/platform-admin-queries";
import {
  AdminOperationStateActions,
  type AdminOperationActionMessage,
} from "@/features/platform-admin/ui/admin-operation-state-actions";
import { AdminPageFrame } from "@/features/platform-admin/ui/admin-page-frame";
import { AdminStatePanel, type AdminPageState } from "@/features/platform-admin/ui/admin-state-panel";
import {
  ADMIN_TODAY_DESCRIPTION,
  ADMIN_TODAY_HEADING,
  AdminTodayLedger,
  type AdminTodayFilters,
} from "@/features/platform-admin/ui/admin-today-ledger";

export function AdminTodayRoute() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const searchState = useMemo(() => parseAdminOperationsSearch(searchParams), [searchParams]);
  const [authorityLost, setAuthorityLost] = useState(false);
  const [actionMessage, setActionMessage] = useState<AdminOperationActionMessage | null>(null);
  const [mutationPermissionDenied, setMutationPermissionDenied] = useState(false);

  useEffect(() => {
    installPlatformAdminAuthorityLossHandler(queryClient);
    return subscribePlatformAdminAuthorityLoss(() => {
      setAuthorityLost(true);
    });
  }, [queryClient]);

  const capabilitiesQuery = useQuery({
    ...platformAdminCapabilitiesQuery(),
    enabled: !authorityLost,
  });
  const canViewToday =
    !authorityLost &&
    capabilitiesQuery.data != null &&
    canAdmin(capabilitiesQuery.data, "VIEW_TODAY");

  const listQuery = useInfiniteQuery({
    ...platformAdminOperationCasePagesQuery(searchState.filter, { active: canViewToday }),
    enabled: canViewToday,
  });
  const listResponse = useMemo(
    () => combineCasePages(listQuery.data?.pages ?? []),
    [listQuery.data?.pages],
  );
  const listView = useMemo(
    () => listResponse ? buildAdminOperationsView(listResponse, searchState.caseId) : null,
    [listResponse, searchState.caseId],
  );
  const selectedCaseId = listView?.selectedCaseId ?? null;
  const detailQuery = useQuery({
    ...platformAdminOperationCaseQuery(selectedCaseId ?? ""),
    enabled: selectedCaseId !== null && canViewToday,
  });
  const acknowledgeMutation = useAcknowledgeAdminOperationCaseMutation();
  const snoozeMutation = useSnoozeAdminOperationCaseMutation();
  const resolveMutation = useResolveAdminOperationCaseMutation();

  const view = useMemo(() => {
    if (!listResponse || !listView) return null;
    if (!detailQuery.data || detailQuery.data.item.id !== listView.selectedCaseId) return listView;
    const listedCase = listResponse.items.find((item) => item.id === detailQuery.data.item.id);
    const selectedItem = listedCase && listedCase.version > detailQuery.data.item.version
      ? listedCase
      : detailQuery.data.item;
    return buildAdminOperationsView(
      { ...listResponse, items: listResponse.items.map((item) => item.id === selectedItem.id ? selectedItem : item) },
      selectedItem.id,
    );
  }, [detailQuery.data, listResponse, listView]);

  const detailBehindList = Boolean(
    detailQuery.data &&
    view?.selectedCase &&
    detailQuery.data.item.id === view.selectedCase.id &&
    detailQuery.data.item.version < view.selectedCase.version,
  );

  useEffect(() => {
    if (!detailBehindList || !selectedCaseId || !canViewToday) return;
    void queryClient.refetchQueries({
      queryKey: adminOperationsKeys.detail(selectedCaseId),
      exact: true,
    });
  }, [canViewToday, detailBehindList, detailQuery.data?.item.version, queryClient, selectedCaseId, view?.selectedCase?.version]);

  useEffect(() => {
    if (!view || view.selectedCaseId === searchState.caseId) return;
    setSearchParams(
      serializeAdminOperationsSearch({ caseId: view.selectedCaseId, filter: searchState.filter }),
      { replace: true },
    );
  }, [searchState.caseId, searchState.filter, setSearchParams, view]);

  const listForbidden = hasHttpStatus(listQuery.error, 403);
  const capabilitiesForbidden =
    authorityLost ||
    hasHttpStatus(capabilitiesQuery.error, 403) ||
    (capabilitiesQuery.data != null && !canAdmin(capabilitiesQuery.data, "VIEW_TODAY"));

  if (capabilitiesForbidden || listForbidden) {
    return (
      <TodayBoundary
        state="forbidden"
        title="권한이 없습니다"
        description="현재 역할로 운영 케이스를 확인할 수 없습니다. 권한을 확인해 주세요."
      />
    );
  }

  if (capabilitiesQuery.isError && !capabilitiesQuery.data) {
    return (
      <TodayBoundary
        state="unavailable"
        title="운영 케이스를 불러오지 못했습니다"
        description="잠시 뒤 다시 시도해 주세요."
        action={
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void capabilitiesQuery.refetch()}
          >
            다시 시도
          </button>
        }
      />
    );
  }

  if (capabilitiesQuery.isPending || (canViewToday && listQuery.isPending && !listQuery.data)) {
    return (
      <TodayBoundary
        state="loading"
        title="운영 케이스를 불러오는 중입니다."
        description=""
      />
    );
  }

  if ((listQuery.isError && !listResponse) || !view) {
    return (
      <TodayBoundary
        state="unavailable"
        title="운영 케이스를 불러오지 못했습니다"
        description="잠시 뒤 다시 시도해 주세요."
        action={
          <button type="button" className="btn btn-primary" onClick={() => void listQuery.refetch()}>
            다시 시도
          </button>
        }
      />
    );
  }

  const currentCase = view.selectedCase;
  const pending = detailQuery.isPending || acknowledgeMutation.isPending || snoozeMutation.isPending || resolveMutation.isPending;

  async function runMutation(operation: () => Promise<unknown>) {
    setActionMessage(null);
    try {
      await operation();
      setActionMessage({ kind: "success", text: "케이스 상태를 반영했습니다." });
    } catch (error) {
      if (hasHttpStatus(error, 403)) {
        setMutationPermissionDenied(true);
        return;
      }
      if (hasAdminOperationErrorCode(error, "CASE_VERSION_CONFLICT")) {
        setActionMessage({ kind: "conflict", text: "최신 상태 확인이 필요합니다." });
        if (selectedCaseId) {
          await queryClient.refetchQueries({
            queryKey: adminOperationsKeys.detail(selectedCaseId),
            exact: true,
          });
        }
        return;
      }
      if (hasAdminOperationErrorCode(error, "CASE_STILL_ACTIVE")) {
        setActionMessage({
          kind: "error",
          text: "신호가 아직 활성 상태입니다. 운영 상세에서 원인을 해소한 뒤 다시 확인해 주세요.",
        });
        return;
      }
      setActionMessage({
        kind: "error",
        text: "상태를 변경하지 못했습니다. 잠시 뒤 다시 시도해 주세요.",
      });
    }
  }

  function changeFilter(key: keyof AdminTodayFilters, value: string) {
    const filter: AdminOperationCaseFilter = { ...searchState.filter };
    delete filter.cursor;
    if (key === "state") filter.states = value ? [value.toUpperCase() as AdminOperationCaseState] : undefined;
    if (key === "severity") filter.severities = value ? [value.toUpperCase() as AdminOperationSeverity] : undefined;
    if (key === "source") filter.sources = value ? [value.toUpperCase() as AdminOperationSourceType] : undefined;
    if (key === "assignee") filter.assignee = value === "me" ? "ME" : undefined;
    setSearchParams(serializeAdminOperationsSearch({ caseId: view.selectedCaseId, filter }));
  }

  const permissionDenied = mutationPermissionDenied || hasHttpStatus(detailQuery.error, 403);
  const lifecycleControls = !permissionDenied && currentCase && currentCase.allowedActions.length > 0 ? (
    <AdminOperationStateActions
      allowedActions={currentCase.allowedActions}
      pending={pending}
      message={actionMessage}
      onAcknowledge={() => void runMutation(() => acknowledgeMutation.mutateAsync({
        caseId: currentCase.id,
        expectedVersion: currentCase.version,
      }))}
      onSnooze={(snoozedUntil) => void runMutation(() => snoozeMutation.mutateAsync({
        caseId: currentCase.id,
        expectedVersion: currentCase.version,
        snoozedUntil,
      }))}
      onResolve={() => void runMutation(() => resolveMutation.mutateAsync({
        caseId: currentCase.id,
        expectedVersion: currentCase.version,
      }))}
    />
  ) : null;

  return (
    <AdminTodayLedger
      view={view}
      filters={filtersFrom(searchState.filter)}
      history={!detailBehindList && detailQuery.data?.item.id === view.selectedCaseId ? detailQuery.data.history : []}
      lifecycleControls={lifecycleControls}
      detailLoading={detailQuery.isPending || detailBehindList}
      detailUnavailable={detailQuery.isError && !permissionDenied}
      permissionDenied={permissionDenied}
      refreshing={listQuery.isFetching && !listQuery.isPending}
      onFilterChange={changeFilter}
      onSelectCase={(caseId) => {
        setActionMessage(null);
        setSearchParams(serializeAdminOperationsSearch({ caseId, filter: searchState.filter }));
      }}
      hasNextPage={listQuery.hasNextPage}
      loadingMore={listQuery.isFetchingNextPage}
      onLoadMore={() => {
        void listQuery.fetchNextPage();
      }}
      onRetrySource={() => {
        void listQuery.refetch();
      }}
      onClearFilters={() => {
        setSearchParams(serializeAdminOperationsSearch({
          caseId: searchState.caseId,
          filter: {},
        }));
      }}
    />
  );
}

function TodayBoundary({
  state,
  title,
  description,
  action,
}: {
  state: Extract<AdminPageState, "loading" | "forbidden" | "unavailable">;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <AdminPageFrame heading={ADMIN_TODAY_HEADING} description={ADMIN_TODAY_DESCRIPTION}>
      <AdminStatePanel state={state} title={title} description={description} action={action} />
    </AdminPageFrame>
  );
}

function combineCasePages(pages: readonly AdminOperationCasesResponse[]): AdminOperationCasesResponse | null {
  const firstPage = pages[0];
  if (!firstPage) return null;
  const cases = new Map<string, AdminOperationCase>();
  for (const page of pages) {
    for (const item of page.items) {
      const current = cases.get(item.id);
      if (!current || item.version > current.version) cases.set(item.id, item);
    }
  }
  return {
    ...firstPage,
    items: [...cases.values()],
    nextCursor: pages.at(-1)?.nextCursor ?? null,
  };
}

function filtersFrom(filter: AdminOperationCaseFilter): AdminTodayFilters {
  return {
    state: filter.states?.[0]?.toLowerCase() ?? "",
    severity: filter.severities?.[0]?.toLowerCase() ?? "",
    source: filter.sources?.[0]?.toLowerCase() ?? "",
    assignee: filter.assignee?.toLowerCase() ?? "",
  };
}

function hasAdminOperationErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    error.status === 409 &&
    "code" in error &&
    error.code === code
  );
}

function hasHttpStatus(error: unknown, status: number): boolean {
  return typeof error === "object" && error !== null && "status" in error && error.status === status;
}
