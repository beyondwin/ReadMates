import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router";

const routeMocks = vi.hoisted(() => ({
  hostSessions: { items: [] as Array<Record<string, unknown>>, nextCursor: null as string | null },
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
  useQuery: (query: { testData?: unknown; enabled?: boolean }) => ({
    data: query.enabled === false ? undefined : query.testData,
    isError: false,
  }),
  useQueryClient: () => ({
    removeQueries: vi.fn(),
    invalidateQueries: vi.fn(),
  }),
}));

vi.mock("@/features/host/route/host-session-editor-route", () => ({
  EditHostSessionRoute: () => <div>editor body</div>,
}));

vi.mock("@/src/app/host-route-invalidation", () => ({
  useSessionRecordsChangedInvalidation: () => vi.fn(),
}));

vi.mock("@/src/app/route-continuity", () => ({
  hostDashboardReturnTarget: { href: "/app/host", label: "운영으로" },
  readmatesReturnState: () => ({ href: "/app/host", label: "운영으로" }),
  readReadmatesReturnTarget: () => ({ href: "/app/host", label: "운영으로" }),
}));

vi.mock("@/src/app/router-link", () => ({
  Link: ({ to, children }: { to: string; children: ReactNode }) => <a href={to}>{children}</a>,
}));

vi.mock("@/features/host/queries/host-session-queries", () => ({
  DEFAULT_HOST_SESSION_LIST_LIMIT: 50,
  hostSessionListQuery: () => ({ testData: routeMocks.hostSessions }),
  hostSessionDetailQuery: () => ({ testData: undefined }),
  invalidateHostSessionManualDispatches: vi.fn(),
  resolveHostScheduleDefaultsLoadState: (query: {
    data?: unknown;
    refetch?: () => unknown;
  }) => ({
    defaults: query.data ?? {
      automatic: {
        startTime: "20:00",
        endTime: "22:00",
        locationLabel: "온라인",
        accessScope: "HOST_ONLY",
        suggestedDate: null,
        questionDeadlineOffsetDays: 1,
      },
      previousOnlineMeeting: null,
      hints: [],
    },
    status: "ready",
    warning: null,
    retry: () => {
      void query.refetch?.();
    },
  }),
  useCreateHostSessionMutation: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useSaveHostSessionAccessScopeMutation: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useOpenHostSessionMutation: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  hostSessionScheduleDefaultsQuery: () => ({
    testData: {
      automatic: {
        startTime: "20:00",
        endTime: "22:00",
        locationLabel: "온라인",
        accessScope: "HOST_ONLY",
        suggestedDate: null,
        questionDeadlineOffsetDays: 1,
      },
      previousOnlineMeeting: null,
      hints: [],
    },
  }),
}));

vi.mock("@/features/host/queries/host-session-record-queries", () => ({
  hostSessionRecordLedgerQuery: () => ({ testData: routeMocks.recordAttention }),
}));

import { MeetingRouteElement } from "./meeting-route-element";

beforeEach(() => {
  routeMocks.hostSessions = { items: [], nextCursor: null };
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

describe("MeetingRouteElement", () => {
  it("wraps the editor with the operating ledger chrome for a draft that still has a previous record", () => {
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

    render(
      <MemoryRouter initialEntries={["/app/host/sessions/draft-1"]}>
        <Routes>
          <Route path="/app/host/sessions/:sessionId" element={<MeetingRouteElement />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole("listitem", { name: "모임 전" })).toHaveAttribute("aria-current", "step");
    expect(screen.getByRole("link", { name: "이전 모임 기록 남음" })).toHaveAttribute(
      "href",
      "/app/host/sessions/closed-1",
    );
    expect(screen.getByText("editor body")).toBeInTheDocument();
  });
});
