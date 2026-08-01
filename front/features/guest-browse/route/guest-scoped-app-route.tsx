import { useCallback, useState, type ComponentType, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLoaderData, useLocation, useParams } from "react-router-dom";
import { guestNavigationCapability } from "@/features/guest-browse/model/club-app-audience";
import type { GuestArchiveDetailReadView, GuestArchiveSessionReadView, GuestHomeReadView, GuestNotesReadView, GuestPage } from "@/features/guest-browse/model/guest-read-views";
import { guestArchiveQuery, guestNoteFeedQuery, guestNoteSessionsQuery } from "@/features/guest-browse/queries/guest-browse-queries";
import type { GuestScopedRouteData } from "@/features/guest-browse/route/club-app-audience-loader";
import { GuestLockedPage, type GuestLockKind } from "@/features/guest-browse/ui/guest-locked-page";
import { GuestMySpace } from "@/features/guest-browse/ui/guest-my-space";
import { GuestArchive, GuestArchiveDetail, GuestCurrentSession, GuestHome, GuestNotes } from "@/features/guest-browse/ui/guest-surfaces";

type GuestLinkProps = {
  to: string;
  className?: string;
  children: ReactNode;
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
  const content = guestBrowseContent(appPath, loaderData.guestData, clubSlug, appBasePath);

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

function guestBrowseContent(appPath: string, data: unknown, clubSlug: string | undefined, appBasePath: string) {
  if (appPath === "/app") {
    return <GuestHome data={data as GuestHomeReadView} appBasePath={appBasePath} />;
  }

  if (appPath === "/app/session/current") {
    return <GuestCurrentSession data={data as { currentSession: GuestHomeReadView["current"]["currentSession"] }} appBasePath={appBasePath} />;
  }

  if (appPath === "/app/notes" && clubSlug) {
    return <GuestNotesRoute initialData={data as GuestNotesReadView} clubSlug={clubSlug} />;
  }

  if (appPath === "/app/archive" && clubSlug) {
    return <GuestArchiveRoute initialData={data as GuestPage<GuestArchiveSessionReadView>} clubSlug={clubSlug} appBasePath={appBasePath} />;
  }

  if (appPath.startsWith("/app/sessions/")) {
    return <GuestArchiveDetail data={data as GuestArchiveDetailReadView} appBasePath={appBasePath} />;
  }

  return null;
}

function GuestNotesRoute({ initialData, clubSlug }: { initialData: GuestNotesReadView; clubSlug: string }) {
  const queryClient = useQueryClient();
  const [data, setData] = useState(initialData);
  const loadMoreFeed = useCallback(async () => {
    const cursor = data.feed.nextCursor;
    if (!cursor) return;
    const next = await queryClient.fetchQuery(guestNoteFeedQuery(clubSlug, { limit: 20, cursor }));
    setData((current) => ({ ...current, feed: appendPage(current.feed, next) }));
  }, [clubSlug, data.feed.nextCursor, queryClient]);
  const loadMoreSessions = useCallback(async () => {
    const cursor = data.sessions.nextCursor;
    if (!cursor) return;
    const next = await queryClient.fetchQuery(guestNoteSessionsQuery(clubSlug, { limit: 20, cursor }));
    setData((current) => ({ ...current, sessions: appendPage(current.sessions, next) }));
  }, [clubSlug, data.sessions.nextCursor, queryClient]);
  return <GuestNotes data={data} onLoadMoreFeed={loadMoreFeed} onLoadMoreSessions={loadMoreSessions} />;
}

function GuestArchiveRoute({ initialData, clubSlug, appBasePath }: { initialData: GuestPage<GuestArchiveSessionReadView>; clubSlug: string; appBasePath: string }) {
  const queryClient = useQueryClient();
  const [data, setData] = useState(initialData);
  const loadMore = useCallback(async () => {
    const cursor = data.nextCursor;
    if (!cursor) return;
    const next = await queryClient.fetchQuery(guestArchiveQuery(clubSlug, { limit: 20, cursor }));
    setData((current) => appendPage(current, next));
  }, [clubSlug, data.nextCursor, queryClient]);
  return <GuestArchive data={data} appBasePath={appBasePath} onLoadMore={loadMore} />;
}

function appendPage<T>(current: GuestPage<T>, next: GuestPage<T>): GuestPage<T> {
  return { ...current, items: [...current.items, ...next.items], nextCursor: next.nextCursor };
}
