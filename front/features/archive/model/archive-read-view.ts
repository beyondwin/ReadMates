import type {
  ArchiveQuestionItem,
  ArchiveReviewItem,
  ArchiveSessionItemLike,
  FeedbackDocumentListItem,
  SessionState,
} from "@/features/archive/model/archive-model";
import type { PagedResponse } from "@/shared/model/paging";
import {
  GUEST_READ_SURFACE_CAPABILITIES,
  type ReadSurfaceCapabilities,
} from "@/shared/model/read-surface-capabilities";

export type ArchivePageReadView = {
  sessions: PagedResponse<ArchiveSessionItemLike>;
  questions: PagedResponse<ArchiveQuestionItem>;
  reviews: PagedResponse<ArchiveReviewItem>;
  reports: PagedResponse<FeedbackDocumentListItem>;
  capabilities: ReadSurfaceCapabilities;
};

export type GuestArchiveReadSource = {
  items: Array<{
    sessionId: string;
    sessionNumber: number;
    title: string;
    bookTitle: string;
    bookAuthor: string;
    bookImageUrl: string | null;
    date: string;
    attendance: number;
    total: number;
    state: string;
  }>;
  nextCursor: string | null;
};

function sessionState(value: string): SessionState | null {
  if (value === "DRAFT" || value === "OPEN" || value === "CLOSED" || value === "PUBLISHED") {
    return value;
  }

  return null;
}

function emptyPage<T>(): PagedResponse<T> {
  return { items: [], nextCursor: null };
}

export function guestArchiveReadView(page: GuestArchiveReadSource): ArchivePageReadView {
  return {
    sessions: {
      items: page.items.flatMap((session): ArchiveSessionItemLike[] => {
        const state = sessionState(session.state);

        if (!state) {
          return [];
        }

        return [{
          sessionId: session.sessionId,
          sessionNumber: session.sessionNumber,
          bookTitle: session.bookTitle,
          bookAuthor: session.bookAuthor,
          bookImageUrl: session.bookImageUrl,
          date: session.date,
          attendance: session.attendance,
          total: session.total,
          published: state === "PUBLISHED",
          state,
        }];
      }),
      nextCursor: page.nextCursor,
    },
    questions: emptyPage(),
    reviews: emptyPage(),
    reports: emptyPage(),
    capabilities: GUEST_READ_SURFACE_CAPABILITIES,
  };
}
