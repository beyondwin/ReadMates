import { useCallback, useRef, useState, type ComponentType } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLoaderData, useLocation, useParams } from "react-router-dom";
import { guestNavigationCapability } from "@/features/guest-browse/model/club-app-audience";
import { guestHomeReadView, guestSessionReadView, type GuestArchiveDetailReadView, type GuestArchiveSessionReadView, type GuestHomeReadView, type GuestNotesReadView, type GuestPage } from "@/features/guest-browse/model/guest-read-views";
import { guestArchiveQuery, guestCurrentSessionQuery, guestNoteFeedQuery, guestNoteSessionsQuery, guestUpcomingSessionsQuery } from "@/features/guest-browse/queries/guest-browse-queries";
import type { GuestScopedRouteData } from "@/features/guest-browse/route/club-app-audience-loader";
import { GuestLockedPage, type GuestLockKind } from "@/features/guest-browse/ui/guest-locked-page";
import { GuestMySpace } from "@/features/guest-browse/ui/guest-my-space";
import { GuestArchive, GuestArchiveDetail, GuestCurrentSession, GuestHome, GuestNotes, type GuestSurfaceLinkProps } from "@/features/guest-browse/ui/guest-surfaces";

type GuestLinkProps = GuestSurfaceLinkProps;

function requestedAppPath(pathname: string) {
  return pathname.replace(/^\/clubs\/[^/]+(?=\/app(?:\/|$))/, "");
}

function lockKind(path: string): GuestLockKind {
  if (path.startsWith("/app/feedback/")) return "feedback";
  if (path.startsWith("/app/notifications")) return "notifications";
  if (path === "/app/me/settings") return "settings";
  return "member";
}

