import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import type {
  AdminOperationCaseFilter,
  AdminOperationCaseState,
  AdminOperationSeverity,
  AdminOperationSourceType,
} from "@/features/platform-admin/api/platform-admin-operations-contracts";
import {
  buildAdminOperationsView,
  parseAdminOperationsSearch,
  serializeAdminOperationsSearch,
} from "@/features/platform-admin/model/platform-admin-operations-model";
import {
  adminOperationsKeys,
  platformAdminOperationCaseQuery,
  platformAdminOperationCasesQuery,
  useAcknowledgeAdminOperationCaseMutation,
  useResolveAdminOperationCaseMutation,
  useSnoozeAdminOperationCaseMutation,
} from "@/features/platform-admin/queries/platform-admin-operations-queries";
import {
  AdminOperationStateActions,
  type AdminOperationActionMessage,
} from "@/features/platform-admin/ui/admin-operation-state-actions";
import {
  AdminTodayLedger,
  type AdminTodayFilters,
} from "@/features/platform-admin/ui/admin-today-ledger";

export function AdminTodayRoute() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const searchState = useMemo(() => parseAdminOperationsSearch(searchParams), [searchParams]);
  const listQuery = useQuery(platformAdminOperationCasesQuery(searchState.filter, { active: true }));
  const listView = useMemo(
    () => listQuery.data ? buildAdminOperationsView(listQuery.data, searchState.caseId) : null,
    [listQuery.data, searchState.caseId],
  );
  const selectedCaseId = listView?.selectedCaseId ?? null;
  const detailQuery = useQuery({
    ...platformAdminOperationCaseQuery(selectedCaseId ?? ""),
    enabled: selectedCaseId !== null,
  });
  const acknowledgeMutation = useAcknowledgeAdminOperationCaseMutation();
  const snoozeMutation = useSnoozeAdminOperationCaseMutation();
  const resolveMutation = useResolveAdminOperationCaseMutation();
  const [actionMessage, setActionMessage] = useState<AdminOperationActionMessage | null>(null);

  const view = useMemo(() => {
    if (!listQuery.data || !listView) return null;
    if (!detailQuery.data || detailQuery.data.item.id !== listView.selectedCaseId) return listView;
    return buildAdminOperationsView(
      { ...listQuery.data, items: listQuery.data.items.map((item) => item.id === detailQuery.data.item.id ? detailQuery.data.item : item) },
      detailQuery.data.item.id,
    );
  }, [detailQuery.data, listQuery.data, listView]);

  useEffect(() => {
    if (!view || view.selectedCaseId === searchState.caseId) return;
    setSearchParams(
      serializeAdminOperationsSearch({ caseId: view.selectedCaseId, filter: searchState.filter }),
      { replace: true },
    );
  }, [searchState.caseId, searchState.filter, setSearchParams, view]);

  if (listQuery.isPending) {
    return <p className="admin-today-ledger__loading" role="status">운영 케이스를 불러오는 중입니다.</p>;
  }

  if (listQuery.isError || !view) {
    return (
      <section className="admin-today-ledger" aria-labelledby="admin-today-title">
        <h1 id="admin-today-title" className="h1 editorial">오늘의 운영 케이스</h1>
        <p className="admin-today-ledger__error" role="alert">
          운영 케이스를 불러오지 못했습니다. 잠시 뒤 다시 시도해 주세요.
        </p>
      </section>
    );
  }

  const currentCase = detailQuery.data?.item.id === view.selectedCaseId
    ? detailQuery.data.item
    : view.selectedCase;
  const pending = detailQuery.isPending || acknowledgeMutation.isPending || snoozeMutation.isPending || resolveMutation.isPending;

  async function runMutation(operation: () => Promise<unknown>) {
    setActionMessage(null);
    try {
      await operation();
      setActionMessage({ kind: "success", text: "케이스 상태를 반영했습니다." });
    } catch (error) {
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

  const lifecycleControls = currentCase && currentCase.allowedActions.length > 0 ? (
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
      history={detailQuery.data?.item.id === view.selectedCaseId ? detailQuery.data.history : []}
      lifecycleControls={lifecycleControls}
      detailLoading={detailQuery.isPending}
      detailUnavailable={detailQuery.isError}
      refreshing={listQuery.isFetching && !listQuery.isPending}
      onFilterChange={changeFilter}
      onSelectCase={(caseId) => {
        setActionMessage(null);
        setSearchParams(serializeAdminOperationsSearch({ caseId, filter: searchState.filter }));
      }}
    />
  );
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
