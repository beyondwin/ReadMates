import { useEffect, useInsertionEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import type {
  AdminOperationCaseFilter,
  AdminOperationCaseState,
  AdminOperationSeverity,
  AdminOperationSourceType,
} from "@/features/platform-admin/api/platform-admin-operations-contracts";
import { canAdmin } from "@/features/platform-admin/model/platform-admin-capabilities";
import { adminCommandRecovery } from "@/features/platform-admin/model/platform-admin-command-recovery";
import {
  adminOperationsScopeKey,
  buildAdminOperationsView,
  effectiveAdminOperationsFilter,
  filterAdminOperationItems,
  parseAdminOperationsSearch,
  serializeAdminOperationsSearch,
  type AdminOperationsSearchState,
  type AdminOperationsView,
  type AdminOperationsWorkViewId,
} from "@/features/platform-admin/model/platform-admin-operations-model";
import {
  applyPendingAdminOperationsSnapshot,
  createAdminOperationsSnapshot,
  paginateAdminOperationsSnapshot,
  receiveAdminOperationsSnapshot,
  retryAdminOperationsSnapshot,
  type AdminOperationsSnapshot,
} from "@/features/platform-admin/model/platform-admin-operations-snapshot";
import {
  adminOperationsKeys,
  platformAdminOperationCaseQuery,
  platformAdminOperationCasePagesQuery,
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
import type { AdminSafeActionState } from "@/features/platform-admin/ui/admin-action-dock";
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
import { combineAdminOperationCasePages } from "./admin-today-data";
import { isReadmatesTransportError } from "@/shared/api/errors";
import {
  beginAdminEditorialLedgerPollMerge,
  beginAdminEditorialLedgerRouteCommit,
} from "@/shared/observability/admin-editorial-ledger-performance";
import { publishTransitionAction, TransitionOwnerObsoleteError, useTransitionSafetyOwner } from "@/shared/ui/use-transition-safety-owner";

type MutationTarget = {
  caseId: string;
  version: number;
  confirmationKey: string;
};

export function AdminTodayRoute() {
  const queryClient = useQueryClient();
  const transitionOwner = useTransitionSafetyOwner("admin-today-cases");
  const [searchParams, setSearchParams] = useSearchParams();
  const searchState = useMemo(() => parseAdminOperationsSearch(searchParams), [searchParams]);
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
  const [authorityLost, setAuthorityLost] = useState(false);
  const [actionMessage, setActionMessage] = useState<AdminOperationActionMessage | null>(null);
  const [actionState, setActionState] = useState<AdminSafeActionState>("ready");
  const [mutationPermissionDenied, setMutationPermissionDenied] = useState(false);
  const [mutationTarget, setMutationTarget] = useState<MutationTarget | null>(null);
  const [snapshotTrack, setSnapshotTrack] = useState<{
    combined: ReturnType<typeof combineAdminOperationCasePages>;
    scopeKey: string;
    pageCount: number;
    isError: boolean;
    snapshot: AdminOperationsSnapshot | null;
  }>({ combined: null, scopeKey: "", pageCount: 0, isError: false, snapshot: null });
  const [urgentTrack, setUrgentTrack] = useState<{
    scopeKey: string;
    announcedIds: readonly string[];
    announcement: string | null;
  }>({ scopeKey: "", announcedIds: [], announcement: null });
  const selectedIdRef = useRef<string | null>(null);
  const measuredRouteIdentityRef = useRef(false);
  const seenLatestGeneratedAtRef = useRef<string | null>(null);

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
    ...platformAdminOperationCasePagesQuery(effectiveFilter, { active: canViewToday }),
    enabled: canViewToday,
  });
  const combinedPages = useMemo(
    () => combineAdminOperationCasePages(listQuery.data?.pages ?? []),
    [listQuery.data?.pages],
  );
  const pageCount = listQuery.data?.pages.length ?? 0;
  const listError = listQuery.isError;
  let snapshot = snapshotTrack.snapshot;
  if (
    snapshotTrack.combined !== combinedPages
    || snapshotTrack.scopeKey !== scopeKey
    || snapshotTrack.pageCount !== pageCount
    || snapshotTrack.isError !== listError
  ) {
    snapshot = nextSnapshot(
      snapshotTrack.snapshot,
      combinedPages,
      scopeKey,
      pageCount,
      snapshotTrack.pageCount,
      listError,
    );
    setSnapshotTrack({
      combined: combinedPages,
      scopeKey,
      pageCount,
      isError: listError,
      snapshot,
    });
  }

  let urgentAnnouncement = urgentTrack.scopeKey === scopeKey ? urgentTrack.announcement : null;
  let announcedIds = urgentTrack.scopeKey === scopeKey ? urgentTrack.announcedIds : [];
  if (urgentTrack.scopeKey !== scopeKey) {
    announcedIds = [];
    urgentAnnouncement = null;
    setUrgentTrack({ scopeKey, announcedIds: [], announcement: null });
  }
  const freshUrgent = snapshot?.urgentNewCriticalIds.filter((id) => !announcedIds.includes(id)) ?? [];
  if (freshUrgent.length > 0) {
    announcedIds = [...announcedIds, ...freshUrgent];
    urgentAnnouncement = `새 긴급 신호 ${freshUrgent.length}건`;
    setUrgentTrack({ scopeKey, announcedIds, announcement: urgentAnnouncement });
  }

  const listView = useMemo(
    () => snapshot ? viewFromSnapshot(snapshot, searchState) : null,
    [searchState, snapshot],
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
    if (!snapshot || !listView) return null;
    if (!detailQuery.data || detailQuery.data.item.id !== listView.selectedCaseId) return listView;
    const listedCase = snapshot.displayed.items.find((item) => item.id === detailQuery.data.item.id);
    if (listedCase && listedCase.version > detailQuery.data.item.version) return listView;
    const selectedItem = detailQuery.data.item;
    return viewFromSnapshot(
      {
        ...snapshot,
        displayed: {
          ...snapshot.displayed,
          items: snapshot.displayed.items.map((item) => item.id === selectedItem.id ? selectedItem : item),
        },
      },
      searchState,
    );
  }, [detailQuery.data, listView, searchState, snapshot]);

  const detailBehindList = Boolean(
    detailQuery.data &&
    view?.selectedCase &&
    detailQuery.data.item.id === view.selectedCase.id &&
    detailQuery.data.item.version < view.selectedCase.version,
  );

  useEffect(() => {
    selectedIdRef.current = selectedCaseId;
  }, [selectedCaseId]);

  useInsertionEffect(() => {
    if (!view || !snapshot) return;
    if (!measuredRouteIdentityRef.current) {
      measuredRouteIdentityRef.current = true;
      beginAdminEditorialLedgerRouteCommit(listQuery.dataUpdatedAt);
    }
    const latestAt = snapshot.latest.generatedAt;
    if (seenLatestGeneratedAtRef.current === null) {
      seenLatestGeneratedAtRef.current = latestAt;
      return;
    }
    if (seenLatestGeneratedAtRef.current !== latestAt) {
      seenLatestGeneratedAtRef.current = latestAt;
      beginAdminEditorialLedgerPollMerge();
    }
  }, [listQuery.dataUpdatedAt, snapshot, view]);

  useEffect(() => {
    if (!detailBehindList || !selectedCaseId || !canViewToday) return;
    void queryClient.refetchQueries({
      queryKey: adminOperationsKeys.detail(selectedCaseId),
      exact: true,
    });
  }, [canViewToday, detailBehindList, detailQuery.data?.item.version, queryClient, selectedCaseId, view?.selectedCase?.version]);

  useEffect(() => {
    if (!view || view.selectionExcluded) return;
    if (view.selectedCaseId === searchState.caseId) return;
    setSearchParams(
      serializeAdminOperationsSearch({
        caseId: view.selectedCaseId,
        filter: searchState.filter,
        workView: searchState.workView,
        query: searchState.query,
        mode: searchState.mode,
      }),
      { replace: true },
    );
  }, [searchState.caseId, searchState.filter, searchState.mode, searchState.query, searchState.workView, setSearchParams, view]);

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

  if ((listQuery.isError && !combinedPages) || !view) {
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
  const confirmationKey = currentCase
    ? `${currentCase.id}:${currentCase.version}:${currentCase.allowedActions.join(",")}`
    : undefined;
  if (
    actionState === "complete"
    && mutationTarget
    && confirmationKey
    && confirmationKey !== mutationTarget.confirmationKey
  ) {
    setActionState("ready");
  }
  const pendingRemoval = Boolean(
    currentCase && snapshot?.pendingRemovalIds.includes(currentCase.id),
  );
  const nonAuthoritative = Boolean(currentCase && !currentCase.source.authoritative);
  const mutationPending = Boolean(
    mutationTarget &&
    mutationTarget.caseId === currentCase?.id &&
    (acknowledgeMutation.isPending || snoozeMutation.isPending || resolveMutation.isPending),
  );
  const commandState = deriveCommandState({
    permissionDenied: mutationPermissionDenied || hasHttpStatus(detailQuery.error, 403),
    actionState: actionState === "complete"
      && confirmationKey
      && mutationTarget
      && confirmationKey !== mutationTarget.confirmationKey
      ? "ready"
      : actionState,
    mutationPending,
    detailBehindList,
    pendingRemoval,
    nonAuthoritative,
  });
  const commandReason = commandReasonCopy(commandState);
  const pending = mutationPending || commandState === "pending";
  const actionDisabled = commandState === "stale"
    || commandState === "unknown-outcome"
    || commandState === "forbidden"
    || commandState === "complete";

  async function reconcileAuthoritativeState(caseId: string) {
    await Promise.all([
      queryClient.refetchQueries({ queryKey: adminOperationsKeys.lists() }),
      queryClient.refetchQueries({ queryKey: adminOperationsKeys.detail(caseId), exact: true }),
    ]);
  }

  function isCurrentMutationTarget(target: MutationTarget) {
    return selectedIdRef.current === target.caseId;
  }

  async function runMutation(target: MutationTarget, operation: () => Promise<unknown>): Promise<boolean> {
    const operationId = `admin-case:${target.caseId}:${target.version}`;
    const handle = transitionOwner.begin(operationId, "L1", async () => {
      await queryClient.fetchQuery(platformAdminOperationCaseQuery(target.caseId));
      return { operationId, outcome: "still-unknown" };
    });
    setMutationTarget(target);
    if (isCurrentMutationTarget(target)) {
      setActionMessage(null);
      setActionState("pending");
    }
    const detailKey = adminOperationsKeys.detail(target.caseId);
    const listKey = adminOperationsKeys.pages(effectiveFilter);
    const beforeDetailAt = queryClient.getQueryState(detailKey)?.dataUpdatedAt ?? 0;
    const beforeListAt = queryClient.getQueryState(listKey)?.dataUpdatedAt ?? 0;
    try {
      await operation();
      if (await handle.settle("succeeded") !== "accepted") throw new TransitionOwnerObsoleteError();
      await publishTransitionAction(handle, "cache", () => publishAdminOperationCase(queryClient, target.caseId));
      return await publishTransitionAction(handle, "ui", async () => {
        if (!isCurrentMutationTarget(target)) return false;
        if (!isPostMutationAuthoritative({
        detail: queryClient.getQueryState(detailKey),
        list: queryClient.getQueryState(listKey),
        beforeDetailAt,
        beforeListAt,
        expectedMinVersion: target.version,
        })) {
          setActionState("unknown-outcome");
          setActionMessage({
            kind: "unknown-outcome",
            text: "명령 응답을 확인하지 못했습니다. 최신 상태를 확인한 뒤 다시 시도해 주세요.",
          });
          await reconcileAuthoritativeState(target.caseId);
          return false;
        }
        setActionState("complete");
        setActionMessage({ kind: "success", text: "케이스 상태를 반영했습니다." });
        return true;
      });
    } catch (error) {
      if (error instanceof TransitionOwnerObsoleteError) return false;
      if (await handle.settle("failed") !== "accepted") return false;
      return await publishTransitionAction(handle, "errorCopy", async () => {
        if (!isCurrentMutationTarget(target)) return false;
        if (hasHttpStatus(error, 403)) {
        setMutationPermissionDenied(true);
        setActionState("forbidden");
        return false;
      }
      if (hasAdminOperationErrorCode(error, "CASE_VERSION_CONFLICT")) {
        setActionMessage({ kind: "conflict", text: "최신 상태 확인이 필요합니다." });
        await reconcileAuthoritativeState(target.caseId);
        if (isCurrentMutationTarget(target)) setActionState("ready");
        return false;
      }
      if (hasAdminOperationErrorCode(error, "CASE_STILL_ACTIVE")) {
        setActionState("ready");
        setActionMessage({
          kind: "error",
          text: "신호가 아직 활성 상태입니다. 운영 상세에서 원인을 해소한 뒤 다시 확인해 주세요.",
        });
        return false;
      }
      if (isUnknownOutcomeError(error)) {
        setActionState("unknown-outcome");
        setActionMessage({
          kind: "unknown-outcome",
          text: adminCommandRecovery(error).message,
        });
        await reconcileAuthoritativeState(target.caseId);
        return false;
      }
        setActionState("ready");
        setActionMessage({
          kind: "error",
          text: "상태를 변경하지 못했습니다. 잠시 뒤 다시 시도해 주세요.",
        });
        return false;
      });
    }
  }

  function writeSearch(next: Partial<AdminOperationsSearchState>) {
    setSearchParams(serializeAdminOperationsSearch({
      caseId: next.caseId !== undefined ? next.caseId : searchState.caseId,
      filter: next.filter ?? searchState.filter,
      workView: next.workView ?? searchState.workView,
      query: next.query ?? searchState.query,
      mode: next.mode ?? searchState.mode,
    }));
  }

  function changeFilter(key: keyof AdminTodayFilters, value: string) {
    const filter: AdminOperationCaseFilter = { ...searchState.filter };
    delete filter.cursor;
    if (key === "state") filter.states = value ? [value.toUpperCase() as AdminOperationCaseState] : undefined;
    if (key === "severity") filter.severities = value ? [value.toUpperCase() as AdminOperationSeverity] : undefined;
    if (key === "source") filter.sources = value ? [value.toUpperCase() as AdminOperationSourceType] : undefined;
    if (key === "assignee") filter.assignee = value === "me" ? "ME" : undefined;
    writeSearch({
      caseId: view.selectionExcluded ? searchState.caseId : view.selectedCaseId,
      filter,
    });
  }

  const permissionDenied = mutationPermissionDenied || hasHttpStatus(detailQuery.error, 403);
  function advanceAfterQueueExit(nextId: string | null) {
    return (ok: boolean) => {
      if (!ok) return;
      if (nextId) {
        writeSearch({ caseId: nextId, mode: searchState.mode });
        return;
      }
      document.querySelector<HTMLElement>('[aria-label="운영 케이스 요약"]')?.focus();
    };
  }
  const lifecycleControls = !permissionDenied && currentCase && currentCase.allowedActions.length > 0 ? (
    <AdminOperationStateActions
      allowedActions={currentCase.allowedActions}
      pending={pending}
      disabled={actionDisabled}
      message={mutationTarget?.caseId === currentCase.id ? actionMessage : null}
      confirmationKey={confirmationKey}
      onAcknowledge={() => void runMutation(
        { caseId: currentCase.id, version: currentCase.version, confirmationKey: confirmationKey ?? "" },
        () => acknowledgeMutation.mutateAsync({
          caseId: currentCase.id,
          expectedVersion: currentCase.version,
        }),
      )}
      onSnooze={(snoozedUntil) => {
        const nextId = nextDocketCaseId(view.items, currentCase.id);
        void runMutation(
          { caseId: currentCase.id, version: currentCase.version, confirmationKey: confirmationKey ?? "" },
          () => snoozeMutation.mutateAsync({
            caseId: currentCase.id,
            expectedVersion: currentCase.version,
            snoozedUntil,
          }),
        ).then(advanceAfterQueueExit(nextId));
      }}
      onResolve={() => {
        const nextId = nextDocketCaseId(view.items, currentCase.id);
        void runMutation(
          { caseId: currentCase.id, version: currentCase.version, confirmationKey: confirmationKey ?? "" },
          () => resolveMutation.mutateAsync({
            caseId: currentCase.id,
            expectedVersion: currentCase.version,
          }),
        ).then(advanceAfterQueueExit(nextId));
      }}
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
      mode={searchState.mode}
      query={searchState.query}
      workView={searchState.workView}
      pendingCount={snapshot?.pendingNewIds.length ?? 0}
      urgentCount={snapshot?.urgentNewCriticalIds.length ?? 0}
      urgentAnnouncement={urgentAnnouncement}
      actionState={commandState}
      actionReason={commandReason}
      onFilterChange={changeFilter}
      onSelectCase={(caseId, options) => {
        if (caseId !== searchState.caseId) {
          setActionMessage(null);
          setActionState("ready");
        }
        writeSearch({
          caseId,
          mode: options?.mode ?? searchState.mode,
        });
      }}
      onBackToList={() => {
        writeSearch({ mode: "list" });
      }}
      onViewChange={(id) => {
        writeSearch({
          caseId: searchState.caseId,
          workView: id as AdminOperationsWorkViewId,
        });
      }}
      onQueryChange={(value) => {
        writeSearch({ query: value, caseId: searchState.caseId });
      }}
      onApplyPending={() => {
        if (!snapshot) return;
        const applied = applyPendingAdminOperationsSnapshot(snapshot, {
          selectedId: searchState.caseId,
          focusId: searchState.caseId,
        });
        setSnapshotTrack({
          combined: combinedPages,
          scopeKey,
          pageCount,
          isError: listError,
          snapshot: applied.snapshot,
        });
        setUrgentTrack({ scopeKey, announcedIds, announcement: null });
        if (applied.selectedId !== searchState.caseId) {
          writeSearch({ caseId: applied.selectedId });
        }
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
        writeSearch({
          caseId: searchState.caseId,
          filter: {},
          query: "",
        });
      }}
    />
  );
}

