import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLoaderData, useLocation, useNavigate, useParams, useSearchParams } from "react-router";
import type { HostSessionRecordLedgerPage, HostSessionTrashPage } from "@/features/host/api/host-contracts";
import { hostMeetingHref } from "@/features/host/model/host-meeting-ledger-model";
import {
  hostSessionTrashDeletedAtLabel,
  hostSessionTrashRemainingCopy,
  normalizeHostSessionLedgerFilters,
  toHostSessionLedgerSearch,
  type HostSessionLedgerFilters,
} from "@/features/host/model/host-session-ledger-model";
import { openAlreadyExistsMessage } from "@/features/host/model/host-session-lifecycle-model";
import {
  hostSessionTrashListQuery,
  isHostSessionTrashExpiredError,
  publishRestoredHostSession,
  useRestoreHostSessionMutation,
} from "@/features/host/queries/host-session-queries";
import { hostSessionRecordLedgerQuery } from "@/features/host/queries/host-session-record-queries";
import { isReadmatesApiError } from "@/shared/api/errors";
import { scopedAppLinkTarget } from "@/shared/routing/scoped-app-link-target";
import { requireHostClubContext } from "@/features/host/model/host-authority-loss";
import {
  HostSessionLedger,
  type HostSessionLedgerLinkComponent,
  type HostSessionLedgerTrashItem,
} from "@/features/host/ui/host-session-ledger";
import {
  HOST_SESSION_LEDGER_PAGE_LIMIT,
  type HostSessionLedgerRouteData,
} from "./host-session-ledger-data";
import {
  publishTransitionAction,
  TransitionOwnerObsoleteError,
  useTransitionSafetyOwner,
} from "@/shared/ui/use-transition-safety-owner";

function sameFilters(left: HostSessionLedgerFilters, right: HostSessionLedgerFilters) {
  return left.view === right.view
    && left.search === right.search
    && left.state === right.state
    && left.recordStatus === right.recordStatus
    && left.needsAttention === right.needsAttention;
}

