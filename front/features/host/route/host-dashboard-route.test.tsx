import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import type { HostSessionLedgerItem } from "@/features/host/model/host-session-ledger-model";
import type { HostClubOperationsSnapshot } from "@/shared/model/club-operations";
import { findNestedLiveRegions } from "@/shared/testing/accessibility-checks";

const routeMocks = vi.hoisted(() => ({
  hostSessions: { items: [] as Array<Record<string, unknown>>, nextCursor: null as string | null },
  current: { currentSession: null as null | Record<string, unknown> },
  attentionError: false,
  operationsError: false,
  notificationsError: false,
  refetchAttention: vi.fn(),
  refetchOperations: vi.fn(),
  refetchNotifications: vi.fn(),
  recordAttention: {
    items: [] as HostSessionLedgerItem[],
    nextCursor: null as string | null,
    summary: {
      needsAttentionCount: 0,
      incompletePublishedCount: 0,
      draftCount: 0,
    },
  },
  operations: null as HostClubOperationsSnapshot | null,
  notifications: {
    pending: 0,
    failed: 0,
    dead: 0,
    sentLast24h: 0,
    latestFailures: [] as Array<Record<string, unknown>>,
  },
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: (query: { testData?: unknown; source?: string }) => {
    if (query.source === "operations") {
      return {
        data: routeMocks.operationsError ? undefined : query.testData,
        isError: routeMocks.operationsError,
        isFetching: false,
        refetch: routeMocks.refetchOperations,
      };
    }
    if (query.source === "notifications") {
      return {
        data: routeMocks.notificationsError ? undefined : query.testData,
        isError: routeMocks.notificationsError,
        isFetching: false,
        refetch: routeMocks.refetchNotifications,
      };
    }
    return {
      data: routeMocks.attentionError ? undefined : query.testData,
      isError: routeMocks.attentionError,
      isFetching: false,
      refetch: routeMocks.refetchAttention,
    };
  },
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
  hostSessionRecordLedgerQuery: () => ({ testData: routeMocks.recordAttention, source: "attention" }),
}));

vi.mock("@/features/host/queries/host-club-operations-queries", () => ({
  hostClubOperationsQuery: () => ({ testData: routeMocks.operations, source: "operations" }),
}));