function nextSnapshot(
  current: AdminOperationsSnapshot | null,
  combinedPages: ReturnType<typeof combineAdminOperationCasePages>,
  scopeKey: string,
  pageCount: number,
  previousPageCount: number,
  isError: boolean,
): AdminOperationsSnapshot | null {
  if (!combinedPages) return null;
  if (!current || current.scopeKey !== scopeKey) {
    return createAdminOperationsSnapshot(combinedPages, scopeKey);
  }
  if (pageCount > previousPageCount) {
    const displayedIds = new Set(current.displayed.items.map((item) => item.id));
    const pendingIds = new Set(current.pendingNewIds);
    const continuationIds = combinedPages.items
      .map((item) => item.id)
      .filter((id) => !displayedIds.has(id) && !pendingIds.has(id));
    return paginateAdminOperationsSnapshot(current, combinedPages, continuationIds, scopeKey);
  }
  if (isError) {
    return retryAdminOperationsSnapshot(current, combinedPages);
  }
  return receiveAdminOperationsSnapshot(current, combinedPages, scopeKey);
}

function viewFromSnapshot(
  snapshot: AdminOperationsSnapshot,
  searchState: AdminOperationsSearchState,
  now: Date = new Date(),
): AdminOperationsView {
  const built = buildAdminOperationsView(
    snapshot.displayed,
    searchState.caseId,
    now,
    new Map(),
    "preserve",
  );
  const items = filterAdminOperationItems(built.items, searchState, now);
  const requested = searchState.caseId
    ? items.find((item) => item.id === searchState.caseId) ?? null
    : null;
  const selectionExcluded = searchState.caseId !== null && requested === null;
  const selectedCase = searchState.caseId === null ? items[0] ?? null : requested;
  return {
    ...built,
    items,
    selectedCase,
    selectedCaseId: selectedCase?.id ?? null,
    selectionExcluded,
    selectionFellBack: selectionExcluded,
    workViews: built.workViews,
  };
}

