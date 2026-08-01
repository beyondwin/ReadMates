import type { LoaderFunctionArgs } from "react-router-dom";
import {
  fetchGuestArchive,
  fetchGuestArchiveDetail,
  fetchGuestCurrentSession,
  fetchGuestNoteFeed,
  fetchGuestNoteSessions,
  fetchGuestUpcomingSessions,
} from "@/features/guest-browse/api/guest-browse-api";
import {
  guestArchiveDetailReadView,
  guestArchiveReadView,
  guestHomeReadView,
  guestNotesReadView,
  guestSessionReadView,
} from "@/features/guest-browse/model/guest-read-views";
import { clubSlugFromLoaderArgs, type ClubScopedLoaderArgs } from "@/shared/auth/member-app-loader";

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
  const [current, upcoming, recentNotes] = await Promise.all([
    fetchGuestCurrentSession(clubSlug),
    fetchGuestUpcomingSessions(clubSlug),
    fetchGuestNoteFeed(clubSlug, { limit: 5 }),
  ]);
  return guestHomeReadView(current, upcoming, recentNotes);
}

export async function guestCurrentSessionLoader(args?: Pick<LoaderFunctionArgs, "params">) {
  return guestSessionReadView(await fetchGuestCurrentSession(requiredClubSlug(args)));
}

export async function guestNotesLoader(args?: Pick<LoaderFunctionArgs, "params">) {
  const clubSlug = requiredClubSlug(args);
  const [sessions, feed] = await Promise.all([fetchGuestNoteSessions(clubSlug), fetchGuestNoteFeed(clubSlug)]);
  return guestNotesReadView(sessions, feed);
}

export async function guestArchiveLoader(args?: Pick<LoaderFunctionArgs, "params">) {
  return guestArchiveReadView(await fetchGuestArchive(requiredClubSlug(args)));
}

export async function guestArchiveDetailLoader(args?: Pick<LoaderFunctionArgs, "params">) {
  return guestArchiveDetailReadView(await fetchGuestArchiveDetail(requiredClubSlug(args), requiredSessionId(args)));
}
