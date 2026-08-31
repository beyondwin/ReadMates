import { useCallback, useEffect, useInsertionEffect, useMemo, useReducer, useRef } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import type {
  AdminOperationCaseFilter,
  AdminOperationCaseState,
  AdminOperationSeverity,
  AdminOperationSourceType,
} from "@/features/platform-admin/api/platform-admin-operations-contracts";
import {
  adminTodayReducer,
  adminTodayCommandReasonCopy,
  adminTodayFiltersFrom,
  buildAdminTodayView,
  createAdminTodayState,
  deriveAdminTodayCommandState,
  isAdminTodayPostMutationAuthoritative,
  type AdminTodayMutationTarget,
} from "@/features/platform-admin/model/admin-today-state";
import { canAdmin } from "@/features/platform-admin/model/platform-admin-capabilities";
import { adminCommandRecovery } from "@/features/platform-admin/model/platform-admin-command-recovery";
import {
  adminOperationsScopeKey,
  effectiveAdminOperationsFilter,
  parseAdminOperationsSearch,
  serializeAdminOperationsSearch,
  type AdminOperationsSearchState,
  type AdminOperationsWorkViewId,
} from "@/features/platform-admin/model/platform-admin-operations-model";
import {
  adminOperationsKeys,
  platformAdminOperationCasePagesQuery,
  platformAdminOperationCaseQuery,
  publishAdminOperationCase,
  useAcknowledgeAdminOperationCaseMutation,
  useResolveAdminOperationCaseMutation,
  useSnoozeAdminOperationCaseMutation,
} from "@/features/platform-admin/queries/platform-admin-operations-queries";
import {
  installPlatformAdminAuthorityLossHandler,
  platformAdminCapabilitiesQuery,
  subscribePlatformAdminAuthorityLoss,
} from "@/features/platform-admin/queries/platform-admin-queries";
import type { AdminTodayFilters } from "@/features/platform-admin/ui/admin-today-ledger";
import { isReadmatesTransportError } from "@/shared/api/errors";
import {
  beginAdminEditorialLedgerPollMerge,
  beginAdminEditorialLedgerRouteCommit,
} from "@/shared/observability/admin-editorial-ledger-performance";
import {
  publishTransitionAction,
  TransitionOwnerObsoleteError,
  type TransitionOwnerHandle,
  useTransitionSafetyOwner,
} from "@/shared/ui/use-transition-safety-owner";
import { combineAdminOperationCasePages } from "./admin-today-data";

export type AdminTodayControllerStatus =
  | "loading"
  | "ready"
  | "forbidden"
  | "capabilities-unavailable"
  | "list-unavailable";

type AcceptedAdminTodayMutation = {
  authorityGeneration: number;
  beforeDetailAt: number;
  beforeListAt: number;
  handle: TransitionOwnerHandle;
  target: AdminTodayMutationTarget;
};

