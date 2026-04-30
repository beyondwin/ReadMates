import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { NoteFeedItem, NoteSessionItem } from "@/features/archive/api/archive-contracts";
import type { FeedFilter } from "@/features/archive/model/notes-feed-model";
import { notesFeedLoader } from "@/features/archive/route/notes-feed-data";
import NotesPage from "@/src/pages/notes";
import type { PagedResponse } from "@/shared/model/paging";

const { notesFeedPageMock } = vi.hoisted(() => ({
  notesFeedPageMock: vi.fn(),
}));

type NotesFeedProps = {
  items: PagedResponse<NoteFeedItem>;
  noteSessions: PagedResponse<NoteSessionItem>;
  selectedSessionId: string | null;
  selectedSession: NoteSessionItem | null;
  initialFilter?: FeedFilter;
  onFilterChange?: (filter: FeedFilter) => void;
  onLoadMoreItems?: () => Promise<void>;
  onLoadMoreNoteSessions?: () => Promise<void>;
};

vi.mock("@/features/archive/ui/notes-feed-page", () => ({
  default: (props: NotesFeedProps) => {
    notesFeedPageMock(props);
    return <div data-testid="notes-feed">{props.selectedSessionId ?? "none"}</div>;
  },
}));

const noteSessions: NoteSessionItem[] = [
  {
    sessionId: "session-7",
    sessionNumber: 7,
    bookTitle: "물고기는 존재하지 않는다",
    date: "2026-05-20",
    questionCount: 0,
    oneLinerCount: 0,
    longReviewCount: 0,
    highlightCount: 0,
    totalCount: 0,
  },
  {
    sessionId: "session-6",
    sessionNumber: 6,
    bookTitle: "가난한 찰리의 연감",
    date: "2026-04-15",
    questionCount: 4,
    oneLinerCount: 5,
    longReviewCount: 0,
    highlightCount: 3,
    totalCount: 12,
  },
  {
    sessionId: "session-1",
    sessionNumber: 1,
    bookTitle: "팩트풀니스",
    date: "2025-11-26",
    questionCount: 1,
    oneLinerCount: 0,
    longReviewCount: 0,
    highlightCount: 0,
    totalCount: 1,
  },
];

const feedItems: NoteFeedItem[] = [
  {
    sessionId: "session-6",
    sessionNumber: 6,
    bookTitle: "가난한 찰리의 연감",
    date: "2026-04-15",
    authorName: "이멤버5",
    authorShortName: "수",
    kind: "ONE_LINE_REVIEW",
    text: "실패할 곳을 피하는 방식으로 삶을 보는 질문이 좋았다.",
  },
];

const olderFeedItems: NoteFeedItem[] = [
  {
    sessionId: "session-older",
    sessionNumber: 2,
    bookTitle: "오래된 세션",
    date: "2025-12-17",
    authorName: "이멤버5",
    authorShortName: "수",
    kind: "QUESTION",
    text: "첫 페이지 밖 세션의 기록입니다.",
  },
];

function pageOf<T>(items: T[], nextCursor: string | null = null): PagedResponse<T> {
  return { items, nextCursor };
}

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function installRouterRequestShim() {
  const NativeRequest = globalThis.Request;

  vi.stubGlobal(
    "Request",
    class RouterTestRequest extends NativeRequest {
      constructor(input: RequestInfo | URL, init?: RequestInit) {
        super(input, init === undefined ? init : { ...init, signal: undefined });
      }
    },
  );
}

