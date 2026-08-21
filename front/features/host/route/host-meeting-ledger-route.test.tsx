import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";

const routeMocks = vi.hoisted(() => ({
  hostSessions: { items: [] as Array<Record<string, unknown>>, nextCursor: null as string | null },
  details: {} as Record<string, Record<string, unknown>>,
  recordAttention: {
    items: [] as Array<Record<string, unknown>>,
    nextCursor: null as string | null,
    summary: {
      needsAttentionCount: 0,
      incompletePublishedCount: 0,
      draftCount: 0,
    },
  },
  createSession: vi.fn(),
  saveAccessScope: vi.fn(),
  openSession: vi.fn(),
  scheduleDefaults: {
    automatic: {
      startTime: "20:00",
      endTime: "22:00",
      locationLabel: "온라인",
      accessScope: "HOST_ONLY" as const,
      suggestedDate: null as string | null,
      questionDeadlineOffsetDays: 1,
    },
    previousOnlineMeeting: null,
    hints: [] as string[],
  },
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: (query: { testData?: unknown }) => ({
    data: query.testData,
    isError: false,
    isPending: false,
    refetch: vi.fn(),
  }),
  useQueryClient: () => ({
    removeQueries: vi.fn(),
    invalidateQueries: vi.fn(),
  }),
}));

vi.mock("@/features/host/queries/host-session-queries", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/host/queries/host-session-queries")>()),
  DEFAULT_HOST_SESSION_LIST_LIMIT: 50,
  hostSessionListQuery: () => ({ testData: routeMocks.hostSessions }),
  hostSessionDetailQuery: (sessionId: string) => ({ testData: routeMocks.details[sessionId] }),
  invalidateHostSessionManualDispatches: vi.fn(),
  useCreateHostSessionMutation: () => ({
    mutateAsync: routeMocks.createSession,
    isPending: false,
  }),
  useSaveHostSessionAccessScopeMutation: () => ({
    mutateAsync: routeMocks.saveAccessScope,
    isPending: false,
  }),
  useOpenHostSessionMutation: () => ({
    mutateAsync: routeMocks.openSession,
    isPending: false,
  }),
  hostSessionScheduleDefaultsQuery: () => ({ testData: routeMocks.scheduleDefaults }),
}));

vi.mock("@/features/host/queries/host-session-record-queries", () => ({
  hostSessionRecordLedgerQuery: () => ({ testData: routeMocks.recordAttention }),
}));

vi.mock("@/features/host/route/host-notification-composer-controller", () => ({
  HostNotificationComposerController: ({
    request,
    onClose,
  }: {
    request: { sessionId: string; eventType: string; contentRevision: string; origin: string } | null;
    onClose: () => void;
  }) => (request ? (
    <div role="dialog" aria-label="알림 보내기">
      <p>{request.origin}</p>
      <p>{request.sessionId}</p>
      <p>{request.eventType}</p>
      <button type="button" onClick={onClose}>이번에는 보내지 않기</button>
    </div>
  ) : null),
}));

import { HostMeetingLedgerRoute } from "./host-meeting-ledger-route";

function PathProbe() {
  const { pathname } = useLocation();
  return <div data-testid="meeting-path">{pathname}</div>;
}

function renderMeetingSurface(sessionId: string) {
  return render(
    <MemoryRouter initialEntries={[`/app/host/sessions/${sessionId}`]}>
      <Routes>
        <Route
          path="/app/host/sessions/:sessionId"
          element={(
            <HostMeetingLedgerRoute
              LinkComponent={({ to, children }) => (
                <a href={typeof to === "string" ? to : ""}>{children}</a>
              )}
            >
              <div>editor body</div>
              <PathProbe />
            </HostMeetingLedgerRoute>
          )}
        />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  routeMocks.hostSessions = { items: [], nextCursor: null };
  routeMocks.details = {};
  routeMocks.recordAttention = {
    items: [],
    nextCursor: null,
    summary: {
      needsAttentionCount: 0,
      incompletePublishedCount: 0,
      draftCount: 0,
    },
  };
  routeMocks.createSession.mockReset();
  routeMocks.saveAccessScope.mockReset();
  routeMocks.openSession.mockReset();
  routeMocks.createSession.mockResolvedValue(
    new Response(JSON.stringify({ sessionId: "draft-new" }), { status: 201 }),
  );
  routeMocks.saveAccessScope.mockResolvedValue({ session: {}, composer: null });
});