vi.mock("@/features/host/queries/host-notification-queries", () => ({
  hostNotificationHealthQuery: () => ({ testData: routeMocks.notifications, source: "notifications" }),
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

function operationsSnapshot(
  overrides: Partial<HostClubOperationsSnapshot> = {},
): HostClubOperationsSnapshot {
  return {
    schema: "host.club_operations_snapshot.v1",
    generatedAt: "2026-05-31T00:00:00Z",
    club: { clubId: "club-1", slug: "reading-sai", name: "읽는사이" },
    readiness: { state: "READY", blockingReasons: [], nextAction: null },
    sessionProgress: {
      upcomingCount: 1,
      currentOpenCount: 0,
      closedCount: 4,
      publishedRecordCount: 3,
      incompleteRecordCount: 0,
    },
    aiUsage: {
      activeJobs: 0,
      failedRecentJobs: 0,
      staleCandidates: 0,
      costEstimateUsd: "0.5000",
      state: "READY",
      priorFailedJobs7d: 0,
    },
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
  routeMocks.operationsError = false;
  routeMocks.notificationsError = false;
  routeMocks.refetchAttention.mockReset();
  routeMocks.refetchOperations.mockReset();
  routeMocks.refetchNotifications.mockReset();
  routeMocks.recordAttention = {
    items: [],
    nextCursor: null,
    summary: {
      needsAttentionCount: 0,
      incompletePublishedCount: 0,
      draftCount: 0,
    },
  };
  routeMocks.operations = null;
  routeMocks.notifications = {
    pending: 0,
    failed: 0,
    dead: 0,
    sentLast24h: 0,
    latestFailures: [],
  };
});

describe("HostDashboardRoute", () => {
  it("asks the host to create the first meeting on the today triage empty hero", () => {
    renderRoute();

    expect(screen.getByRole("heading", { level: 1, name: "오늘" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "아직 열린 모임이 없습니다" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "첫 모임 만들기" })).toHaveAttribute(
      "href",
      "/app/host/sessions/new",
    );
    expect(screen.getByText(/오늘 처리할 일이 없습니다 · 마지막 확인/)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "모임 운영" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("host-meeting-redirect")).not.toBeInTheDocument();
  });

  it("shows attention records in the resolve queue and quiet overflow when capped", () => {
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

    const queue = screen.getByRole("region", { name: "처리할 일" });
    expect(within(queue).getByText("공개된 책")).toBeInTheDocument();
    expect(within(queue).getByText("두 번째 책")).toBeInTheDocument();
    expect(within(queue).getAllByRole("link", { name: "기록 마저 쓰기" })).toHaveLength(2);
    expect(screen.getByText(/처리할 일 2건/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "모두 보기" })).not.toBeInTheDocument();
  });

  it("omits notification and readiness rows when those widgets fail, keeps attention siblings, and retries", async () => {
    const user = userEvent.setup();
    routeMocks.recordAttention = {
      items: [attentionItem({ bookTitle: "공개된 책", state: "PUBLISHED" })],
      nextCursor: null,
      summary: {
        needsAttentionCount: 1,
        incompletePublishedCount: 1,
        draftCount: 0,
      },
    };
    routeMocks.notifications = {
      pending: 0,
      failed: 3,
      dead: 1,
      sentLast24h: 0,
      latestFailures: [],
    };
    routeMocks.operations = operationsSnapshot({
      readiness: {
        state: "BLOCKED",
        blockingReasons: ["다음 모임 없음"],
        nextAction: "CREATE_SESSION",
      },
    });
    routeMocks.notificationsError = true;
    routeMocks.operationsError = true;
    renderRoute();

    const queue = screen.getByRole("region", { name: "처리할 일" });
    expect(within(queue).getByText("공개된 책")).toBeInTheDocument();
    expect(within(queue).queryByText("알림 발송")).not.toBeInTheDocument();
    expect(within(queue).queryByText("클럽 준비")).not.toBeInTheDocument();
    expect(within(queue).getByRole("alert")).toHaveTextContent("처리할 일 목록을 불러오지 못했습니다.");

    await user.click(within(queue).getByRole("button", { name: "다시 시도" }));
    expect(routeMocks.refetchOperations).toHaveBeenCalled();
    expect(routeMocks.refetchNotifications).toHaveBeenCalled();
  });

  it("shows a retryable queue error when attention fails on empty home", async () => {
    const user = userEvent.setup();
    routeMocks.attentionError = true;
    renderRoute();

    expect(screen.getByRole("heading", { name: "아직 열린 모임이 없습니다" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("처리할 일 목록을 불러오지 못했습니다.");
    expect(screen.queryByText(/오늘 처리할 일이 없습니다/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(routeMocks.refetchAttention).toHaveBeenCalled();
  });

  it("imports today and editorial ledger stylesheets from the host route entry", () => {
    const routeSource = readFileSync(path.resolve("features/host/route/host-dashboard-route.tsx"), "utf8");
    const todayCss = path.resolve("features/host/ui/today/host-today.css");
    const ledgerCss = path.resolve("features/host/ui/host-editorial-ledger.css");

    expect(routeSource).toContain("host-today.css");
    expect(routeSource).toContain("host-editorial-ledger.css");
    expect(existsSync(todayCss)).toBe(true);
    expect(existsSync(ledgerCss)).toBe(true);
    const css = readFileSync(ledgerCss, "utf8");
    expect(css).toMatch(/\.rm-host-editorial-ledger__action[\s\S]*min-height:\s*44px/);
    expect(css).toContain("var(--paper");
    expect(css).toContain("var(--ink");
    expect(css).toContain("prefers-reduced-motion");
  });

  it("keeps empty home on one heading, one create action, and editorial state grammar", () => {
    renderRoute();

    const root = document.querySelector(".rm-host-today") as HTMLElement | null;
    expect(root).not.toBeNull();
    expect(within(root!).getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(within(root!).getByRole("heading", { level: 1, name: "오늘" })).toBeInTheDocument();
    expect(root!.querySelector("[role='tablist']")).toBeNull();
    expect(root!.querySelectorAll("[style]")).toHaveLength(0);
    expect(findNestedLiveRegions(root!)).toEqual([]);

    const create = within(root!).getByRole("link", { name: "첫 모임 만들기" });
    expect(create).toHaveClass("rm-host-editorial-ledger__action");
    expect(within(root!).getAllByRole("link", { name: "첫 모임 만들기" })).toHaveLength(1);
  });

  it("reuses ledger next-meeting identity and primary open action before the queue", () => {
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

    const root = document.querySelector(".rm-host-today") as HTMLElement;
    const identity = root.querySelector(".rm-host-editorial-ledger__identity");
    const queue = within(root).getByRole("region", { name: "처리할 일" });
    expect(identity).toHaveTextContent("2026.04.15 · 준비 중");
    expect(identity?.textContent).not.toMatch(/진행 중|공개됨|종료/);
    expect(within(root).getAllByRole("link", { name: "지금 다루는 모임 열기" })).toHaveLength(1);
    expect(within(root).getByRole("link", { name: "지금 다루는 모임 열기" })).toHaveClass(
      "rm-host-editorial-ledger__action",
    );
    expect(within(root).getByRole("link", { name: "모임 목록" })).toBeInTheDocument();
    expect(queue).toHaveTextContent("공개된 책");
  });
});
