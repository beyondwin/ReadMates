import { useCallback, useRef, useState, type ComponentType, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLoaderData, useLocation, useParams, useRevalidator, useSearchParams } from "react-router";
import { guestNavigationCapability } from "@/features/guest-browse/model/club-app-audience";
import { guestLoaderSourceKey } from "@/features/guest-browse/model/guest-loader-source-key";
import type { GuestArchiveDetail } from "@/features/guest-browse/api/guest-browse-contracts";
import { guestArchivePageReadView, guestHomeReadView, guestNoteFeedReadPage, guestNoteSessionsReadPage, guestSessionReadView, guestUpcomingPageReadView, type GuestArchiveSessionReadView, type GuestHomeReadView, type GuestNotesReadView, type GuestPage } from "@/features/guest-browse/model/guest-read-views";
import { guestArchiveQuery, guestCurrentSessionQuery, guestNoteFeedQuery, guestNoteSessionsQuery, guestUpcomingSessionsQuery } from "@/features/guest-browse/queries/guest-browse-queries";
import type { GuestScopedRouteData, GuestScopedRouteFailureData } from "@/features/guest-browse/route/club-app-audience-loader";
import { GuestLockedPage, type GuestLockKind } from "@/features/guest-browse/ui/guest-locked-page";
import { GuestMySpace } from "@/features/guest-browse/ui/guest-my-space";
import type { GuestSurfaceLinkProps } from "@/features/guest-browse/ui/guest-surfaces";
import { loginPathForReturnTo } from "@/shared/auth/login-return";
import { feedFilterFromSearchParam, type FeedFilter } from "@/shared/model/notes-feed-model";
import NotesFeedPage from "@/shared/ui/notes-feed-page";

type GuestLinkProps = GuestSurfaceLinkProps;
export type GuestCurrentSessionContentProps = {
  data: unknown;
  LinkComponent: ComponentType<GuestLinkProps>;
};
export type GuestHomeContentProps = {
  data: GuestHomeReadView;
  appBasePath: string;
  LinkComponent: ComponentType<GuestLinkProps>;
  onRetry: Partial<Record<"current" | "upcoming" | "recentNotes", () => Promise<void>>>;
};
export type GuestArchiveContentProps = {
  data: GuestPage<GuestArchiveSessionReadView>;
  routePathname: string;
  routeSearch: string;
  feedbackLockedAction: ReactNode;
  onLoadMoreSessions: () => Promise<void>;
};
export type GuestSessionDetailContentProps = {
  data: GuestArchiveDetail;
  appBasePath: string;
  feedbackLockedAction: ReactNode;
};
function requestedAppPath(pathname: string) {
  return pathname.replace(/^\/clubs\/[^/]+(?=\/app(?:\/|$))/, "");
}

function lockKind(path: string): GuestLockKind {
  if (path.startsWith("/app/feedback/")) return "feedback";
  if (path.startsWith("/app/notifications")) return "notifications";
  if (path === "/app/me/settings") return "settings";
  return "member";
}

export function GuestScopedAppRoute({
  LinkComponent,
  GuestHomeContent,
  GuestCurrentSessionContent,
  GuestArchiveContent,
  GuestSessionDetailContent,
}: {
  LinkComponent: ComponentType<GuestLinkProps>;
  GuestHomeContent?: ComponentType<GuestHomeContentProps>;
  GuestCurrentSessionContent?: ComponentType<GuestCurrentSessionContentProps>;
  GuestArchiveContent?: ComponentType<GuestArchiveContentProps>;
  GuestSessionDetailContent?: ComponentType<GuestSessionDetailContentProps>;
}) {
  const location = useLocation();
  const { clubSlug } = useParams();
  const loaderData = useLoaderData() as GuestScopedRouteData;
  const appPath = requestedAppPath(location.pathname);
  const returnTo = `${location.pathname}${location.search}${location.hash}`;
  const capability = guestNavigationCapability(appPath);

  if ("guestFailure" in loaderData) return <GuestPublicRouteError failure={(loaderData as GuestScopedRouteFailureData).guestFailure} />;

  if (capability === "PREVIEW") {
    return <GuestMySpace returnTo={returnTo} LinkComponent={LinkComponent} />;
  }

  if (capability === "LOCKED") {
    return (
      <GuestLockedPage
        kind={lockKind(appPath)}
        returnTo={returnTo}
        LinkComponent={LinkComponent}
      />
    );
  }

  const appBasePath = `/clubs/${encodeURIComponent(clubSlug ?? "")}/app`;
  const content = guestBrowseContent(appPath, loaderData.guestData, clubSlug, appBasePath, returnTo, LinkComponent, GuestHomeContent, GuestCurrentSessionContent, GuestArchiveContent, GuestSessionDetailContent, new URLSearchParams(location.search).get("sessionId"));

  if (content) {
    return content;
  }

  return (
    <main className="rm-guest-route container" aria-labelledby="guest-browse-title">
      <section className="surface rm-guest-browse-landing">
        <p className="eyebrow">게스트</p>
        <h1 id="guest-browse-title" className="h1 editorial">
          클럽 둘러보기
        </h1>
        <p className="body">공개된 클럽 기록을 차분히 둘러볼 수 있습니다.</p>
      </section>
    </main>
  );
}

