import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";

const routeMocks = vi.hoisted(() => ({
  hostSessions: { items: [] as Array<Record<string, unknown>>, nextCursor: null as string | null },
  current: { currentSession: null as null | Record<string, unknown> },
  recordAttention: {
    items: [] as Array<Record<string, unknown>>,
    nextCursor: null as string | null,
    summary: {
      needsAttentionCount: 0,
      incompletePublishedCount: 0,
      draftCount: 0,
    },
  },
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: (query: { testData?: unknown }) => ({
    data: query.testData,
    isError: false,
  }),
}));

vi.mock("react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router")>();
  return {
    ...actual,
    useLoaderData: () => ({
      current: routeMocks.current,
      data: {
        rsvpPending: 0,
        checkinMissing: 0,
        publishPending: 0,
        feedbackPending: 0,
      },
      hostSessions: routeMocks.hostSessions,
      notifications: {
        pending: 0,
        failed: 0,
        dead: 0,
        sentLast24h: 0,
        latestFailures: [],
      },
      clubOperations: null,
      recordAttention: routeMocks.recordAttention,
    }),
    useParams: () => ({ clubSlug: "reading-sai" }),
    Navigate: ({ to }: { to: string }) => (
      <div data-testid="host-meeting-redirect">{typeof to === "string" ? to : ""}</div>
    ),
  };
});

vi.mock("@/features/host/queries/host-session-queries", () => ({
  DEFAULT_HOST_SESSION_LIST_LIMIT: 50,
  hostCurrentSessionQuery: () => ({ testData: routeMocks.current }),
  hostSessionListQuery: () => ({ testData: routeMocks.hostSessions }),
}));

vi.mock("@/features/host/queries/host-session-record-queries", () => ({
  hostSessionRecordLedgerQuery: () => ({ testData: routeMocks.recordAttention }),
}));

import { HostDashboardRoute } from "./host-dashboard-route";

function renderRoute() {
  return render(
    <MemoryRouter initialEntries={["/app/host"]}>
      <HostDashboardRoute />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  routeMocks.hostSessions = { items: [], nextCursor: null };
  routeMocks.current = { currentSession: null };
  routeMocks.recordAttention = {
    items: [],
    nextCursor: null,
    summary: {
      needsAttentionCount: 0,
      incompletePublishedCount: 0,
      draftCount: 0,
    },
  };
});

describe("HostDashboardRoute", () => {
  it("asks the host to create the first meeting instead of showing the old dashboard", () => {
    renderRoute();

    expect(screen.getByRole("heading", { name: "아직 열린 모임이 없습니다" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "첫 모임 만들기" })).toHaveAttribute(
      "href",
      "/app/host/sessions/new",
    );
    expect(screen.queryByRole("heading", { name: "모임 운영" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("AI 운영 도구")).not.toBeInTheDocument();
    expect(screen.queryByTestId("host-meeting-redirect")).not.toBeInTheDocument();
  });

  it("opens the active open meeting on the canonical ledger URL", () => {
    routeMocks.hostSessions = {
      items: [{
        sessionId: "open-1",
        state: "OPEN",
        date: "2026-04-15",
        recordStatus: "NOT_STARTED",
      }],
      nextCursor: null,
    };
    renderRoute();

    expect(screen.getByTestId("host-meeting-redirect")).toHaveTextContent("/app/host/sessions/open-1");
    expect(screen.queryByRole("heading", { name: "아직 열린 모임이 없습니다" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("AI 운영 도구")).not.toBeInTheDocument();
  });

  it("prefers the current open meeting when the list page omitted it", () => {
    routeMocks.current = {
      currentSession: {
        sessionId: "open-current",
        date: "2026-04-15",
      },
    };
    renderRoute();

    expect(screen.getByTestId("host-meeting-redirect")).toHaveTextContent(
      "/app/host/sessions/open-current",
    );
  });

  it("opens the nearest draft rather than a closed meeting that still needs a record", () => {
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
    renderRoute();

    expect(screen.getByTestId("host-meeting-redirect")).toHaveTextContent(
      "/app/host/sessions/draft-1",
    );
  });
});