export function GuestScopedAppRoute({ LinkComponent }: { LinkComponent: ComponentType<GuestLinkProps> }) {
  const location = useLocation();
  const { clubSlug } = useParams();
  const loaderData = useLoaderData() as GuestScopedRouteData;
  const appPath = requestedAppPath(location.pathname);
  const returnTo = `${location.pathname}${location.search}${location.hash}`;
  const capability = guestNavigationCapability(appPath);

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
  const content = guestBrowseContent(appPath, loaderData.guestData, clubSlug, appBasePath, returnTo, LinkComponent);

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

function guestBrowseContent(
  appPath: string,
  data: unknown,
  clubSlug: string | undefined,
  appBasePath: string,
  returnTo: string,
  LinkComponent: ComponentType<GuestLinkProps>,
) {
  if (appPath === "/app") {
    return clubSlug ? <GuestHomeRoute key={`${clubSlug}:${JSON.stringify(data)}`} initialData={data as GuestHomeReadView} clubSlug={clubSlug} appBasePath={appBasePath} returnTo={returnTo} LinkComponent={LinkComponent} /> : null;
  }

  if (appPath === "/app/session/current") {
    return <GuestCurrentSession data={data as { currentSession: GuestHomeReadView["current"]["currentSession"] }} appBasePath={appBasePath} returnTo={returnTo} LinkComponent={LinkComponent} />;
  }

  if (appPath === "/app/notes" && clubSlug) {
    const initialData = data as GuestNotesReadView;
    return <GuestNotesRoute key={`${clubSlug}:${JSON.stringify(initialData)}`} initialData={initialData} clubSlug={clubSlug} />;
  }

  if (appPath === "/app/archive" && clubSlug) {
    const initialData = data as GuestPage<GuestArchiveSessionReadView>;
    return <GuestArchiveRoute key={`${clubSlug}:${JSON.stringify(initialData)}`} initialData={initialData} clubSlug={clubSlug} appBasePath={appBasePath} LinkComponent={LinkComponent} />;
  }

  if (appPath.startsWith("/app/sessions/")) {
    return <GuestArchiveDetail data={data as GuestArchiveDetailReadView} appBasePath={appBasePath} returnTo={returnTo} LinkComponent={LinkComponent} />;
  }

  return null;
}

function GuestHomeRoute({ initialData, clubSlug, appBasePath, returnTo, LinkComponent }: { initialData: GuestHomeReadView; clubSlug: string; appBasePath: string; returnTo: string; LinkComponent: ComponentType<GuestLinkProps> }) {
  const queryClient = useQueryClient();
  const [data, setData] = useState(initialData);
  const clearError = (key: "current" | "upcoming" | "recentNotes") => setData((current) => {
    const widgetErrors = { ...(current.widgetErrors ?? {}) };
    delete widgetErrors[key];
    return { ...current, widgetErrors };
  });
  return <GuestHome data={data} appBasePath={appBasePath} returnTo={returnTo} LinkComponent={LinkComponent} onRetry={{
    current: async () => { const result = await queryClient.fetchQuery(guestCurrentSessionQuery(clubSlug)); setData((current) => ({ ...current, current: guestSessionReadView(result) })); clearError("current"); },
    upcoming: async () => { const result = await queryClient.fetchQuery(guestUpcomingSessionsQuery(clubSlug)); setData((current) => ({ ...current, upcoming: guestHomeReadView({ currentSession: current.current.currentSession }, result, { items: [], nextCursor: null }).upcoming })); clearError("upcoming"); },
    recentNotes: async () => { const result = await queryClient.fetchQuery(guestNoteFeedQuery(clubSlug, { limit: 5 })); setData((current) => ({ ...current, recentNotes: guestHomeReadView({ currentSession: current.current.currentSession }, { items: [], nextCursor: null }, result).recentNotes })); clearError("recentNotes"); },
  }} />;
}

function GuestNotesRoute({ initialData, clubSlug }: { initialData: GuestNotesReadView; clubSlug: string }) {
  const queryClient = useQueryClient();
  const [data, setData] = useState(initialData);
  const feedInFlight = useRef<string | null>(null);
  const sessionsInFlight = useRef<string | null>(null);
  const loadMoreFeed = useCallback(async () => {
    const cursor = data.feed.nextCursor;
    if (!cursor || feedInFlight.current === cursor) return;
    feedInFlight.current = cursor;
    try {
      const next = await queryClient.fetchQuery(guestNoteFeedQuery(clubSlug, { limit: 20, cursor }));
      setData((current) => current.feed.nextCursor === cursor ? { ...current, feed: appendPage(current.feed, next) } : current);
    } finally { feedInFlight.current = null; }
  }, [clubSlug, data.feed.nextCursor, queryClient]);
  const loadMoreSessions = useCallback(async () => {
    const cursor = data.sessions.nextCursor;
    if (!cursor || sessionsInFlight.current === cursor) return;
    sessionsInFlight.current = cursor;
    try {
      const next = await queryClient.fetchQuery(guestNoteSessionsQuery(clubSlug, { limit: 20, cursor }));
      setData((current) => current.sessions.nextCursor === cursor ? { ...current, sessions: appendPage(current.sessions, next) } : current);
    } finally { sessionsInFlight.current = null; }
  }, [clubSlug, data.sessions.nextCursor, queryClient]);
  return <GuestNotes data={data} onLoadMoreFeed={loadMoreFeed} onLoadMoreSessions={loadMoreSessions} />;
}

function GuestArchiveRoute({ initialData, clubSlug, appBasePath, LinkComponent }: { initialData: GuestPage<GuestArchiveSessionReadView>; clubSlug: string; appBasePath: string; LinkComponent: ComponentType<GuestLinkProps> }) {
  const queryClient = useQueryClient();
  const [data, setData] = useState(initialData);
  const inFlight = useRef<string | null>(null);
  const loadMore = useCallback(async () => {
    const cursor = data.nextCursor;
    if (!cursor || inFlight.current === cursor) return;
    inFlight.current = cursor;
    try {
      const next = await queryClient.fetchQuery(guestArchiveQuery(clubSlug, { limit: 20, cursor }));
      setData((current) => current.nextCursor === cursor ? appendPage(current, next) : current);
    } finally { inFlight.current = null; }
  }, [clubSlug, data.nextCursor, queryClient]);
  return <GuestArchive data={data} appBasePath={appBasePath} onLoadMore={loadMore} LinkComponent={LinkComponent} />;
}

function appendPage<T>(current: GuestPage<T>, next: GuestPage<T>): GuestPage<T> {
  return { ...current, items: [...current.items, ...next.items], nextCursor: next.nextCursor };
}