function mockNotesBff({
  sessions = noteSessions,
  feed = feedItems,
  feedsBySession = {},
}: {
  sessions?: NoteSessionItem[];
  feed?: NoteFeedItem[];
  feedsBySession?: Record<string, NoteFeedItem[]>;
} = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = input.toString();

      if (url === "/api/bff/api/auth/me") {
        return Promise.resolve(
          jsonResponse({
            authenticated: true,
            userId: "member-user",
            membershipId: "member-membership",
            clubId: "club-id",
            email: "member@example.com",
            displayName: "이멤버5",
            accountName: "멤버",
            role: "MEMBER",
            membershipStatus: "ACTIVE",
            approvalState: "ACTIVE",
          }),
        );
      }

      if (url === "/api/bff/api/notes/sessions?limit=30") {
        return Promise.resolve(jsonResponse(pageOf(sessions)));
      }

      if (url.startsWith("/api/bff/api/notes/feed?sessionId=")) {
        const requestUrl = new URL(url, "http://readmates.test");
        const sessionId = requestUrl.searchParams.get("sessionId") ?? "";
        return Promise.resolve(jsonResponse(pageOf(feedsBySession[sessionId] ?? feed)));
      }

      return Promise.reject(new Error(`Unexpected BFF path: ${url}`));
    }),
  );
}

function renderNotesPage(sessionId?: string, filter?: string) {
  installRouterRequestShim();
  const params = new URLSearchParams();

  if (sessionId) {
    params.set("sessionId", sessionId);
  }

  if (filter) {
    params.set("filter", filter);
  }

  const search = params.toString();

  const router = createMemoryRouter(
    [
      {
        path: "/app/notes",
        element: <NotesPage />,
        loader: notesFeedLoader,
        hydrateFallbackElement: <div>클럽 노트를 불러오는 중</div>,
      },
    ],
    { initialEntries: [`/app/notes${search ? `?${search}` : ""}`] },
  );

  render(<RouterProvider router={router} />);
}

async function latestNotesProps() {
  await waitFor(() => expect(notesFeedPageMock).toHaveBeenCalled());
  return notesFeedPageMock.mock.calls.at(-1)?.[0] as NotesFeedProps;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  notesFeedPageMock.mockReset();
});