function isPostMutationAuthoritative(input: {
  detail: { status: string; dataUpdatedAt: number; data?: unknown } | undefined;
  list: { status: string; dataUpdatedAt: number } | undefined;
  beforeDetailAt: number;
  beforeListAt: number;
  expectedMinVersion: number;
}): boolean {
  if (!input.detail || input.detail.status !== "success") return false;
  if (!input.list || input.list.status !== "success") return false;
  if (input.detail.dataUpdatedAt <= input.beforeDetailAt) return false;
  if (input.list.dataUpdatedAt <= input.beforeListAt) return false;
  const version = (input.detail.data as { item?: { version?: number } } | undefined)?.item?.version;
  return typeof version === "number" && version > input.expectedMinVersion;
}

function deriveCommandState(input: {
  permissionDenied: boolean;
  actionState: AdminSafeActionState;
  mutationPending: boolean;
  detailBehindList: boolean;
  pendingRemoval: boolean;
  nonAuthoritative: boolean;
}): AdminSafeActionState {
  if (input.permissionDenied) return "forbidden";
  if (input.actionState === "unknown-outcome") return "unknown-outcome";
  if (input.actionState === "conflict") return "conflict";
  if (input.actionState === "complete") return "complete";
  if (input.mutationPending || input.actionState === "pending") return "pending";
  if (input.detailBehindList || input.pendingRemoval || input.nonAuthoritative) return "stale";
  return "ready";
}

