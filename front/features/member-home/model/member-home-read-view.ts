import {
  guestCurrentSessionReadPage,
  memberCurrentSessionReadPage,
  type CurrentSessionReadPageData,
  type GuestCurrentSessionReadSource,
} from "@/shared/model/current-session-read-view";
import type { MemberHomeView } from "@/features/member-home/model/member-home-view-model";
import type { NoteFeedItem } from "@/shared/model/notes-feed-model";
import type { PagedResponse } from "@/shared/model/paging";
import {
  GUEST_READ_SURFACE_CAPABILITIES,
  readSurfaceCapabilitiesForAuth,
  type ReadSurfaceCapabilities,
} from "@/shared/model/read-surface-capabilities";

export type MemberHomeReadView = {
  displayName: string | null;
  isHost: boolean;
  current: CurrentSessionReadPageData;
  noteFeedItems: NoteFeedItem[];
  upcomingSessions: Array<{
    sessionId: string;
    sessionNumber: number;
    title: string;
    bookTitle: string;
    bookAuthor: string;
    bookImageUrl: string | null;
    date: string;
    startTime: string;
    endTime: string;
    locationLabel: string | null;
  }>;
  capabilities: ReadSurfaceCapabilities;
};

export type MemberHomeWidgetKey = "current" | "upcoming" | "recentNotes";
export type MemberHomeWidgetErrors = Partial<
  Record<MemberHomeWidgetKey, { status?: number; retryAfterSeconds?: number }>
>;
export type MemberHomeRetryHandlers = Partial<Record<MemberHomeWidgetKey, () => Promise<void>>>;

export type GuestMemberHomeReadSource = {
  current: GuestCurrentSessionReadSource;
  upcoming: PagedResponse<{
    sessionId: string;
    sessionNumber: number;
    title: string;
    bookTitle: string;
    bookAuthor: string;
    bookImageUrl: string | null;
    date: string;
    startTime: string;
    endTime: string;
  }>;
  recentNotes: PagedResponse<NoteFeedItem>;
  widgetErrors?: MemberHomeWidgetErrors;
};

export function memberHomeReadViewFromRouteData(routeData: MemberHomeView): MemberHomeReadView {
  const capabilities = readSurfaceCapabilitiesForAuth(routeData.auth);

  return {
    displayName: routeData.auth.displayName,
    isHost: routeData.auth.role === "HOST",
    current: memberCurrentSessionReadPage(routeData.current, capabilities),
    noteFeedItems: routeData.noteFeedItems,
    upcomingSessions: routeData.upcomingSessions.map((session) => ({
      sessionId: session.sessionId,
      sessionNumber: session.sessionNumber,
      title: session.title,
      bookTitle: session.bookTitle,
      bookAuthor: session.bookAuthor,
      bookImageUrl: session.bookImageUrl,
      date: session.date,
      startTime: session.startTime,
      endTime: session.endTime,
      locationLabel: session.locationLabel,
    })),
    capabilities,
  };
}

export function guestMemberHomeReadView(guestData: GuestMemberHomeReadSource): MemberHomeReadView {
  return {
    displayName: null,
    isHost: false,
    current: guestCurrentSessionReadPage(guestData.current),
    noteFeedItems: guestData.recentNotes.items.map((item) => ({
      sessionId: item.sessionId,
      sessionNumber: item.sessionNumber,
      bookTitle: item.bookTitle,
      date: item.date,
      authorName: item.authorName,
      authorShortName: item.authorShortName,
      avatarKey: item.avatarKey,
      kind: item.kind,
      text: item.text,
    })),
    upcomingSessions: guestData.upcoming.items.map((session) => ({
      sessionId: session.sessionId,
      sessionNumber: session.sessionNumber,
      title: session.title,
      bookTitle: session.bookTitle,
      bookAuthor: session.bookAuthor,
      bookImageUrl: session.bookImageUrl,
      date: session.date,
      startTime: session.startTime,
      endTime: session.endTime,
      locationLabel: null,
    })),
    capabilities: GUEST_READ_SURFACE_CAPABILITIES,
  };
}