export function GuestPublicRouteError({ failure }: { failure: { status: number; retryAfterSeconds?: number } }) {
  const revalidator = useRevalidator();
  return <main className="container" style={{ padding: "40px 0" }}><section className="surface-quiet" role="status" style={{ padding: 24 }}><h1 className="h3 editorial" style={{ margin: 0 }}>공개 기록을 불러오지 못했습니다.</h1><p className="small" style={{ color: "var(--text-2)" }}>{failure.status === 429 ? failure.retryAfterSeconds !== undefined ? `${failure.retryAfterSeconds}초 뒤에 다시 시도해 주세요.` : "요청이 많습니다. 잠시 뒤에 다시 시도해 주세요." : "잠시 후 다시 시도해 주세요."}</p><button type="button" className="btn btn-quiet" onClick={() => revalidator.revalidate()} disabled={revalidator.state !== "idle"}>{revalidator.state === "idle" ? "다시 시도" : "불러오는 중"}</button></section></main>;
}

function guestBrowseContent(
  appPath: string,
  data: unknown,
  clubSlug: string | undefined,
  appBasePath: string,
  returnTo: string,
  LinkComponent: ComponentType<GuestLinkProps>,
  GuestHomeContent: ComponentType<GuestHomeContentProps> | undefined,
  GuestCurrentSessionContent: ComponentType<GuestCurrentSessionContentProps> | undefined,
  GuestArchiveContent: ComponentType<GuestArchiveContentProps> | undefined,
  GuestSessionDetailContent: ComponentType<GuestSessionDetailContentProps> | undefined,
  selectedSessionId: string | null,
) {
  if (appPath === "/app") {
    return clubSlug && data && typeof data === "object" && GuestHomeContent ? <GuestHomeRoute key={guestLoaderSourceKey(clubSlug, data)} initialData={data as GuestHomeReadView} clubSlug={clubSlug} appBasePath={appBasePath} returnTo={returnTo} LinkComponent={LinkComponent} GuestHomeContent={GuestHomeContent} /> : null;
  }

  if (appPath === "/app/session/current") {
    return GuestCurrentSessionContent ? <GuestCurrentSessionContent data={data} LinkComponent={LinkComponent} /> : null;
  }

  if (appPath === "/app/notes" && clubSlug) {
    const initialData = data as GuestNotesReadView;
    return <GuestNotesRoute key={guestLoaderSourceKey(clubSlug, initialData)} initialData={initialData} clubSlug={clubSlug} appBasePath={appBasePath} LinkComponent={LinkComponent} selectedSessionId={selectedSessionId} />;
  }

  if (appPath === "/app/archive" && clubSlug) {
    const initialData = data as GuestPage<GuestArchiveSessionReadView>;
    return GuestArchiveContent ? <GuestArchiveRoute key={guestLoaderSourceKey(clubSlug, initialData)} initialData={initialData} clubSlug={clubSlug} appBasePath={appBasePath} LinkComponent={LinkComponent} GuestArchiveContent={GuestArchiveContent} /> : null;
  }

  if (appPath.startsWith("/app/sessions/")) {
    const detail = data as GuestArchiveDetail;
    return GuestSessionDetailContent ? (
      <GuestSessionDetailContent
        data={detail}
        appBasePath={appBasePath}
        feedbackLockedAction={(
          <LinkComponent
            className="btn btn-quiet btn-sm"
            to={`${appBasePath}/feedback/${encodeURIComponent(detail.sessionId)}`}
          >
            피드백 보기
          </LinkComponent>
        )}
      />
    ) : null;
  }

  return null;
}

export function GuestHomeRoute({ initialData, clubSlug, appBasePath, LinkComponent, GuestHomeContent }: { initialData: GuestHomeReadView; clubSlug: string; appBasePath: string; returnTo: string; LinkComponent: ComponentType<GuestLinkProps>; GuestHomeContent: ComponentType<GuestHomeContentProps> }) {
  const queryClient = useQueryClient();
  const [data, setData] = useState(initialData);
  const clearError = (key: "current" | "upcoming" | "recentNotes") => setData((current) => {
    const widgetErrors = { ...(current.widgetErrors ?? {}) };
    delete widgetErrors[key];
    return { ...current, widgetErrors };
  });
  return <GuestHomeContent data={data} appBasePath={appBasePath} LinkComponent={LinkComponent} onRetry={{
    current: async () => { const result = await queryClient.fetchQuery(guestCurrentSessionQuery(clubSlug)); setData((current) => ({ ...current, current: guestSessionReadView(result) })); clearError("current"); },
    upcoming: async () => { const result = await queryClient.fetchQuery(guestUpcomingSessionsQuery(clubSlug)); setData((current) => ({ ...current, upcoming: guestUpcomingPageReadView(result) })); clearError("upcoming"); },
    recentNotes: async () => { const result = await queryClient.fetchQuery(guestNoteFeedQuery(clubSlug, { limit: 5 })); setData((current) => ({ ...current, recentNotes: guestHomeReadView({ currentSession: current.current.currentSession }, { items: [], nextCursor: null }, result).recentNotes })); clearError("recentNotes"); },
  }} />;
}