describe("HostMeetingLedgerRoute", () => {
  it("marks 진행 중 on the live open meeting surface and keeps the editor", () => {
    routeMocks.hostSessions = {
      items: [{
        sessionId: "open-1",
        state: "OPEN",
        date: "2026-04-15",
        recordStatus: "NOT_STARTED",
      }],
      nextCursor: null,
    };
    renderMeetingSurface("open-1");

    expect(screen.getByRole("listitem", { name: "진행 중" })).toHaveAttribute("aria-current", "step");
    expect(screen.getByRole("listitem", { name: "모임 전" })).not.toHaveAttribute("aria-current");
    expect(screen.getByText("editor body")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "이전 모임 기록 남음" })).not.toBeInTheDocument();
  });

  it("shows 이전 모임 기록 남음 on the draft meeting after home would resolve that draft", () => {
    routeMocks.hostSessions = {
      items: [
        {
          sessionId: "draft-1",
          state: "DRAFT",
          date: "2026-06-11",
          recordStatus: "NOT_STARTED",
        },
        {
          sessionId: "closed-1",
          state: "CLOSED",
          date: "2026-04-15",
          recordStatus: "NOT_STARTED",
        },
      ],
      nextCursor: null,
    };
    renderMeetingSurface("draft-1");

    expect(screen.getByRole("listitem", { name: "모임 전" })).toHaveAttribute("aria-current", "step");
    expect(screen.getByRole("link", { name: "이전 모임 기록 남음" })).toHaveAttribute(
      "href",
      "/app/host/sessions/closed-1",
    );
    expect(screen.getByText("editor body")).toBeInTheDocument();
  });

  it("uses the needs-attention ledger for 이전 모임 기록 남음 when the list page omitted the closed meeting", () => {
    routeMocks.hostSessions = {
      items: [{
        sessionId: "draft-1",
        state: "DRAFT",
        date: "2026-06-11",
        recordStatus: "NOT_STARTED",
      }],
      nextCursor: null,
    };
    routeMocks.recordAttention = {
      items: [{
        sessionId: "closed-1",
        state: "CLOSED",
        date: "2026-04-15",
        recordStatus: "NOT_STARTED",
      }],
      nextCursor: null,
      summary: {
        needsAttentionCount: 1,
        incompletePublishedCount: 0,
        draftCount: 0,
      },
    };
    renderMeetingSurface("draft-1");

    expect(screen.getByRole("listitem", { name: "모임 전" })).toHaveAttribute("aria-current", "step");
    expect(screen.getByRole("link", { name: "이전 모임 기록 남음" })).toHaveAttribute(
      "href",
      "/app/host/sessions/closed-1",
    );
  });

  it("keeps the closed meeting in 모임 후 when opened from the previous-record link", () => {
    routeMocks.hostSessions = {
      items: [
        {
          sessionId: "draft-1",
          state: "DRAFT",
          date: "2026-06-11",
          recordStatus: "NOT_STARTED",
        },
        {
          sessionId: "closed-1",
          state: "CLOSED",
          date: "2026-04-15",
          recordStatus: "NOT_STARTED",
        },
      ],
      nextCursor: null,
    };
    renderMeetingSurface("closed-1");

    expect(screen.getByRole("listitem", { name: "모임 후" })).toHaveAttribute("aria-current", "step");
    expect(screen.queryByRole("link", { name: "이전 모임 기록 남음" })).not.toBeInTheDocument();
    expect(screen.getByText("editor body")).toBeInTheDocument();
  });

  it("shows upcoming drafts during an open meeting and saves member visibility", async () => {
    const user = userEvent.setup();
    routeMocks.hostSessions = {
      items: [
        {
          sessionId: "open-1",
          state: "OPEN",
          date: "2026-04-15",
          bookTitle: "Now",
          accessScope: "GUEST_READABLE",
          recordStatus: "NOT_STARTED",
        },
        {
          sessionId: "draft-1",
          state: "DRAFT",
          date: "2026-06-11",
          bookTitle: "다음 책",
          accessScope: "HOST_ONLY",
          recordStatus: "NOT_STARTED",
        },
      ],
      nextCursor: null,
    };
    renderMeetingSurface("open-1");

    expect(screen.getByRole("heading", { name: "다음에 읽을 책" })).toBeInTheDocument();
    expect(screen.getByText("다음 책")).toBeInTheDocument();
    expect(screen.queryByText("GUEST_READABLE")).not.toBeInTheDocument();
    expect(screen.queryByText("HOST_ONLY")).not.toBeInTheDocument();

    await user.click(screen.getByRole("switch", { name: "다음 책 게스트와 멤버에게 보이기" }));

    expect(routeMocks.saveAccessScope).toHaveBeenCalledWith({
      sessionId: "draft-1",
      request: { accessScope: "GUEST_READABLE" },
    });
    expect(screen.queryByRole("dialog", { name: "알림 보내기" })).not.toBeInTheDocument();
  });

  it("opens the first-publication composer when switching a next book to member-visible", async () => {
    const user = userEvent.setup();
    routeMocks.saveAccessScope.mockResolvedValue({
      session: {},
      composer: {
        sessionId: "draft-1",
        eventType: "NEXT_BOOK_PUBLISHED",
        contentRevision: "rev-switch",
      },
    });
    routeMocks.hostSessions = {
      items: [
        {
          sessionId: "open-1",
          state: "OPEN",
          date: "2026-04-15",
          bookTitle: "Now",
          accessScope: "GUEST_READABLE",
          recordStatus: "NOT_STARTED",
        },
        {
          sessionId: "draft-1",
          state: "DRAFT",
          date: "2026-06-11",
          bookTitle: "다음 책",
          accessScope: "HOST_ONLY",
          recordStatus: "NOT_STARTED",
        },
      ],
      nextCursor: null,
    };
    renderMeetingSurface("open-1");

    await user.click(screen.getByRole("switch", { name: "다음 책 게스트와 멤버에게 보이기" }));

    const dialog = screen.getByRole("dialog", { name: "알림 보내기" });
    expect(dialog).toHaveTextContent("FIRST_PUBLICATION");
    expect(dialog).toHaveTextContent("draft-1");
    expect(dialog).toHaveTextContent("NEXT_BOOK_PUBLISHED");
  });

  it("adds another meeting without opening it or leaving the current URL", async () => {
    const user = userEvent.setup();
    routeMocks.hostSessions = {
      items: [{
        sessionId: "closed-1",
        state: "CLOSED",
        date: "2026-04-15",
        bookTitle: "지난 책",
        accessScope: "GUEST_READABLE",
        recordStatus: "NOT_STARTED",
      }],
      nextCursor: null,
    };
    renderMeetingSurface("closed-1");

    await user.click(screen.getByRole("button", { name: "모임 하나 더" }));
    await user.type(screen.getByLabelText("책 제목"), "다음 책");
    await user.type(screen.getByLabelText("저자"), "다음 저자");
    await user.type(screen.getByLabelText("모임 날짜"), "2026-06-11");
    await user.click(screen.getByRole("button", { name: "목록에 넣기" }));

    expect(routeMocks.createSession).toHaveBeenCalledWith(expect.objectContaining({
      title: "다음 책",
      bookTitle: "다음 책",
      bookAuthor: "다음 저자",
      date: "2026-06-11",
      startTime: "20:00",
      endTime: "22:00",
      locationLabel: "온라인",
      accessScope: "HOST_ONLY",
    }));
    expect(routeMocks.openSession).not.toHaveBeenCalled();
    expect(routeMocks.saveAccessScope).not.toHaveBeenCalled();
    expect(screen.getByTestId("meeting-path")).toHaveTextContent("/app/host/sessions/closed-1");
    expect(screen.getByText("editor body")).toBeInTheDocument();
  });

  it("creates a visible next book with accessScope on one POST and stays on this meeting", async () => {
    const user = userEvent.setup();
    routeMocks.hostSessions = {
      items: [{
        sessionId: "open-1",
        state: "OPEN",
        date: "2026-04-15",
        bookTitle: "Now",
        accessScope: "GUEST_READABLE",
        recordStatus: "NOT_STARTED",
      }],
      nextCursor: null,
    };
    renderMeetingSurface("open-1");

    await user.click(screen.getByRole("button", { name: "모임 하나 더" }));
    await user.type(screen.getByLabelText("책 제목"), "다음 책");
    await user.type(screen.getByLabelText("저자"), "다음 저자");
    await user.type(screen.getByLabelText("모임 날짜"), "2026-06-11");
    await user.click(screen.getByRole("switch", { name: "새 모임 게스트와 멤버에게 보이기" }));
    await user.click(screen.getByRole("button", { name: "목록에 넣기" }));

    expect(routeMocks.createSession).toHaveBeenCalledWith(expect.objectContaining({
      title: "다음 책",
      bookTitle: "다음 책",
      accessScope: "GUEST_READABLE",
    }));
    expect(routeMocks.saveAccessScope).not.toHaveBeenCalled();
    expect(routeMocks.openSession).not.toHaveBeenCalled();
    expect(screen.getByTestId("meeting-path")).toHaveTextContent("/app/host/sessions/open-1");
    expect(screen.queryByRole("dialog", { name: "알림 보내기" })).not.toBeInTheDocument();
  });

  it("opens the first-publication composer when listing a visible next book", async () => {
    const user = userEvent.setup();
    routeMocks.createSession.mockResolvedValue(
      new Response(JSON.stringify({
        sessionId: "draft-new",
        composer: {
          sessionId: "draft-new",
          eventType: "NEXT_BOOK_PUBLISHED",
          contentRevision: "rev-create",
        },
      }), { status: 201 }),
    );
    routeMocks.hostSessions = {
      items: [{
        sessionId: "open-1",
        state: "OPEN",
        date: "2026-04-15",
        bookTitle: "Now",
        accessScope: "GUEST_READABLE",
        recordStatus: "NOT_STARTED",
      }],
      nextCursor: null,
    };
    renderMeetingSurface("open-1");

    await user.click(screen.getByRole("button", { name: "모임 하나 더" }));
    await user.type(screen.getByLabelText("책 제목"), "다음 책");
    await user.type(screen.getByLabelText("저자"), "다음 저자");
    await user.type(screen.getByLabelText("모임 날짜"), "2026-06-11");
    await user.click(screen.getByRole("switch", { name: "새 모임 게스트와 멤버에게 보이기" }));
    await user.click(screen.getByRole("button", { name: "목록에 넣기" }));

    expect(routeMocks.createSession).toHaveBeenCalledWith(expect.objectContaining({
      accessScope: "GUEST_READABLE",
    }));
    expect(routeMocks.saveAccessScope).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog", { name: "알림 보내기" });
    expect(dialog).toHaveTextContent("FIRST_PUBLICATION");
    expect(dialog).toHaveTextContent("draft-new");
    expect(dialog).toHaveTextContent("NEXT_BOOK_PUBLISHED");
    expect(screen.getByTestId("meeting-path")).toHaveTextContent("/app/host/sessions/open-1");
  });

  it("does not show the upcoming list on 모임 전", () => {
    routeMocks.hostSessions = {
      items: [{
        sessionId: "draft-1",
        state: "DRAFT",
        date: "2026-06-11",
        bookTitle: "준비 중",
        accessScope: "HOST_ONLY",
        recordStatus: "NOT_STARTED",
      }],
      nextCursor: null,
    };
    renderMeetingSurface("draft-1");

    expect(screen.queryByRole("heading", { name: "다음에 읽을 책" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "모임 하나 더" })).not.toBeInTheDocument();
  });
});