function commandReasonCopy(state: AdminSafeActionState): string | undefined {
  if (state === "stale") return "최신 상태가 아닙니다. 다시 확인한 뒤 작업을 이어가세요.";
  if (state === "unknown-outcome") {
    return "명령 응답을 확인하지 못했습니다. 최신 상태를 확인한 뒤 다시 시도해 주세요.";
  }
  if (state === "conflict") return "최신 상태를 다시 불러왔습니다. 내용을 확인한 뒤 다시 시도해 주세요.";
  return undefined;
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

function filtersFrom(filter: AdminOperationCaseFilter): AdminTodayFilters {
  return {
    state: filter.states?.[0]?.toLowerCase() ?? "",
    severity: filter.severities?.[0]?.toLowerCase() ?? "",
    source: filter.sources?.[0]?.toLowerCase() ?? "",
    assignee: filter.assignee?.toLowerCase() ?? "",
  };
}

function nextDocketCaseId(items: readonly { id: string }[], selectedId: string): string | null {
  const index = items.findIndex((item) => item.id === selectedId);
  if (index < 0 || index >= items.length - 1) return null;
  return items[index + 1]!.id;
}

function isUnknownOutcomeError(error: unknown): boolean {
  if (isReadmatesTransportError(error)) return true;
  if (hasHttpStatus(error, 403) || hasHttpStatus(error, 409) || hasHttpStatus(error, 401)) return false;
  return typeof error !== "object" || error === null || !("status" in error);
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