export function HostSessionLedgerRoute({
  LinkComponent,
}: {
  LinkComponent?: HostSessionLedgerLinkComponent;
}) {
  const loaderData = useLoaderData() as HostSessionLedgerRouteData;
  const { clubSlug } = useParams<{ clubSlug: string }>();
  const context = useMemo(() => requireHostClubContext(clubSlug), [clubSlug]);
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = useMemo(
    () => {
      const params = new URLSearchParams(searchParams);
      if (/\/host\/records\/?$/.test(location.pathname)) {
        params.delete("view");
      }
      return normalizeHostSessionLedgerFilters(params);
    },
    [location.pathname, searchParams],
  );
  const trashView = filters.view === "trash";
  const firstRequest = useMemo(
    () => ({ ...filters, page: { limit: HOST_SESSION_LEDGER_PAGE_LIMIT } }),
    [filters],
  );
  const query = useQuery({
    ...hostSessionRecordLedgerQuery(firstRequest, context),
    enabled: !trashView,
  });
  const trashQuery = useQuery({
    ...hostSessionTrashListQuery({ limit: HOST_SESSION_LEDGER_PAGE_LIMIT }, context),
    enabled: trashView,
  });
  const restoreMutation = useRestoreHostSessionMutation(context);
  const transitionOwner = useTransitionSafetyOwner("host-session-ledger");
  const loaderPage = !trashView && sameFilters(filters, loaderData.filters) ? loaderData.page : null;
  const loaderTrashPage = trashView && sameFilters(filters, loaderData.filters) ? loaderData.trashPage : null;
  const basePage = query.data ?? loaderPage;
  const baseTrashPage = trashQuery.data ?? loaderTrashPage;
  const [appended, setAppended] = useState<{
    base: HostSessionRecordLedgerPage;
    items: HostSessionRecordLedgerPage["items"];
    nextCursor: string | null;
  } | null>(null);
  const [trashAppended, setTrashAppended] = useState<{
    base: HostSessionTrashPage;
    items: HostSessionTrashPage["items"];
    nextCursor: string | null;
  } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [listAnnouncement, setListAnnouncement] = useState<string | null>(null);
  const [focusHeadingRevision, setFocusHeadingRevision] = useState(0);
  const previousFocusRevision = useRef(0);
  const [restoreState, setRestoreState] = useState<Record<string, Partial<HostSessionLedgerTrashItem>>>({});
  const visiblePage = basePage && appended?.base === basePage
    ? {
        items: [...basePage.items, ...appended.items],
        nextCursor: appended.nextCursor,
      }
    : basePage;
  const visibleTrashPage = baseTrashPage && trashAppended?.base === baseTrashPage
    ? {
        items: [...baseTrashPage.items, ...trashAppended.items],
        nextCursor: trashAppended.nextCursor,
      }
    : baseTrashPage;

  const updateFilters = (next: HostSessionLedgerFilters) => {
    setAppended(null);
    setTrashAppended(null);
    setLoadMoreError(null);
    setListAnnouncement(null);
    setRestoreState({});
    const canonical = toHostSessionLedgerSearch(next);
    setSearchParams(canonical.startsWith("?") ? canonical.slice(1) : "", { replace: true });
  };

  const loadMore = async () => {
    const cursor = trashView ? visibleTrashPage?.nextCursor : visiblePage?.nextCursor;
    if (loadingMore || !cursor) {
      return;
    }
    if (trashView) {
      if (!baseTrashPage) {
        return;
      }
      setLoadingMore(true);
      setLoadMoreError(null);
      try {
        const nextPage = await queryClient.fetchQuery(hostSessionTrashListQuery({
          limit: HOST_SESSION_LEDGER_PAGE_LIMIT,
          cursor,
        }, context));
        setTrashAppended((current) => ({
          base: baseTrashPage,
          items: [...(current?.base === baseTrashPage ? current.items : []), ...nextPage.items],
          nextCursor: nextPage.nextCursor,
        }));
      } catch {
        setLoadMoreError("더 불러오지 못했습니다.");
      } finally {
        setLoadingMore(false);
      }
      return;
    }
    if (!basePage) {
      return;
    }
    setLoadingMore(true);
    setLoadMoreError(null);
    try {
      const nextPage = await queryClient.fetchQuery(hostSessionRecordLedgerQuery({
        ...filters,
        page: { limit: HOST_SESSION_LEDGER_PAGE_LIMIT, cursor },
      }, context));
      setAppended((current) => ({
        base: basePage,
        items: [...(current?.base === basePage ? current.items : []), ...nextPage.items],
        nextCursor: nextPage.nextCursor,
      }));
    } catch (error) {
      if (isReadmatesApiError(error) && error.code === "LIST_CURSOR_STALE") {
        setAppended(null);
        setLoadMoreError(null);
        setListAnnouncement("목록이 바뀌어 처음부터 다시 불러왔습니다.");
        setFocusHeadingRevision((revision) => revision + 1);
        await navigate(`${location.pathname}${location.search}`, { replace: true });
        await query.refetch();
      } else {
        setLoadMoreError("더 불러오지 못했습니다.");
      }
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    if (focusHeadingRevision > previousFocusRevision.current) {
      headingRef.current?.focus();
    }
    previousFocusRevision.current = focusHeadingRevision;
  }, [focusHeadingRevision]);

  const openSessionHref = (openSessionId: string) => {
    const href = hostMeetingHref(openSessionId);
    return clubSlug
      ? scopedAppLinkTarget(`/clubs/${encodeURIComponent(clubSlug)}/app`, href)
      : href;
  };

  const restoreTrashItem = async (sessionId: string) => {
    setRestoreState((current) => ({
      ...current,
      [sessionId]: { restoring: true, restoreError: null, restoreConflict: null },
    }));
    const operationId = `host-session-restore:${sessionId}`;
    const handle = transitionOwner.begin(operationId, "L2", async () => ({ operationId, outcome: "still-unknown" }));
    try {
      const detail = await restoreMutation.mutateAsync(sessionId);
      if (await handle.settle("succeeded") !== "accepted") return;
      await publishTransitionAction(handle, "cache", async () => {
        await publishRestoredHostSession(queryClient, detail, sessionId, context);
        if (!handle.isPublicationCurrent()) throw new TransitionOwnerObsoleteError();
        await trashQuery.refetch();
      });
      await publishTransitionAction(handle, "ui", () => {
        setTrashAppended(null);
        setRestoreState((current) => {
        const next = { ...current };
        delete next[sessionId];
        return next;
        });
      });
    } catch (error) {
      if (await handle.settle("failed") !== "accepted") return;
      if (isHostSessionTrashExpiredError(error)) {
        await publishTransitionAction(handle, "errorCopy", () => {
          setRestoreState((current) => ({
            ...current,
            [sessionId]: {
              restoring: false,
              restoreDisabled: true,
              restoreDisabledReason: "복원 기간이 지났습니다.",
              restoreError: null,
              restoreConflict: null,
            },
          }));
        });
        return;
      }
      if (isReadmatesApiError(error) && error.code === "SESSION_OPEN_ALREADY_EXISTS" && error.openSessionId) {
        await publishTransitionAction(handle, "errorCopy", () => {
          setRestoreState((current) => ({
            ...current,
            [sessionId]: {
              restoring: false,
              restoreError: null,
              restoreConflict: {
                openSessionHref: openSessionHref(error.openSessionId as string),
                message: openAlreadyExistsMessage(),
              },
            },
          }));
        });
        return;
      }
      await publishTransitionAction(handle, "errorCopy", () => {
        setRestoreState((current) => ({
          ...current,
          [sessionId]: {
            restoring: false,
            restoreError: "모임을 복원하지 못했습니다.",
          },
        }));
      });
    }
  };

  const trashItems: HostSessionLedgerTrashItem[] = (visibleTrashPage?.items ?? []).map((item) => ({
    sessionId: item.sessionId,
    sessionNumber: item.sessionNumber,
    title: item.title,
    state: item.state,
    deletedAtLabel: hostSessionTrashDeletedAtLabel(item.deletedAt),
    remainingCopy: hostSessionTrashRemainingCopy(item.purgeAfter),
    ...restoreState[item.sessionId],
  }));

  return (
    <main style={{ minWidth: 0 }}>
      <section className="page-header-compact">
        <div className="container">
          <div className="eyebrow">호스트 · 기록</div>
          <h1 ref={headingRef} tabIndex={-1} className="h1 editorial" style={{ margin: "6px 0 4px" }}>
            {trashView ? "휴지통" : "기록"}
          </h1>
          <p className="small" style={{ color: "var(--text-2)", margin: 0 }}>
            {trashView
              ? "삭제된 모임을 서버가 정한 기간 동안 복원할 수 있습니다."
              : "마친 모임의 기록 상태, 초안, 공개 범위를 한곳에서 확인합니다."}
          </p>
        </div>
      </section>
      <section className="container" style={{ paddingTop: 8, paddingBottom: 72, minWidth: 0 }}>
        <p className="sr-only" role="status" aria-live="polite">{listAnnouncement}</p>
        <HostSessionLedger
          items={visiblePage?.items ?? []}
          trashItems={trashItems}
          filters={filters}
          nextCursor={(trashView ? visibleTrashPage?.nextCursor : visiblePage?.nextCursor) ?? null}
          loading={trashView ? trashQuery.isPending && !baseTrashPage : query.isPending && !basePage}
          loadingMore={loadingMore}
          errorMessage={
            trashView
              ? trashQuery.isError && !baseTrashPage ? "휴지통을 불러오지 못했습니다." : null
              : query.isError && !basePage ? "모임 기록을 불러오지 못했습니다. 검색 조건은 유지됩니다." : null
          }
          loadMoreError={loadMoreError}
          onFiltersChange={updateFilters}
          onLoadMore={() => void loadMore()}
          onRetry={() => {
            void (trashView ? trashQuery.refetch() : query.refetch());
          }}
          onRestore={(sessionId) => {
            void restoreTrashItem(sessionId);
          }}
          onRetryRestore={(sessionId) => {
            void restoreTrashItem(sessionId);
          }}
          trashHref="/app/host/sessions?view=trash"
          activeHref="/app/host/records"
          recordReturnHref={scopedAppLinkTarget(location.pathname, "/app/host/records")}
          LinkComponent={LinkComponent}
        />
      </section>
    </main>
  );
}
