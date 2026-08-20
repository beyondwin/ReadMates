import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router";

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
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: (query: { testData?: unknown }) => ({
    data: query.testData,
    isError: false,
  }),
}));

vi.mock("@/features/host/queries/host-session-queries", () => ({
  DEFAULT_HOST_SESSION_LIST_LIMIT: 50,
  hostSessionListQuery: () => ({ testData: routeMocks.hostSessions }),
  hostSessionDetailQuery: (sessionId: string) => ({ testData: routeMocks.details[sessionId] }),
}));

vi.mock("@/features/host/queries/host-session-record-queries", () => ({
  hostSessionRecordLedgerQuery: () => ({ testData: routeMocks.recordAttention }),
}));

import { HostMeetingLedgerRoute } from "./host-meeting-ledger-route";

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
});
