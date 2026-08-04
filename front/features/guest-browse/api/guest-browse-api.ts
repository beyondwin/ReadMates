import { readmatesPublicFetch } from "@/shared/api/client";
import {
  parseGuestArchive,
  parseGuestArchiveDetail,
  parseGuestBrowseShell,
  parseGuestCurrentSession,
  parseGuestNoteFeed,
  parseGuestNoteSessions,
  parseGuestUpcomingSessions,
  type GuestArchiveDetail,
  type GuestArchivePage,
  type GuestBrowseShell,
  type GuestCurrentSessionResponse,
  type GuestNoteFeedPage,
  type GuestNoteSessionsPage,
  type GuestUpcomingSessionsPage,
} from "./guest-browse-contracts";

export type GuestBrowsePage = {
  limit?: number;
  cursor?: string | null;
};

export type GuestNoteFeedPageRequest = GuestBrowsePage & {
  sessionId?: string | null;
};

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

function browsePath(clubSlug: string, suffix = "") {
  return `/api/public/clubs/${encodeURIComponent(clubSlug)}/browse${suffix}`;
}

function pageSearchParams(page: GuestBrowsePage = {}) {
  const limit = page.limit ?? DEFAULT_PAGE_SIZE;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) {
    throw new RangeError(`Guest browse limit must be between 1 and ${MAX_PAGE_SIZE}`);
  }

  const search = new URLSearchParams({ limit: String(limit) });
  if (page.cursor) {
    search.set("cursor", page.cursor);
  }
  return `?${search.toString()}`;
}

function noteFeedSearchParams(page: GuestNoteFeedPageRequest = {}) {
  const search = new URLSearchParams(pageSearchParams(page).slice(1));
  if (page.sessionId) {
    search.set("sessionId", page.sessionId);
  }
  return `?${search.toString()}`;
}

export function fetchGuestBrowseShell(clubSlug: string): Promise<GuestBrowseShell> {
  return readmatesPublicFetch<unknown>(browsePath(clubSlug)).then(parseGuestBrowseShell);
}

export function fetchGuestCurrentSession(clubSlug: string): Promise<GuestCurrentSessionResponse> {
  return readmatesPublicFetch<unknown>(browsePath(clubSlug, "/sessions/current")).then(parseGuestCurrentSession);
}

export function fetchGuestUpcomingSessions(clubSlug: string, page?: GuestBrowsePage): Promise<GuestUpcomingSessionsPage> {
  return readmatesPublicFetch<unknown>(browsePath(clubSlug, `/sessions/upcoming${pageSearchParams(page)}`)).then(
    parseGuestUpcomingSessions,
  );
}

export function fetchGuestNoteSessions(clubSlug: string, page?: GuestBrowsePage): Promise<GuestNoteSessionsPage> {
  return readmatesPublicFetch<unknown>(browsePath(clubSlug, `/notes/sessions${pageSearchParams(page)}`)).then(
    parseGuestNoteSessions,
  );
}

export function fetchGuestNoteFeed(clubSlug: string, page?: GuestNoteFeedPageRequest): Promise<GuestNoteFeedPage> {
  return readmatesPublicFetch<unknown>(browsePath(clubSlug, `/notes/feed${noteFeedSearchParams(page)}`)).then(parseGuestNoteFeed);
}

export function fetchGuestArchive(clubSlug: string, page?: GuestBrowsePage): Promise<GuestArchivePage> {
  return readmatesPublicFetch<unknown>(browsePath(clubSlug, `/archive${pageSearchParams(page)}`)).then(parseGuestArchive);
}

export function fetchGuestArchiveDetail(clubSlug: string, sessionId: string): Promise<GuestArchiveDetail> {
  return readmatesPublicFetch<unknown>(browsePath(clubSlug, `/archive/${encodeURIComponent(sessionId)}`)).then(
    parseGuestArchiveDetail,
  );
}
