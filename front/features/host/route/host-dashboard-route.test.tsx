import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import type { HostSessionLedgerItem } from "@/features/host/model/host-session-ledger-model";

const routeMocks = vi.hoisted(() => ({
  hostSessions: { items: [] as Array<Record<string, unknown>>, nextCursor: null as string | null },
  current: { currentSession: null as null | Record<string, unknown> },
  recordAttention: {
    items: [] as HostSessionLedgerItem[],
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
      hostSessions: routeMocks.hostSessions,
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

function attentionItem(overrides: Partial<HostSessionLedgerItem> = {}): HostSessionLedgerItem {
  return {
    sessionId: "closed-1",
    sessionNumber: 12,
    title: "12회차",
    bookTitle: "닫힌 책",
    bookAuthor: "저자",
    bookImageUrl: null,
    date: "2026-04-15",
    startTime: "20:00",
    endTime: "22:00",
    locationLabel: "온라인",
    state: "CLOSED",
    visibility: "MEMBER",
    recordStatus: "INCOMPLETE",
    needsAttention: true,
    hasDraft: false,
    liveRevision: 1,
    draftRevision: null,
    lastModifiedAt: "2026-04-16T00:00:00Z",
    ...overrides,
  };
}

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

  it("shows the total attention count and only the top item, including PUBLISHED", () => {
    routeMocks.recordAttention = {
      items: [
        attentionItem({
          sessionId: "published-1",
          sessionNumber: 11,
          bookTitle: "공개된 책",
          state: "PUBLISHED",
        }),
        attentionItem({
          sessionId: "closed-2",
          sessionNumber: 10,
          bookTitle: "두 번째 책",
        }),
      ],
      nextCursor: "more",
      summary: {
        needsAttentionCount: 4,
        incompletePublishedCount: 1,
        draftCount: 0,
      },
    };
    renderRoute();

    expect(screen.getByText("확인 필요 4건")).toBeInTheDocument();
    expect(screen.getByText("공개된 책")).toBeInTheDocument();
    expect(screen.queryByText("두 번째 책")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "모두 보기" })).toHaveAttribute(
      "href",
      "/app/host/operations",
    );
    expect(screen.queryByTestId("host-meeting-redirect")).not.toBeInTheDocument();
  });

  it("hides 모두 보기 when only one attention row exists", () => {
    routeMocks.recordAttention = {
      items: [attentionItem({ bookTitle: "한 권" })],
      nextCursor: null,
      summary: {
        needsAttentionCount: 1,
        incompletePublishedCount: 0,
        draftCount: 0,
      },
    };
    renderRoute();

    expect(screen.getByText("확인 필요 1건")).toBeInTheDocument();
    expect(screen.getByText("한 권")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "모두 보기" })).not.toBeInTheDocument();
  });
});
