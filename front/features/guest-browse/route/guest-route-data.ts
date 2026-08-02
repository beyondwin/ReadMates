import type { LoaderFunctionArgs } from "react-router";
import {
  fetchGuestArchive,
  fetchGuestArchiveDetail,
  fetchGuestCurrentSession,
  fetchGuestNoteFeed,
  fetchGuestNoteSessions,
  fetchGuestUpcomingSessions,
} from "@/features/guest-browse/api/guest-browse-api";
import {
  guestArchivePageReadView,
  guestHomeReadView,
  guestNotesReadView,
} from "@/features/guest-browse/model/guest-read-views";
import { clubSlugFromLoaderArgs, type ClubScopedLoaderArgs } from "@/shared/auth/member-app-loader";
import { isReadmatesApiError } from "@/shared/api/errors";

function requiredClubSlug(args?: ClubScopedLoaderArgs) {
  const clubSlug = clubSlugFromLoaderArgs(args);
  if (!clubSlug) {
    throw new Response(null, { status: 404 });
  }
  return clubSlug;
}

function requiredSessionId(args?: Pick<LoaderFunctionArgs, "params">) {
  const sessionId = args?.params?.sessionId;
  if (!sessionId) {
    throw new Response(null, { status: 404 });
  }
  return sessionId;
}

export async function guestHomeLoader(args?: Pick<LoaderFunctionArgs, "params">) {
  const clubSlug = requiredClubSlug(args);
  const [current, upcoming, recentNotes] = await Promise.allSettled([
    fetchGuestCurrentSession(clubSlug),
    fetchGuestUpcomingSessions(clubSlug),
    fetchGuestNoteFeed(clubSlug, { limit: 5 }),
  ]);
  const widgetErrors = {
    ...(current.status === "rejected" ? { current: guestWidgetError(current.reason) } : {}),
    ...(upcoming.status === "rejected" ? { upcoming: guestWidgetError(upcoming.reason) } : {}),
    ...(recentNotes.status === "rejected" ? { recentNotes: guestWidgetError(recentNotes.reason) } : {}),
  };
  return guestHomeReadView(
    current.status === "fulfilled" ? current.value : { currentSession: null },
    upcoming.status === "fulfilled" ? upcoming.value : { items: [], nextCursor: null },
    recentNotes.status === "fulfilled" ? recentNotes.value : { items: [], nextCursor: null },
    widgetErrors,
  );
}

export function guestWidgetError(reason: unknown, now = Date.now()) {
  if (isReadmatesApiError(reason)) {
    const retryAfterSeconds = reason.status === 429 ? boundedRetryAfterSeconds(reason.response.headers.get("Retry-After"), now) : undefined;
    return { status: reason.status, ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}) };
  }
  if (reason && typeof reason === "object" && "status" in reason && typeof reason.status === "number") return { status: reason.status };
  return {};
}

function boundedRetryAfterSeconds(value: string | null, now: number) {
  if (!value) return undefined;
  const delta = Number(value);
  const seconds = Number.isFinite(delta) && delta >= 0 ? Math.ceil(delta) : Math.ceil((Date.parse(value) - now) / 1000);
  return Number.isFinite(seconds) && seconds >= 0 ? Math.min(seconds, 3600) : undefined;
}

export async function guestCurrentSessionLoader(args?: Pick<LoaderFunctionArgs, "params">) {
  return fetchGuestCurrentSession(requiredClubSlug(args));
}

export async function guestNotesLoader(args?: Pick<LoaderFunctionArgs, "params">) {
  const clubSlug = requiredClubSlug(args);
  const [sessions, feed] = await Promise.all([fetchGuestNoteSessions(clubSlug), fetchGuestNoteFeed(clubSlug)]);
  return guestNotesReadView(sessions, feed);
}

export async function guestArchiveLoader(args?: Pick<LoaderFunctionArgs, "params">) {
  return guestArchivePageReadView(await fetchGuestArchive(requiredClubSlug(args)));
}

export async function guestArchiveDetailLoader(args?: Pick<LoaderFunctionArgs, "params">) {
  return fetchGuestArchiveDetail(requiredClubSlug(args), requiredSessionId(args));
}
