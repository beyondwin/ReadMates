import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import type { HostSessionLedgerItem } from "@/features/host/model/host-session-ledger-model";
import { findNestedLiveRegions } from "@/shared/testing/accessibility-checks";

const routeMocks = vi.hoisted(() => ({
  hostSessions: { items: [] as Array<Record<string, unknown>>, nextCursor: null as string | null },
  current: { currentSession: null as null | Record<string, unknown> },
  attentionError: false,
  refetchAttention: vi.fn(),
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
    data: routeMocks.attentionError ? undefined : query.testData,
    isError: routeMocks.attentionError,
    isFetching: false,
    refetch: routeMocks.refetchAttention,
  }),
}));

vi.mock("react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router")>();
  return {
    ...actual,
    useLoaderData: () => ({
      current: routeMocks.current,
      hostSessions: routeMocks.hostSessions,
      recordAttention: routeMocks.attentionError ? null : routeMocks.recordAttention,
      attentionError: routeMocks.attentionError,
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
    title: "No.12",
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
  routeMocks.attentionError = false;
  routeMocks.refetchAttention.mockReset();
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

  it("shows a retryable attention error on empty home instead of a silent empty list", async () => {
    const user = userEvent.setup();
    routeMocks.attentionError = true;
    renderRoute();

    expect(screen.getByRole("heading", { name: "아직 열린 모임이 없습니다" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("확인 필요 목록을 불러오지 못했습니다.");
    expect(screen.queryByText("확인 필요 0건")).not.toBeInTheDocument();
    expect(screen.queryByText("확인 필요한 모임 기록이 없습니다.")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(routeMocks.refetchAttention).toHaveBeenCalled();
  });

  it("imports the scoped editorial ledger stylesheet from the host route entry", () => {
    const routeSource = readFileSync(path.resolve("features/host/route/host-dashboard-route.tsx"), "utf8");
    const cssPath = path.resolve("features/host/ui/host-editorial-ledger.css");

    expect(routeSource).toContain("host-editorial-ledger.css");
    expect(existsSync(cssPath)).toBe(true);
    const css = readFileSync(cssPath, "utf8");
    expect(css).toMatch(/\.rm-host-editorial-ledger__action[\s\S]*min-height:\s*44px/);
    expect(css).toContain("var(--paper");
    expect(css).toContain("var(--ink");
    expect(css).toContain("var(--accent");
    expect(css).toContain("var(--warning");
    expect(css).toContain("var(--stale");
    expect(css).toContain("prefers-reduced-motion");
    expect(css).not.toMatch(/backdrop-filter|box-shadow:\s*0 0 \d+px|linear-gradient/);
  });

  it("keeps empty home on one heading, one create action, and editorial state grammar", () => {
    renderRoute();

    const root = document.querySelector(".rm-host-editorial-ledger") as HTMLElement | null;
    expect(root).not.toBeNull();
    expect(within(root!).getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(within(root!).getByRole("heading", { level: 1, name: "오늘" })).toBeInTheDocument();
    expect(root!.querySelector("[role='tablist']")).toBeNull();
    expect(root!.querySelectorAll("[style]")).toHaveLength(0);
    expect(findNestedLiveRegions(root!)).toEqual([]);

    const create = within(root!).getByRole("link", { name: "첫 모임 만들기" });
    expect(create).toHaveClass("rm-host-editorial-ledger__action");
    expect(within(root!).getAllByRole("link", { name: "첫 모임 만들기" })).toHaveLength(1);
    expect(root!.querySelector(".rm-host-editorial-ledger__state")).toHaveTextContent(
      "아직 열린 모임이 없습니다",
    );
  });

  it("shows next-meeting identity and one primary action before attention evidence", () => {
    routeMocks.hostSessions = {
      items: [{ sessionId: "open-1", state: "OPEN", date: "2026-04-15" }],
      nextCursor: null,
    };
    routeMocks.recordAttention = {
      items: [attentionItem({ bookTitle: "공개된 책", state: "PUBLISHED" })],
      nextCursor: null,
      summary: {
        needsAttentionCount: 1,
        incompletePublishedCount: 1,
        draftCount: 0,
      },
    };
    renderRoute();

    const root = document.querySelector(".rm-host-editorial-ledger") as HTMLElement;
    const identity = root.querySelector(".rm-host-editorial-ledger__identity");
    const attention = within(root).getByRole("region", { name: "확인 필요" });
    expect(identity).toHaveTextContent("2026.04.15 · 준비 중");
    expect(identity?.textContent).not.toMatch(/진행 중|공개됨|종료/);
    expect(within(root).getAllByRole("link", { name: "지금 다루는 모임 열기" })).toHaveLength(1);
    expect(within(root).getByRole("link", { name: "지금 다루는 모임 열기" })).toHaveClass(
      "rm-host-editorial-ledger__action",
    );
    expect(identity!.compareDocumentPosition(attention) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(root.querySelector("[role='tablist']")).toBeNull();
    expect(root.querySelectorAll("[style]")).toHaveLength(0);
  });

  it("marks a retryable attention failure as editorial state grammar", () => {
    routeMocks.attentionError = true;
    renderRoute();

    const alert = screen.getByRole("alert");
    expect(alert).toHaveClass("rm-host-editorial-ledger__state");
    expect(alert).toHaveTextContent("확인 필요 목록을 불러오지 못했습니다.");
    expect(screen.getByRole("button", { name: "다시 시도" }).closest(".rm-host-editorial-ledger")).not.toBeNull();
  });
});