export function GuestNotesRoute({ initialData, clubSlug, appBasePath, LinkComponent, selectedSessionId }: { initialData: GuestNotesReadView; clubSlug: string; appBasePath: string; LinkComponent: ComponentType<GuestLinkProps>; selectedSessionId: string | null }) {
  const queryClient = useQueryClient();
  const [data, setData] = useState(initialData);
  const [searchParams, setSearchParams] = useSearchParams();
  const feedInFlight = useRef<string | null>(null);
  const sessionsInFlight = useRef<string | null>(null);
  const selectedSession = data.sessions.items.find((session) => session.sessionId === selectedSessionId) ?? null;
  const handleFilterChange = useCallback((filter: FeedFilter) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);

      if (filter === "all") {
        next.delete("filter");
      } else {
        next.set("filter", filter);
      }

      return next;
    }, { replace: true });
  }, [setSearchParams]);
  const loadMoreFeed = useCallback(async () => {
    const cursor = data.feed.nextCursor;
    if (!cursor || feedInFlight.current === cursor) return;
    feedInFlight.current = cursor;
    try {
      const next = await queryClient.fetchQuery(guestNoteFeedQuery(clubSlug, { limit: 20, cursor }));
      setData((current) => current.feed.nextCursor === cursor ? { ...current, feed: appendPage(current.feed, guestNoteFeedReadPage(next)) } : current);
    } finally { feedInFlight.current = null; }
  }, [clubSlug, data.feed.nextCursor, queryClient]);
  const loadMoreSessions = useCallback(async () => {
    const cursor = data.sessions.nextCursor;
    if (!cursor || sessionsInFlight.current === cursor) return;
    sessionsInFlight.current = cursor;
    try {
      const next = await queryClient.fetchQuery(guestNoteSessionsQuery(clubSlug, { limit: 20, cursor }));
      setData((current) => current.sessions.nextCursor === cursor ? { ...current, sessions: appendPage(current.sessions, guestNoteSessionsReadPage(next)) } : current);
    } finally { sessionsInFlight.current = null; }
  }, [clubSlug, data.sessions.nextCursor, queryClient]);
  const GuestNotesLink = ({ to, ...props }: GuestSurfaceLinkProps) => <LinkComponent {...props} to={`${appBasePath}${to.replace(/^\/app/, "")}`} />;

  return (
    <NotesFeedPage
      items={guestNoteFeedReadPage(data.feed)}
      noteSessions={guestNoteSessionsReadPage(data.sessions)}
      selectedSessionId={selectedSessionId}
      selectedSession={selectedSession}
      initialFilter={feedFilterFromSearchParam(searchParams.get("filter"))}
      onFilterChange={handleFilterChange}
      onLoadMoreItems={loadMoreFeed}
      onLoadMoreNoteSessions={loadMoreSessions}
      LinkComponent={GuestNotesLink}
    />
  );
}

export function GuestArchiveRoute({ initialData, clubSlug, LinkComponent, GuestArchiveContent }: { initialData: GuestPage<GuestArchiveSessionReadView>; clubSlug: string; appBasePath: string; LinkComponent: ComponentType<GuestLinkProps>; GuestArchiveContent: ComponentType<GuestArchiveContentProps> }) {
  const queryClient = useQueryClient();
  const location = useLocation();
  const [data, setData] = useState(initialData);
  const inFlight = useRef<string | null>(null);
  const loadMore = useCallback(async () => {
    const cursor = data.nextCursor;
    if (!cursor || inFlight.current === cursor) return;
    inFlight.current = cursor;
    try {
      const next = await queryClient.fetchQuery(guestArchiveQuery(clubSlug, { limit: 20, cursor }));
      setData((current) => current.nextCursor === cursor ? appendPage(current, guestArchivePageReadView(next)) : current);
    } finally { inFlight.current = null; }
  }, [clubSlug, data.nextCursor, queryClient]);
  const currentScopedArchiveUrl = `${location.pathname}${location.search}`;

  return (
    <GuestArchiveContent
      data={data}
      routePathname={location.pathname}
      routeSearch={location.search}
      onLoadMoreSessions={loadMore}
      feedbackLockedAction={(
        <LinkComponent className="btn btn-primary btn-sm" to={loginPathForReturnTo(currentScopedArchiveUrl)}>
          멤버로 시작
        </LinkComponent>
      )}
    />
  );
}

function appendPage<T>(current: GuestPage<T>, next: GuestPage<T>): GuestPage<T> {
  return { ...current, items: [...current.items, ...next.items], nextCursor: next.nextCursor };
}
