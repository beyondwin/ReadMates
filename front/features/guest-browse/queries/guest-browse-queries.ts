import { queryOptions } from "@tanstack/react-query";
import {
  fetchGuestArchive,
  fetchGuestArchiveDetail,
  fetchGuestBrowseShell,
  fetchGuestCurrentSession,
  fetchGuestNoteFeed,
  fetchGuestNoteSessions,
  fetchGuestUpcomingSessions,
  type GuestBrowsePage,
} from "@/features/guest-browse/api/guest-browse-api";

export const guestBrowseKeys = {
  all: ["guest-browse"] as const,
  club: (clubSlug: string) => [...guestBrowseKeys.all, clubSlug] as const,
  shell: (clubSlug: string) => [...guestBrowseKeys.club(clubSlug), "shell"] as const,
  current: (clubSlug: string) => [...guestBrowseKeys.club(clubSlug), "current"] as const,
  upcoming: (clubSlug: string, page?: GuestBrowsePage) =>
    [...guestBrowseKeys.club(clubSlug), "upcoming", page?.limit ?? 20, page?.cursor ?? null] as const,
  noteSessions: (clubSlug: string, page?: GuestBrowsePage) =>
    [...guestBrowseKeys.club(clubSlug), "note-sessions", page?.limit ?? 20, page?.cursor ?? null] as const,
  noteFeed: (clubSlug: string, page?: GuestBrowsePage) =>
    [...guestBrowseKeys.club(clubSlug), "note-feed", page?.limit ?? 20, page?.cursor ?? null] as const,
  archive: (clubSlug: string, page?: GuestBrowsePage) =>
    [...guestBrowseKeys.club(clubSlug), "archive", page?.limit ?? 20, page?.cursor ?? null] as const,
  archiveDetail: (clubSlug: string, sessionId: string) =>
    [...guestBrowseKeys.club(clubSlug), "archive-detail", sessionId] as const,
} as const;

const guestBrowseQueryPolicy = { staleTime: 0 } as const;

export const guestBrowseShellQuery = (clubSlug: string) =>
  queryOptions({ queryKey: guestBrowseKeys.shell(clubSlug), queryFn: () => fetchGuestBrowseShell(clubSlug), ...guestBrowseQueryPolicy });
export const guestCurrentSessionQuery = (clubSlug: string) =>
  queryOptions({ queryKey: guestBrowseKeys.current(clubSlug), queryFn: () => fetchGuestCurrentSession(clubSlug), ...guestBrowseQueryPolicy });
export const guestUpcomingSessionsQuery = (clubSlug: string, page?: GuestBrowsePage) =>
  queryOptions({ queryKey: guestBrowseKeys.upcoming(clubSlug, page), queryFn: () => fetchGuestUpcomingSessions(clubSlug, page), ...guestBrowseQueryPolicy });
export const guestNoteSessionsQuery = (clubSlug: string, page?: GuestBrowsePage) =>
  queryOptions({ queryKey: guestBrowseKeys.noteSessions(clubSlug, page), queryFn: () => fetchGuestNoteSessions(clubSlug, page), ...guestBrowseQueryPolicy });
export const guestNoteFeedQuery = (clubSlug: string, page?: GuestBrowsePage) =>
  queryOptions({ queryKey: guestBrowseKeys.noteFeed(clubSlug, page), queryFn: () => fetchGuestNoteFeed(clubSlug, page), ...guestBrowseQueryPolicy });
export const guestArchiveQuery = (clubSlug: string, page?: GuestBrowsePage) =>
  queryOptions({ queryKey: guestBrowseKeys.archive(clubSlug, page), queryFn: () => fetchGuestArchive(clubSlug, page), ...guestBrowseQueryPolicy });
export const guestArchiveDetailQuery = (clubSlug: string, sessionId: string) =>
  queryOptions({ queryKey: guestBrowseKeys.archiveDetail(clubSlug, sessionId), queryFn: () => fetchGuestArchiveDetail(clubSlug, sessionId), ...guestBrowseQueryPolicy });
