import type { LoaderFunctionArgs } from "react-router-dom";
import {
  fetchGuestArchive,
  fetchGuestArchiveDetail,
  fetchGuestCurrentSession,
  fetchGuestNoteFeed,
  fetchGuestNoteSessions,
  fetchGuestUpcomingSessions,
} from "@/features/guest-browse/api/guest-browse-api";
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
  const [current, upcoming] = await Promise.all([fetchGuestCurrentSession(clubSlug), fetchGuestUpcomingSessions(clubSlug)]);
  return { current, upcoming };
}

export function guestCurrentSessionLoader(args?: Pick<LoaderFunctionArgs, "params">) {
  return fetchGuestCurrentSession(requiredClubSlug(args));
}

export async function guestNotesLoader(args?: Pick<LoaderFunctionArgs, "params">) {
  const clubSlug = requiredClubSlug(args);
  const [sessions, feed] = await Promise.all([fetchGuestNoteSessions(clubSlug), fetchGuestNoteFeed(clubSlug)]);
  return { sessions, feed };
}

export function guestArchiveLoader(args?: Pick<LoaderFunctionArgs, "params">) {
  return fetchGuestArchive(requiredClubSlug(args));
}

export function guestArchiveDetailLoader(args?: Pick<LoaderFunctionArgs, "params">) {
  return fetchGuestArchiveDetail(requiredClubSlug(args), requiredSessionId(args));
}