export function useAdminTodayController() {
  const queryClient = useQueryClient();
  const transitionOwner = useTransitionSafetyOwner("admin-today-cases");
  const [searchParams, setSearchParams] = useSearchParams();
  const searchState = useMemo(() => parseAdminOperationsSearch(searchParams), [searchParams]);
  const [state, dispatch] = useReducer(
    adminTodayReducer,
    searchState.caseId,
    createAdminTodayState,
  );
  const effectiveFilter = useMemo(() => {
    const filter = effectiveAdminOperationsFilter(searchState);
    const next: AdminOperationCaseFilter = { ...filter };
    delete next.cursor;
    return next;
  }, [searchState]);
  const scopeKey = useMemo(
    () => adminOperationsScopeKey(searchState.workView, effectiveFilter),
    [effectiveFilter, searchState.workView],
  );
  const selectedIdRef = useRef<string | null>(searchState.caseId);
  const authorityGenerationRef = useRef(0);
  const measuredRouteIdentityRef = useRef(false);
  const seenLatestGeneratedAtRef = useRef<string | null>(null);
  const observedListKeyRef = useRef<string | null>(null);

  useEffect(() => {
    installPlatformAdminAuthorityLossHandler(queryClient);
    return subscribePlatformAdminAuthorityLoss(() => {
      authorityGenerationRef.current += 1;
      selectedIdRef.current = null;
      dispatch({ type: "authority-lost" });
    });
  }, [queryClient]);

  useEffect(() => {
    selectedIdRef.current = searchState.caseId;
    dispatch({ type: "selection-changed", caseId: searchState.caseId });
  }, [searchState.caseId]);

  const capabilitiesQuery = useQuery({
    ...platformAdminCapabilitiesQuery(),
    enabled: !state.authorityLost,
  });
  const canViewToday = !state.authorityLost
    && capabilitiesQuery.data != null
    && canAdmin(capabilitiesQuery.data, "VIEW_TODAY");
  const listQuery = useInfiniteQuery({
    ...platformAdminOperationCasePagesQuery(effectiveFilter, { active: canViewToday }),
    enabled: canViewToday,
  });
  const combinedPages = useMemo(
    () => combineAdminOperationCasePages(listQuery.data?.pages ?? []),
    [listQuery.data?.pages],
  );
  const pageCount = listQuery.data?.pages.length ?? 0;
  const listError = listQuery.isError;
  const listObservationKey = combinedPages
    ? JSON.stringify({
        scopeKey,
        pageCount,
        listError,
        generatedAt: combinedPages.generatedAt,
        nextCursor: combinedPages.nextCursor,
        items: combinedPages.items.map((item) => [
          item.id,
          item.version,
          item.state,
          item.severity,
          item.source.generatedAt,
          item.source.authoritative,
        ]),
      })
    : null;

  useEffect(() => {
    if (!combinedPages || listObservationKey === null) return;
    if (observedListKeyRef.current === listObservationKey) return;
    observedListKeyRef.current = listObservationKey;
    dispatch({
      type: "list-observed",
      response: combinedPages,
      scopeKey,
      pageCount,
      failed: listError,
    });
  }, [combinedPages, listError, listObservationKey, pageCount, scopeKey]);

  const pinnedMutationCaseId = state.mutationTarget?.caseId === searchState.caseId
    ? state.mutationTarget.caseId
    : null;
  const listView = useMemo(
    () => state.snapshot
      ? buildAdminTodayView(state.snapshot, searchState, new Date(), pinnedMutationCaseId)
      : null,
    [pinnedMutationCaseId, searchState, state.snapshot],
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
    if (!state.snapshot || !listView) return null;
    if (!detailQuery.data || detailQuery.data.item.id !== listView.selectedCaseId) return listView;
    const listedCase = state.snapshot.displayed.items.find(
      (item) => item.id === detailQuery.data.item.id,
    );
    if (listedCase && listedCase.version > detailQuery.data.item.version) return listView;
    const selectedItem = detailQuery.data.item;
    return buildAdminTodayView(
      {
        ...state.snapshot,
        displayed: {
          ...state.snapshot.displayed,
          items: state.snapshot.displayed.items.map((item) =>
            item.id === selectedItem.id ? selectedItem : item),
        },
      },
      searchState,
      new Date(),
      pinnedMutationCaseId,
    );
  }, [detailQuery.data, listView, pinnedMutationCaseId, searchState, state.snapshot]);
  const detailBehindList = Boolean(
    detailQuery.data
    && view?.selectedCase
    && detailQuery.data.item.id === view.selectedCase.id
    && detailQuery.data.item.version < view.selectedCase.version,
  );

  useEffect(() => {
    selectedIdRef.current = selectedCaseId;
  }, [selectedCaseId]);

  useInsertionEffect(() => {
    if (!view || !state.snapshot) return;
    if (!measuredRouteIdentityRef.current) {
      measuredRouteIdentityRef.current = true;
      beginAdminEditorialLedgerRouteCommit(listQuery.dataUpdatedAt);
    }
    const latestAt = state.snapshot.latest.generatedAt;
    if (seenLatestGeneratedAtRef.current === null) {
      seenLatestGeneratedAtRef.current = latestAt;
      return;
    }
    if (seenLatestGeneratedAtRef.current !== latestAt) {
      seenLatestGeneratedAtRef.current = latestAt;
      beginAdminEditorialLedgerPollMerge();
    }
  }, [listQuery.dataUpdatedAt, state.snapshot, view]);

  useEffect(() => {
    if (!detailBehindList || !selectedCaseId || !canViewToday) return;
    void queryClient.refetchQueries({
      queryKey: adminOperationsKeys.detail(selectedCaseId),
      exact: true,
    });
  }, [
    canViewToday,
    detailBehindList,
    detailQuery.data?.item.version,
    queryClient,
    selectedCaseId,
    view?.selectedCase?.version,
  ]);

  useEffect(() => {
    if (!view || view.selectionExcluded || view.selectedCaseId === searchState.caseId) return;
    setSearchParams(serializeAdminOperationsSearch({
      caseId: view.selectedCaseId,
      filter: searchState.filter,
      workView: searchState.workView,
      query: searchState.query,
      mode: searchState.mode,
    }), { replace: true });
  }, [searchState, setSearchParams, view]);

  const writeSearch = useCallback((next: Partial<AdminOperationsSearchState>) => {
    setSearchParams(serializeAdminOperationsSearch({
      caseId: next.caseId !== undefined ? next.caseId : searchState.caseId,
      filter: next.filter ?? searchState.filter,
      workView: next.workView ?? searchState.workView,
      query: next.query ?? searchState.query,
      mode: next.mode ?? searchState.mode,
    }));
  }, [searchState, setSearchParams]);

  const currentCase = view?.selectedCase ?? null;
  const confirmationKey = currentCase
    ? `${currentCase.id}:${currentCase.version}:${currentCase.allowedActions.join(",")}`
    : undefined;
  useEffect(() => {
    dispatch({ type: "confirmation-changed", confirmationKey: confirmationKey ?? null });
  }, [confirmationKey]);
  useEffect(() => {
    if (!state.focusQueueSummary) return;
    document.querySelector<HTMLElement>('[aria-label="운영 케이스 요약"]')?.focus();
    dispatch({ type: "queue-summary-focus-consumed" });
  }, [state.focusQueueSummary]);

  const reconcileAuthoritativeState = useCallback(async (caseId: string) => {
    await Promise.all([
      queryClient.refetchQueries({ queryKey: adminOperationsKeys.lists() }),
      queryClient.refetchQueries({ queryKey: adminOperationsKeys.detail(caseId), exact: true }),
    ]);
  }, [queryClient]);
  const isCurrentMutationTarget = useCallback(
    (target: AdminTodayMutationTarget) => selectedIdRef.current === target.caseId,
    [],
  );

  const runMutation = useCallback(async (
    target: AdminTodayMutationTarget,
    operation: () => Promise<unknown>,
  ): Promise<AcceptedAdminTodayMutation | null> => {
    const authorityGeneration = authorityGenerationRef.current;
    const operationId = `admin-case:${target.caseId}:${target.version}`;
    const handle = transitionOwner.begin(operationId, "L1", async () => {
      await queryClient.fetchQuery(platformAdminOperationCaseQuery(target.caseId));
      return { operationId, outcome: "still-unknown" };
    });
    dispatch({ type: "mutation-started", target });
    const detailKey = adminOperationsKeys.detail(target.caseId);
    const listKey = adminOperationsKeys.pages(effectiveFilter);
    const beforeDetailAt = queryClient.getQueryState(detailKey)?.dataUpdatedAt ?? 0;
    const beforeListAt = queryClient.getQueryState(listKey)?.dataUpdatedAt ?? 0;
    try {
      await operation();
      if (authorityGenerationRef.current !== authorityGeneration) {
        handle.unregister();
        return null;
      }
      if (await handle.settle("succeeded") !== "accepted") {
        return null;
      }
      if (
        authorityGenerationRef.current !== authorityGeneration
        || !handle.isPublicationCurrent()
      ) {
        handle.unregister();
        return null;
      }
      return { authorityGeneration, beforeDetailAt, beforeListAt, handle, target };
    } catch (error) {
      if (error instanceof TransitionOwnerObsoleteError) return null;
      if (authorityGenerationRef.current !== authorityGeneration) {
        handle.unregister();
        return null;
      }
      if (await handle.settle("failed") !== "accepted") return null;
      return await publishTransitionAction(handle, "errorCopy", async () => {
        if (!isCurrentMutationTarget(target)) return null;
        if (hasHttpStatus(error, 403)) {
          dispatch({ type: "mutation-permission-lost" });
          return null;
        }
        if (hasAdminOperationErrorCode(error, "CASE_VERSION_CONFLICT")) {
          dispatch({ type: "mutation-conflict" });
          await reconcileAuthoritativeState(target.caseId);
          return null;
        }
        if (hasAdminOperationErrorCode(error, "CASE_STILL_ACTIVE")) {
          dispatch({
            type: "mutation-error",
            message: "신호가 아직 활성 상태입니다. 운영 상세에서 원인을 해소한 뒤 다시 확인해 주세요.",
          });
          return null;
        }
        if (isUnknownOutcomeError(error)) {
          dispatch({ type: "mutation-unknown", message: adminCommandRecovery(error).message });
          await reconcileAuthoritativeState(target.caseId);
          dispatch({ type: "authoritative-recovery-completed", outcome: "still-unknown" });
          return null;
        }
        dispatch({
          type: "mutation-error",
          message: "상태를 변경하지 못했습니다. 잠시 뒤 다시 시도해 주세요.",
        });
        return null;
      });
    }
  }, [
    effectiveFilter,
    isCurrentMutationTarget,
    queryClient,
    reconcileAuthoritativeState,
    transitionOwner,
  ]);

  const completeMutation = useCallback(async (
    accepted: AcceptedAdminTodayMutation | null,
  ): Promise<boolean> => {
    if (!accepted) return false;
    const { authorityGeneration, beforeDetailAt, beforeListAt, handle, target } = accepted;
    const isCurrentAuthority = () => authorityGenerationRef.current === authorityGeneration;
    const detailKey = adminOperationsKeys.detail(target.caseId);
    const listKey = adminOperationsKeys.pages(effectiveFilter);
    try {
      if (!isCurrentAuthority() || !handle.isPublicationCurrent()) return false;
      await publishTransitionAction(handle, "cache", async () => {
        if (!isCurrentAuthority()) throw new TransitionOwnerObsoleteError();
        await publishAdminOperationCase(queryClient, target.caseId);
        if (!isCurrentAuthority()) throw new TransitionOwnerObsoleteError();
      });
      if (!isCurrentAuthority()) return false;
      const uiAccepted = await publishTransitionAction(handle, "ui", async () => {
        if (!isCurrentAuthority() || !isCurrentMutationTarget(target)) return false;
        if (!isAdminTodayPostMutationAuthoritative({
          detail: queryClient.getQueryState(detailKey),
          list: queryClient.getQueryState(listKey),
          beforeDetailAt,
          beforeListAt,
          expectedMinVersion: target.version,
        })) {
          dispatch({
            type: "mutation-unknown",
            message: "명령 응답을 확인하지 못했습니다. 최신 상태를 확인한 뒤 다시 시도해 주세요.",
          });
          await reconcileAuthoritativeState(target.caseId);
          dispatch({ type: "authoritative-recovery-completed", outcome: "still-unknown" });
          return false;
        }
        dispatch({ type: "mutation-succeeded" });
        return true;
      });
      return uiAccepted;
    } catch (error) {
      if (error instanceof TransitionOwnerObsoleteError) return false;
      throw error;
    }
  }, [
    effectiveFilter,
    isCurrentMutationTarget,
    queryClient,
    reconcileAuthoritativeState,
  ]);

  const selectCase = useCallback((caseId: string, mode = searchState.mode) => {
    selectedIdRef.current = caseId;
    dispatch({ type: "selection-changed", caseId, explicit: true });
    writeSearch({ caseId, mode });
  }, [searchState.mode, writeSearch]);
  const acknowledgeCurrent = useCallback(async () => {
    if (!currentCase || !confirmationKey) return false;
    const accepted = await runMutation(
      { caseId: currentCase.id, version: currentCase.version, confirmationKey },
      () => acknowledgeMutation.mutateAsync({
        caseId: currentCase.id,
        expectedVersion: currentCase.version,
      }),
    );
    return completeMutation(accepted);
  }, [acknowledgeMutation, completeMutation, confirmationKey, currentCase, runMutation]);
  const snoozeCurrent = useCallback(async (snoozedUntil: string) => {
    if (!currentCase || !confirmationKey) return false;
    const accepted = await runMutation(
      { caseId: currentCase.id, version: currentCase.version, confirmationKey },
      () => snoozeMutation.mutateAsync({
        caseId: currentCase.id,
        expectedVersion: currentCase.version,
        snoozedUntil,
      }),
    );
    return completeMutation(accepted);
  }, [completeMutation, confirmationKey, currentCase, runMutation, snoozeMutation]);
  const resolveCurrent = useCallback(async () => {
    if (!currentCase || !confirmationKey) return false;
    const accepted = await runMutation(
      { caseId: currentCase.id, version: currentCase.version, confirmationKey },
      () => resolveMutation.mutateAsync({
        caseId: currentCase.id,
        expectedVersion: currentCase.version,
      }),
    );
    return completeMutation(accepted);
  }, [completeMutation, confirmationKey, currentCase, resolveMutation, runMutation]);

  const changeFilter = useCallback((key: keyof AdminTodayFilters, value: string) => {
    const filter: AdminOperationCaseFilter = { ...searchState.filter };
    delete filter.cursor;
    if (key === "state") {
      filter.states = value ? [value.toUpperCase() as AdminOperationCaseState] : undefined;
    }
    if (key === "severity") {
      filter.severities = value ? [value.toUpperCase() as AdminOperationSeverity] : undefined;
    }
    if (key === "source") {
      filter.sources = value ? [value.toUpperCase() as AdminOperationSourceType] : undefined;
    }
    if (key === "assignee") filter.assignee = value === "me" ? "ME" : undefined;
    writeSearch({
      caseId: view?.selectionExcluded ? searchState.caseId : view?.selectedCaseId,
      filter,
    });
  }, [searchState.caseId, searchState.filter, view, writeSearch]);
  const acceptPending = useCallback(() => {
    if (!state.snapshot) return;
    const selectedId = state.selectedCaseId
      && state.snapshot.latest.items.some((item) => item.id === state.selectedCaseId)
      ? state.selectedCaseId
      : null;
    dispatch({ type: "pending-accepted" });
    dispatch({ type: "urgent-announcement-cleared" });
    if (selectedId !== searchState.caseId) writeSearch({ caseId: selectedId });
  }, [searchState.caseId, state.selectedCaseId, state.snapshot, writeSearch]);

  const listForbidden = hasHttpStatus(listQuery.error, 403);
  const capabilitiesForbidden = state.authorityLost
    || hasHttpStatus(capabilitiesQuery.error, 403)
    || (capabilitiesQuery.data != null && !canAdmin(capabilitiesQuery.data, "VIEW_TODAY"));
  let status: AdminTodayControllerStatus;
  if (capabilitiesForbidden || listForbidden) status = "forbidden";
  else if (capabilitiesQuery.isError && !capabilitiesQuery.data) status = "capabilities-unavailable";
  else if (
    capabilitiesQuery.isPending
    || (canViewToday && listQuery.isPending && !listQuery.data)
    || (combinedPages != null && state.snapshot === null)
  ) status = "loading";
  else if ((listQuery.isError && !combinedPages) || !view) status = "list-unavailable";
  else status = "ready";

  const permissionDenied = state.permissionDenied || hasHttpStatus(detailQuery.error, 403);
  const pendingRemoval = Boolean(
    currentCase && state.snapshot?.pendingRemovalIds.includes(currentCase.id),
  );
  const nonAuthoritative = Boolean(currentCase && !currentCase.source.authoritative);
  const mutationPending = Boolean(
    state.mutationTarget
    && state.mutationTarget.caseId === currentCase?.id
    && (acknowledgeMutation.isPending || snoozeMutation.isPending || resolveMutation.isPending),
  );
  const actionState = deriveAdminTodayCommandState({
    permissionDenied,
    actionState: state.actionState,
    mutationPending,
    detailBehindList,
    pendingRemoval,
    nonAuthoritative,
  });

  return {
    status,
    view,
    searchState,
    snapshot: state.snapshot,
    filters: adminTodayFiltersFrom(searchState.filter),
    history: !detailBehindList
      && detailQuery.data != null
      && detailQuery.data.item.id === view?.selectedCaseId
      ? detailQuery.data.history
      : [],
    detailLoading: detailQuery.isPending || detailBehindList,
    detailUnavailable: detailQuery.isError && !permissionDenied,
    permissionDenied,
    refreshing: listQuery.isFetching && !listQuery.isPending,
    pendingCount: state.snapshot?.pendingNewIds.length ?? 0,
    urgentCount: state.snapshot?.urgentNewCriticalIds.length ?? 0,
    urgentAnnouncement: state.urgentAnnouncement,
    actionState,
    actionReason: adminTodayCommandReasonCopy(actionState),
    actionMessage: state.mutationTarget?.caseId === currentCase?.id ? state.actionMessage : null,
    mutationTarget: state.mutationTarget,
    confirmationKey,
    pending: mutationPending || actionState === "pending",
    actionDisabled: actionState === "stale"
      || actionState === "unknown-outcome"
      || actionState === "forbidden"
      || actionState === "complete",
    hasNextPage: listQuery.hasNextPage,
    loadingMore: listQuery.isFetchingNextPage,
    acknowledgeCurrent,
    snoozeCurrent,
    resolveCurrent,
    selectCase,
    acceptPending,
    changeFilter,
    backToList: () => writeSearch({ mode: "list" }),
    changeView: (id: string) => writeSearch({
      caseId: searchState.caseId,
      workView: id as AdminOperationsWorkViewId,
    }),
    changeQuery: (query: string) => writeSearch({ query, caseId: searchState.caseId }),
    loadMore: () => void listQuery.fetchNextPage(),
    retrySource: () => void listQuery.refetch(),
    retryCapabilities: () => void capabilitiesQuery.refetch(),
    clearFilters: () => writeSearch({
      caseId: searchState.caseId,
      filter: {},
      query: "",
    }),
  };
}

function isUnknownOutcomeError(error: unknown): boolean {
  if (isReadmatesTransportError(error)) return true;
  if (hasHttpStatus(error, 403) || hasHttpStatus(error, 409) || hasHttpStatus(error, 401)) return false;
  return typeof error !== "object" || error === null || !("status" in error);
}

function hasAdminOperationErrorCode(error: unknown, code: string): boolean {
  return typeof error === "object"
    && error !== null
    && "status" in error
    && error.status === 409
    && "code" in error
    && error.code === code;
}

function hasHttpStatus(error: unknown, status: number): boolean {
  return typeof error === "object" && error !== null && "status" in error && error.status === status;
}