describe("NotesPage", () => {
  it("uses a matching URL sessionId to fetch the feed and pass selected props", async () => {
    mockNotesBff();

    renderNotesPage("session-6");
    const props = await latestNotesProps();

    expect(props).toEqual({
      items: pageOf(feedItems),
      noteSessions: pageOf(noteSessions),
      selectedSessionId: "session-6",
      selectedSession: noteSessions[1],
      initialFilter: "all",
      onFilterChange: expect.any(Function),
      onLoadMoreItems: expect.any(Function),
      onLoadMoreNoteSessions: expect.any(Function),
    });
    expect(screen.getByTestId("notes-feed")).toHaveTextContent("session-6");
    expect(globalThis.fetch).toHaveBeenCalledWith("/api/bff/api/notes/sessions?limit=30", expect.any(Object));
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/bff/api/notes/feed?sessionId=session-6&limit=60",
      expect.any(Object),
    );
  });

  it("falls back missing sessionId to the first session with records", async () => {
    mockNotesBff();

    renderNotesPage();
    const props = await latestNotesProps();

    expect(globalThis.fetch).toHaveBeenCalledWith("/api/bff/api/notes/sessions?limit=30", expect.any(Object));
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/bff/api/notes/feed?sessionId=session-6&limit=60",
      expect.any(Object),
    );
    expect(props).toEqual({
      items: pageOf(feedItems),
      noteSessions: pageOf(noteSessions),
      selectedSessionId: "session-6",
      selectedSession: noteSessions[1],
      initialFilter: "all",
      onFilterChange: expect.any(Function),
      onLoadMoreItems: expect.any(Function),
      onLoadMoreNoteSessions: expect.any(Function),
    });
  });

  it("passes a supported URL note filter through to the feed page", async () => {
    mockNotesBff();

    renderNotesPage("session-6", "highlights");
    const props = await latestNotesProps();

    expect(props.initialFilter).toBe("highlights");
  });

  it("falls back removed note filters to all", async () => {
    mockNotesBff();

    renderNotesPage("session-6", "reviews");
    const props = await latestNotesProps();

    expect(props.initialFilter).toBe("all");
  });

  it("keeps a requested sessionId outside the first sessions page instead of selecting a different session", async () => {
    mockNotesBff({ feedsBySession: { "session-older": olderFeedItems } });

    renderNotesPage("session-older");
    const props = await latestNotesProps();

    expect(globalThis.fetch).toHaveBeenCalledWith("/api/bff/api/notes/sessions?limit=30", expect.any(Object));
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/bff/api/notes/feed?sessionId=session-older&limit=60",
      expect.any(Object),
    );
    expect(props).toEqual({
      items: pageOf(olderFeedItems),
      noteSessions: pageOf(noteSessions),
      selectedSessionId: "session-older",
      selectedSession: {
        sessionId: "session-older",
        sessionNumber: 2,
        bookTitle: "오래된 세션",
        date: "2025-12-17",
        questionCount: 1,
        oneLinerCount: 0,
        longReviewCount: 0,
        highlightCount: 0,
        totalCount: 1,
      },
      initialFilter: "all",
      onFilterChange: expect.any(Function),
      onLoadMoreItems: expect.any(Function),
      onLoadMoreNoteSessions: expect.any(Function),
    });
  });

  it("keeps an empty requested sessionId outside the first sessions page instead of selecting a different session", async () => {
    mockNotesBff({ feedsBySession: { "session-empty": [] } });

    renderNotesPage("session-empty");
    const props = await latestNotesProps();

    expect(globalThis.fetch).toHaveBeenCalledWith("/api/bff/api/notes/sessions?limit=30", expect.any(Object));
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/bff/api/notes/feed?sessionId=session-empty&limit=60",
      expect.any(Object),
    );
    expect(props).toEqual({
      items: pageOf([]),
      noteSessions: pageOf(noteSessions),
      selectedSessionId: "session-empty",
      selectedSession: null,
      initialFilter: "all",
      onFilterChange: expect.any(Function),
      onLoadMoreItems: expect.any(Function),
      onLoadMoreNoteSessions: expect.any(Function),
    });
    expect(screen.getByTestId("notes-feed")).toHaveTextContent("session-empty");
  });

  it("falls back to the first session when every session has zero records", async () => {
    const zeroCountSessions = noteSessions.map((session) => ({
      ...session,
      questionCount: 0,
      oneLinerCount: 0,
      longReviewCount: 0,
      highlightCount: 0,
      totalCount: 0,
    }));

    mockNotesBff({ sessions: zeroCountSessions });

    renderNotesPage();
    const props = await latestNotesProps();

    expect(globalThis.fetch).toHaveBeenCalledWith("/api/bff/api/notes/sessions?limit=30", expect.any(Object));
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/bff/api/notes/feed?sessionId=session-7&limit=60",
      expect.any(Object),
    );
    expect(props).toEqual({
      items: pageOf(feedItems),
      noteSessions: pageOf(zeroCountSessions),
      selectedSessionId: "session-7",
      selectedSession: zeroCountSessions[0],
      initialFilter: "all",
      onFilterChange: expect.any(Function),
      onLoadMoreItems: expect.any(Function),
      onLoadMoreNoteSessions: expect.any(Function),
    });
  });

  it("passes an empty feed without fetching feed items when there are no sessions", async () => {
    mockNotesBff({ sessions: [], feed: feedItems });

    renderNotesPage();
    const props = await latestNotesProps();

    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    expect(globalThis.fetch).toHaveBeenCalledWith("/api/bff/api/notes/sessions?limit=30", expect.any(Object));
    expect(props).toEqual({
      items: pageOf([]),
      noteSessions: pageOf([]),
      selectedSessionId: null,
      selectedSession: null,
      initialFilter: "all",
      onFilterChange: expect.any(Function),
      onLoadMoreItems: expect.any(Function),
      onLoadMoreNoteSessions: expect.any(Function),
    });
  });
});
