import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryRouter, RouterProvider, useLocation, type RouteObject } from "react-router";
import type {
  HostSessionClosingStatusResponse,
  HostSessionDetailResponse,
} from "@/features/host/api/host-contracts";
import type { HostWorkboxPage } from "@/features/host/api/host-workbox-contracts";
import { mergeCoherentWorkboxPages } from "@/features/host/model/host-workbox-page-chain";

const routeMocks = vi.hoisted(() => ({
  loaderData: null as unknown,
  detailRefetchData: null as HostSessionDetailResponse | null,
  refetchDetail: vi.fn(),
  updateAttendance: vi.fn(),
  resetAttendance: vi.fn(),
  restoreChange: vi.fn(),
  resetRestore: vi.fn(),
  fetchRestorePreview: vi.fn(),
  reconciliationState: "idle" as "idle" | "checking" | "pending",
  workboxPages: new Map<string, unknown>(),
  workboxQueryBatches: [] as string[][],
  deferWorkbox: vi.fn(),
  removeWorkboxDeferral: vi.fn(),
  retryNotificationHealth: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  queryOptions: <T,>(options: T) => options,
  useQuery: (query: { testData?: HostSessionDetailResponse; enabled?: boolean }) => ({
    data: query.enabled === false ? undefined : query.testData,
    isError: false,
    isFetching: false,
    refetch: async () => {
      await routeMocks.refetchDetail();
      return { data: routeMocks.detailRefetchData ?? query.testData };
    },
  }),
  useQueries: ({
    queries,
  }: {
    queries: Array<{ testData?: unknown; testCursor?: string; enabled?: boolean }>;
  }) => {
    routeMocks.workboxQueryBatches.push(queries.map((query) => query.testCursor ?? "root"));
    return queries.map((query) => ({
      data: query.enabled === false ? undefined : query.testData,
      isError: false,
      isFetching: false,
      refetch: vi.fn(),
    }));
  },
  useQueryClient: () => ({
    fetchQuery: (query: { queryFn?: () => unknown }) => query.queryFn?.(),
  }),
}));

vi.mock("@/features/host/queries/host-session-queries", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/host/queries/host-session-queries")>()),
  hostSessionDetailQuery: (_sessionId: string) => ({
    queryKey: ["session-detail", _sessionId],
    testData: (routeMocks.loaderData as { currentMeeting?: HostSessionDetailResponse | null } | null)
      ?.currentMeeting ?? undefined,
  }),
  useUpdateHostSessionAttendanceMutation: () => ({
    mutateAsync: routeMocks.updateAttendance,
    reset: routeMocks.resetAttendance,
    reconciliationState: routeMocks.reconciliationState,
  }),
  publishHostSessionAttendance: vi.fn(),
}));

vi.mock("@/features/host/queries/host-session-recovery-queries", () => ({
  hostSessionRestorePreviewQuery: (_sessionId: string, changeId: string) => ({
    queryKey: ["restore-preview", changeId],
    queryFn: () => routeMocks.fetchRestorePreview(changeId),
  }),
  useRestoreHostSessionChangeMutation: () => ({
    mutateAsync: routeMocks.restoreChange,
    reset: routeMocks.resetRestore,
  }),
  publishRestoredHostSessionChange: vi.fn(),
}));

vi.mock("@/features/host/queries/host-workbox-queries", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/host/queries/host-workbox-queries")>()),
  hostWorkboxPageQuery: (request: { state: string; cursor?: string | null }) => ({
    queryKey: ["workbox", request.state],
    testCursor: request.cursor ?? "root",
    testData: routeMocks.workboxPages.get(`${request.state}:${request.cursor ?? "root"}`)
      ?? routeMocks.workboxPages.get(request.state),
  }),
  useDeferHostWorkboxItemMutation: () => ({ mutateAsync: routeMocks.deferWorkbox }),
  useRemoveHostWorkboxDeferralMutation: () => ({ mutateAsync: routeMocks.removeWorkboxDeferral }),
}));

vi.mock("@/features/host/queries/host-notification-queries", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/host/queries/host-notification-queries")>()),
  hostNotificationHealthQuery: () => ({
    queryKey: ["host-notification-health", "reading-sai"],
    queryFn: routeMocks.retryNotificationHealth,
  }),
}));

import { hostSensitiveStorage } from "@/features/host/storage/host-sensitive-storage";
import { signalHostAuthorityLoss, subscribeHostAuthorityLoss } from "@/shared/api/host-authority-event";
import { HostMutationPendingError } from "@/features/host/queries/host-session-queries";
import type { HostDashboardRouteData } from "./host-dashboard-data";
import { HostDashboardRoute } from "./host-dashboard-route";

const meetingDetail: HostSessionDetailResponse = {
  sessionId: "session-7",
  sessionNumber: 7,
  title: "일곱 번째 독서모임",
  bookTitle: "파도와 바람의 기록",
  bookAuthor: "작가 이름",
  bookLink: null,
  bookImageUrl: null,
  locationLabel: "책방 안쪽",
  meetingUrl: null,
  meetingPasscode: null,
  date: "2000-01-01",
  startTime: "19:30",
  endTime: "21:30",
  questionDeadlineAt: "1999-12-31T14:59:00Z",
  visibility: "MEMBER",
  accessScope: "GUEST_READABLE",
  siteVisibility: "HIDDEN",
  publication: null,
  state: "OPEN",
  scheduleRevision: 3,
  scheduleSeenAvailability: "AVAILABLE",
  scheduleSeenSummary: { currentCount: 1, staleCount: 0, unseenCount: 1, eligibleCount: 2 },
  versions: {
    sessionRevision: 4,
    scheduleRevision: 3,
    exposureRevision: 2,
    participantSetRevision: 2,
    recordDraftRevision: null,
    liveRecordRevision: null,
    publicationRevision: 0,
  },
  attendanceSnapshotId: "attendance-snapshot-7",
  attendees: [
    {
      membershipId: "member-1",
      avatarKey: "reader-a",
      displayName: "지후",
      accountName: "reader-a",
      rsvpStatus: "GOING",
      attendanceStatus: "UNKNOWN",
      participationStatus: "ACTIVE",
      attendanceRevision: 1,
      seenScheduleRevision: null,
      scheduleSeenAt: null,
      scheduleSeenState: "UNSEEN",
    },
    {
      membershipId: "member-2",
      avatarKey: "reader-b",
      displayName: "서연",
      accountName: "reader-b",
      rsvpStatus: "GOING",
      attendanceStatus: "ATTENDED",
      participationStatus: "ACTIVE",
      attendanceRevision: 2,
      seenScheduleRevision: 3,
      scheduleSeenAt: "2026-08-29T11:00:00Z",
      scheduleSeenState: "CURRENT",
    },
  ],
  feedbackDocument: { uploaded: false, fileName: null, uploadedAt: null },
};

const closingStatus: HostSessionClosingStatusResponse = {
  schema: "host.session_closing_status.v1",
  session: {
    sessionId: "session-7",
    sessionNumber: 7,
    bookTitle: "파도와 바람의 기록",
    meetingDate: "2000-01-01",
    state: "CLOSED",
    recordVisibility: "MEMBER",
    sessionRevision: 5,
    participantSetRevision: 2,
    attendanceSnapshotId: "attendance-snapshot-7",
  },
  overall: { state: "IN_PROGRESS", label: "기록 정리 중", primaryAction: "IMPORT_RECORDS" },
  checklist: [
    { id: "SESSION_CLOSED", state: "DONE", label: "모임 종료", detail: "출석이 확정되었습니다.", href: null },
    {
      id: "RECORD_PACKAGE_SAVED",
      state: "ACTION_REQUIRED",
      label: "기록 패키지",
      detail: "정리본을 검토하세요.",
      href: "/app/host/sessions/session-7?section=records",
    },
  ],
  evidence: {
    summaryPublished: false,
    highlightCount: 1,
    oneLinerCount: 1,
    feedbackDocumentState: "MISSING",
    latestNotificationEvent: null,
    publicRecordHref: null,
    memberReflectionHref: null,
  },
};

function dashboardData(overrides: Partial<HostDashboardRouteData> = {}): HostDashboardRouteData {
  return {
    operatingRoom: {
      currentMeeting: {
        sessionId: meetingDetail.sessionId,
        selection: "OPEN",
        scheduleSeenAvailability: "AVAILABLE",
      },
    },
    currentMeeting: meetingDetail,
    closingStatus: { state: "ready", data: { ...closingStatus, session: { ...closingStatus.session, state: "OPEN" } } },
    recordAttention: { state: "ready", data: {
      items: [],
      nextCursor: null,
      summary: { needsAttentionCount: 0, incompletePublishedCount: 0, draftCount: 0 },
    } },
    clubOperations: { state: "absent" },
    notificationHealth: { state: "absent" },
    ...overrides,
  };
}

function LocationProbe() {
  const location = useLocation();
  return <output aria-label="현재 URL">{`${location.pathname}${location.search}`}</output>;
}

function renderRoute(initialEntry = "/clubs/reading-sai/app/host", data = dashboardData()) {
  routeMocks.loaderData = data;
  const routes: RouteObject[] = [{
    path: "/clubs/:clubSlug/app/host",
    loader: () => routeMocks.loaderData,
    element: <><HostDashboardRoute /><LocationProbe /></>,
    hydrateFallbackElement: <p role="status">운영실을 불러오는 중</p>,
  }];
  const router = createMemoryRouter(routes, { initialEntries: [initialEntry] });
  const view = render(<RouterProvider router={router} />);
  return { ...view, router };
}

function stubCompactViewport(compact: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: compact && String(query).includes("max-width: 767px"),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
    onchange: null,
  }));
}

beforeEach(() => {
  stubCompactViewport(false);
  routeMocks.loaderData = dashboardData();
  routeMocks.detailRefetchData = null;
  routeMocks.refetchDetail.mockReset();
  routeMocks.updateAttendance.mockReset();
  routeMocks.resetAttendance.mockReset();
  routeMocks.restoreChange.mockReset();
  routeMocks.resetRestore.mockReset();
  routeMocks.fetchRestorePreview.mockReset();
  routeMocks.reconciliationState = "idle";
  routeMocks.workboxPages.clear();
  routeMocks.workboxQueryBatches.length = 0;
  routeMocks.deferWorkbox.mockReset().mockResolvedValue({
    key: "opaque",
    deferredUntil: "2026-09-01T00:00:00Z",
  });
  routeMocks.removeWorkboxDeferral.mockReset().mockResolvedValue(undefined);
  routeMocks.retryNotificationHealth.mockReset().mockResolvedValue({
    pending: 0,
    failed: 0,
    dead: 0,
    sentLast24h: 1,
    latestFailures: [],
  });
  routeMocks.updateAttendance.mockResolvedValue({
    changeReceipt: {
      changeId: "change-1",
      kind: "ATTENDANCE",
      undoAvailable: true,
      createdAt: "2026-08-30T12:01:00Z",
    },
  });
  routeMocks.fetchRestorePreview.mockResolvedValue({
    sessionId: "session-7",
    changeId: "change-1",
    kind: "ATTENDANCE",
    items: [],
    expectedCurrentHash: "current-hash",
    canRestore: true,
    blockedReason: null,
  });
  routeMocks.restoreChange.mockResolvedValue({ restored: true });
});

afterEach(async () => {
  await act(() => hostSensitiveStorage.clearClub("reading-sai"));
});

describe("HostDashboardRoute", () => {
  it("never merges retained cursor data across workbox snapshot generations", () => {
    const page = (
      evaluatedAt: string,
      title: string,
      nextCursor: string | null,
      sourceState: "AVAILABLE" | "UNAVAILABLE" = "AVAILABLE",
    ): HostWorkboxPage => ({
      state: "NOW",
      evaluatedAt,
      sourceAvailability: [{
        type: "SCHEDULE_UNSEEN",
        state: sourceState,
        ...(sourceState === "UNAVAILABLE"
          ? { failureCode: "SCHEDULE_SOURCE_UNAVAILABLE" as const }
          : {}),
      },
      { type: "MEMBER_APPROVAL", state: "AVAILABLE" },
      { type: "RECORD_CLOSING", state: "AVAILABLE" },
      { type: "INVITATION_EXPIRY", state: "AVAILABLE" },
      { type: "NOTIFICATION_FAILURE", state: "AVAILABLE" }],
      items: [{
        key: `SCHEDULE_UNSEEN:${title}`,
        type: "SCHEDULE_UNSEEN",
        state: "NOW",
        title,
        description: title,
        count: 1,
        dueAt: null,
        deferredUntil: null,
        resolvedAt: null,
        destinationHref: "/app/host/sessions/session-7/schedule-review",
        receiptSummary: null,
      }],
      nextCursor,
    });
    const oldRoot = page("2026-08-30T09:00:00Z", "old root", "old-cursor");
    const retainedOldContinuation = page(
      "2026-08-30T09:00:00Z",
      "retained old continuation",
      "old-next",
      "UNAVAILABLE",
    );

    const unchangedGeneration = mergeCoherentWorkboxPages(
      oldRoot,
      [oldRoot, retainedOldContinuation],
    );
    expect(unchangedGeneration).toMatchObject({
      items: [{ title: "old root" }, { title: "retained old continuation" }],
      nextCursor: "old-next",
    });
    expect(unchangedGeneration?.sourceAvailability[0]).toMatchObject({ state: "UNAVAILABLE" });

    const newRoot = page("2026-08-30T10:00:00Z", "new root", "new-cursor");
    const changedGeneration = mergeCoherentWorkboxPages(
      newRoot,
      [newRoot, retainedOldContinuation],
    );
    expect(changedGeneration).toMatchObject({
      evaluatedAt: "2026-08-30T10:00:00Z",
      items: [{ title: "new root" }],
      nextCursor: "new-cursor",
    });
    expect(changedGeneration?.sourceAvailability[0]).toMatchObject({ state: "AVAILABLE" });
    expect(mergeCoherentWorkboxPages(undefined, [retainedOldContinuation])).toBeNull();
  });

  it("resets a loaded cursor chain when the root workbox page disappears", async () => {
    const page = (title: string, nextCursor: string | null): HostWorkboxPage => ({
      state: "NOW",
      evaluatedAt: "2026-08-30T09:00:00Z",
      sourceAvailability: [
        { type: "SCHEDULE_UNSEEN", state: "AVAILABLE" },
        { type: "MEMBER_APPROVAL", state: "AVAILABLE" },
        { type: "RECORD_CLOSING", state: "AVAILABLE" },
        { type: "INVITATION_EXPIRY", state: "AVAILABLE" },
        { type: "NOTIFICATION_FAILURE", state: "AVAILABLE" },
      ],
      items: [{
        key: `SCHEDULE_UNSEEN:${title}`,
        type: "SCHEDULE_UNSEEN",
        state: "NOW",
        title,
        description: title,
        count: 1,
        dueAt: null,
        deferredUntil: null,
        resolvedAt: null,
        destinationHref: "/app/host/sessions/session-7/schedule-review",
        receiptSummary: null,
      }],
      nextCursor,
    });
    routeMocks.workboxPages.set("NOW:root", page("root item", "cursor-one"));
    routeMocks.workboxPages.set("NOW:cursor-one", page("continuation item", null));
    const { router } = renderRoute();

    await userEvent.click(await screen.findByRole("button", { name: "다음 묶음 불러오기" }));
    expect(await screen.findByRole("listitem", { name: "continuation item" })).toBeVisible();
    expect(routeMocks.workboxQueryBatches.at(-1)).toEqual(["root", "cursor-one"]);

    routeMocks.workboxPages.delete("NOW:root");
    await act(async () => {
      await router.navigate("/clubs/reading-sai/app/host?phase=prep");
    });

    await waitFor(() => expect(routeMocks.workboxQueryBatches.at(-1)).toEqual(["root"]));
    expect(screen.queryByRole("listitem", { name: "continuation item" })).not.toBeInTheDocument();
  });

  it("keeps the global workbox visible when there is no current meeting", async () => {
    routeMocks.workboxPages.set("NOW", {
      state: "NOW",
      evaluatedAt: "2026-08-30T09:00:00Z",
      sourceAvailability: [
        { type: "SCHEDULE_UNSEEN", state: "AVAILABLE" },
        { type: "MEMBER_APPROVAL", state: "AVAILABLE" },
        { type: "RECORD_CLOSING", state: "AVAILABLE" },
        { type: "INVITATION_EXPIRY", state: "AVAILABLE" },
        { type: "NOTIFICATION_FAILURE", state: "AVAILABLE" },
      ],
      items: [],
      nextCursor: null,
    });
    renderRoute("/clubs/reading-sai/app/host", dashboardData({
      operatingRoom: { currentMeeting: null },
      currentMeeting: null,
    }));

    expect(await screen.findByRole("heading", { name: "현재 운영할 모임이 없습니다" })).toBeVisible();
    expect(screen.getByRole("complementary", { name: "클럽 작업함" })).toBeVisible();
    expect(screen.getByText("지금 처리할 작업이 없습니다.")).toBeVisible();
  });

  it("defers the next action with the exact workbox key and a future ISO instant", async () => {
    const key = "SCHEDULE_UNSEEN:opaque/server:key:r7";
    routeMocks.workboxPages.set("NOW", {
      state: "NOW",
      evaluatedAt: "2026-08-30T09:00:00Z",
      sourceAvailability: [
        { type: "SCHEDULE_UNSEEN", state: "AVAILABLE" },
        { type: "MEMBER_APPROVAL", state: "AVAILABLE" },
        { type: "RECORD_CLOSING", state: "AVAILABLE" },
        { type: "INVITATION_EXPIRY", state: "AVAILABLE" },
        { type: "NOTIFICATION_FAILURE", state: "AVAILABLE" },
      ],
      items: [{
        key,
        type: "SCHEDULE_UNSEEN",
        state: "NOW",
        title: "일정 확인이 필요한 멤버",
        description: "미열람 1명",
        count: 1,
        dueAt: null,
        deferredUntil: null,
        resolvedAt: null,
        destinationHref: "/app/host/sessions/session-7/schedule-review",
        receiptSummary: null,
      }],
      nextCursor: null,
    });
    const futureMeeting = { ...meetingDetail, date: "2999-01-01" };
    renderRoute("/clubs/reading-sai/app/host?phase=prep", dashboardData({
      currentMeeting: futureMeeting,
      operatingRoom: {
        currentMeeting: {
          sessionId: futureMeeting.sessionId,
          selection: "OPEN",
          scheduleSeenAvailability: "AVAILABLE",
        },
      },
    }));

    const nextAction = await screen.findByRole("region", { name: "다음에 할 일" });
    expect(within(nextAction).queryByText("세부 조작")).not.toBeInTheDocument();
    await userEvent.click(within(nextAction).getByRole("button", { name: "내일 09:00까지 보류" }));
    expect(routeMocks.deferWorkbox).toHaveBeenCalledWith(expect.objectContaining({
      key,
      deferredUntil: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    }));
    expect(new Date(routeMocks.deferWorkbox.mock.calls[0][0].deferredUntil).getTime()).toBeGreaterThan(Date.now());
  });

  it("submits a pending next-action deferral only once", async () => {
    const key = "SCHEDULE_UNSEEN:opaque/server:key:r7";
    const pendingDeferral: {
      resolve: ((value: { key: string; deferredUntil: string }) => void) | null;
    } = { resolve: null };
    routeMocks.deferWorkbox.mockImplementationOnce(() => new Promise((resolve) => {
      pendingDeferral.resolve = resolve;
    }));
    routeMocks.workboxPages.set("NOW", {
      state: "NOW",
      evaluatedAt: "2026-08-30T09:00:00Z",
      sourceAvailability: [
        { type: "SCHEDULE_UNSEEN", state: "AVAILABLE" },
        { type: "MEMBER_APPROVAL", state: "AVAILABLE" },
        { type: "RECORD_CLOSING", state: "AVAILABLE" },
        { type: "INVITATION_EXPIRY", state: "AVAILABLE" },
        { type: "NOTIFICATION_FAILURE", state: "AVAILABLE" },
      ],
      items: [{
        key,
        type: "SCHEDULE_UNSEEN",
        state: "NOW",
        title: "일정 확인이 필요한 멤버",
        description: "미열람 1명",
        count: 1,
        dueAt: null,
        deferredUntil: null,
        resolvedAt: null,
        destinationHref: "/app/host/sessions/session-7/schedule-review",
        receiptSummary: null,
      }],
      nextCursor: null,
    });
    const futureMeeting = { ...meetingDetail, date: "2999-01-01" };
    renderRoute("/clubs/reading-sai/app/host?phase=prep", dashboardData({
      currentMeeting: futureMeeting,
      operatingRoom: {
        currentMeeting: {
          sessionId: futureMeeting.sessionId,
          selection: "OPEN",
          scheduleSeenAvailability: "AVAILABLE",
        },
      },
    }));

    const nextAction = await screen.findByRole("region", { name: "다음에 할 일" });
    const button = within(nextAction).getByRole("button", { name: "내일 09:00까지 보류" });
    await userEvent.click(button);
    expect(within(nextAction).getByRole("button", { name: "보류 중" })).toBeDisabled();
    await userEvent.click(within(nextAction).getByRole("button", { name: "보류 중" }));
    expect(routeMocks.deferWorkbox).toHaveBeenCalledTimes(1);

    pendingDeferral.resolve?.({ key, deferredUntil: "2026-09-01T00:00:00Z" });
  });
  it("normalizes an unavailable URL phase with replace navigation and a visible reason", async () => {
    const futureDraft = { ...meetingDetail, state: "DRAFT" as const, date: "2999-01-01" };
    const { router } = renderRoute(
      "/clubs/reading-sai/app/host?phase=closing&from=notice",
      dashboardData({
        operatingRoom: { currentMeeting: {
          sessionId: futureDraft.sessionId,
          selection: "UPCOMING_DRAFT",
          scheduleSeenAvailability: "UNAVAILABLE",
        } },
        currentMeeting: futureDraft,
        closingStatus: { state: "absent" },
      }),
    );

    expect(await screen.findByRole("status", { name: "운영 단계 이동 안내" })).toHaveTextContent(
      "마감실은 모임을 마친 뒤 사용할 수 있어 준비실로 이동했습니다.",
    );
    await waitFor(() => expect(router.state.location.search).toBe("?phase=prep&from=notice"));
    expect(router.state.historyAction).toBe("REPLACE");
    expect(screen.getByRole("tab", { name: /준비실/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("아직 멤버에게 공개되지 않음")).toBeVisible();
    expect(screen.queryByRole("link", { name: "현재 일정 확인 멤버 보기" })).not.toBeInTheDocument();
  });

  it("keeps a qualifying future draft schedule review actionable from exact detail counts", async () => {
    const futureDraft = { ...meetingDetail, state: "DRAFT" as const, date: "2999-01-01" };
    renderRoute(
      "/clubs/reading-sai/app/host?phase=prep",
      dashboardData({
        operatingRoom: { currentMeeting: {
          sessionId: futureDraft.sessionId,
          selection: "UPCOMING_DRAFT",
          scheduleSeenAvailability: "AVAILABLE",
        } },
        currentMeeting: futureDraft,
        closingStatus: { state: "absent" },
      }),
    );

    const ledger = await screen.findByRole("region", { name: "준비 현황" });
    expect(within(ledger).getByText("1 / 2")).toBeVisible();
    expect(screen.getByRole("region", { name: "다음에 할 일" })).toHaveTextContent("최신 일정을 아직 보지 않은 1명이 있어요");
    expect(screen.getByRole("link", { name: "대상과 문구 검토" })).toHaveAttribute(
      "href",
      "/clubs/reading-sai/app/host/sessions/session-7/schedule-review",
    );
  });

  it("renders one empty-current action without date or list selection", async () => {
    renderRoute("/clubs/reading-sai/app/host?phase=live", dashboardData({
      operatingRoom: { currentMeeting: null },
      currentMeeting: null,
      closingStatus: { state: "absent" },
      recordAttention: { state: "absent" },
      clubOperations: { state: "absent" },
      notificationHealth: { state: "absent" },
    }));

    expect(await screen.findByRole("heading", { level: 1, name: "모임 운영실" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "현재 운영할 모임이 없습니다" })).toBeVisible();
    const createLinks = screen.getAllByRole("link", { name: "첫 모임 만들기" });
    expect(createLinks).toHaveLength(1);
    expect(createLinks[0]).toHaveAttribute(
      "href",
      "/clubs/reading-sai/app/host/sessions/new",
    );
    expect(screen.queryByLabelText(/날짜 선택|모임 선택/)).not.toBeInTheDocument();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it.each(["live", "closing", "invalid"])(
    "normalizes empty-current phase %s to prep while preserving club scope and safe URL state",
    async (requestedPhase) => {
      const { router } = renderRoute(
        `/clubs/reading-sai/app/host?phase=${requestedPhase}&from=notice#retained`,
        dashboardData({
          operatingRoom: { currentMeeting: null },
          currentMeeting: null,
          closingStatus: { state: "absent" },
          recordAttention: { state: "absent" },
          clubOperations: { state: "absent" },
          notificationHealth: { state: "absent" },
        }),
      );

      expect(await screen.findByRole("heading", { name: "현재 운영할 모임이 없습니다" })).toBeVisible();
      await waitFor(() => expect(router.state.location.search).toBe("?phase=prep&from=notice"));
      expect(router.state.location.pathname).toBe("/clubs/reading-sai/app/host");
      expect(router.state.location.hash).toBe("#retained");
      expect(router.state.historyAction).toBe("REPLACE");
    },
  );

  it("composes the prep room from the current meeting, next action, and independent ledger rows", async () => {
    renderRoute("/clubs/reading-sai/app/host?phase=prep");

    expect(await screen.findByRole("group", { name: "현재 모임" })).toHaveTextContent("일곱 번째 독서모임");
    expect(screen.getByRole("tab", { name: /준비실/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("region", { name: "다음에 할 일" })).toHaveTextContent("최신 일정을 아직 보지 않은 1명이 있어요");
    const ledger = screen.getByRole("region", { name: "준비 현황" });
    expect(within(ledger).getAllByRole("listitem")).toHaveLength(4);
    expect(within(ledger).getByText("1 / 2")).toBeVisible();
    expect(screen.getByRole("link", { name: "모임 정보" })).toHaveAttribute(
      "href",
      "/clubs/reading-sai/app/host/sessions/session-7?section=basic",
    );
    expect(screen.getByRole("link", { name: "일정 편집" })).toHaveAttribute(
      "href",
      "/clubs/reading-sai/app/host/sessions/session-7?section=basic&edit=1",
    );
    const headerActions = screen.getByRole("navigation", { name: "현재 모임 작업" });
    expect(within(headerActions).queryByRole("link", { name: "멤버 시야" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "멤버 시야" })).toHaveAttribute(
      "href",
      "/clubs/reading-sai/app/sessions/session-7",
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("파도와 바람의 기록");
    expect(screen.getByRole("link", { name: "대상과 문구 검토" })).toHaveAttribute(
      "href",
      "/clubs/reading-sai/app/host/sessions/session-7/schedule-review",
    );
    expect(within(ledger).getByRole("link", { name: "현재 일정 확인 멤버 보기" })).toHaveAttribute(
      "href",
      "/clubs/reading-sai/app/host/sessions/session-7/schedule-review",
    );
  });

  it("changes phase through SPA navigation while preserving unrelated query and recovery state", async () => {
    stubCompactViewport(true);
    const user = userEvent.setup();
    routeMocks.updateAttendance.mockRejectedValueOnce({ status: 409, code: "REVISION_CONFLICT" });
    routeMocks.detailRefetchData = meetingDetail;
    const { router } = renderRoute("/clubs/reading-sai/app/host?phase=live&from=notice");

    await user.click(await screen.findByRole("button", { name: "지후 참석" }));
    expect(await screen.findByRole("alert", { name: "출석 변경 충돌" })).toBeVisible();
    await user.click(screen.getByRole("tab", { name: /준비실/ }));

    await waitFor(() => {
      expect(router.state.location.search).toBe("?phase=prep&from=notice");
    });
    expect(router.state.historyAction).toBe("PUSH");
    expect(screen.getByRole("alert", { name: "출석 변경 충돌" })).toBeVisible();
  });

  it("keeps desktop live as the status ledger without the attendance board", async () => {
    renderRoute("/clubs/reading-sai/app/host?phase=live");

    expect(await screen.findByRole("region", { name: "현장 현황" })).toBeVisible();
    expect(screen.queryByRole("region", { name: "출석 확인" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "모임 진행 보기" })).toBeVisible();
    expect(screen.getByText("오늘").closest("[data-badge]")).toHaveAttribute("data-badge", "today");
  });

  it("does not render a live undo bar from GET attendance when there is no write receipt", async () => {
    renderRoute("/clubs/reading-sai/app/host?phase=live");

    expect(await screen.findByRole("region", { name: "현장 현황" })).toBeVisible();
    expect(meetingDetail.attendees.some((attendee) => attendee.attendanceStatus === "ATTENDED")).toBe(true);
    expect(screen.queryByRole("button", { name: "실행 취소" })).not.toBeInTheDocument();
    expect(screen.queryByText("출석 8명 저장됨")).not.toBeInTheDocument();
  });

  it("keeps live attendance writes and the existing restore receipt flow in the operating room", async () => {
    stubCompactViewport(true);
    const user = userEvent.setup();
    renderRoute("/clubs/reading-sai/app/host?phase=live");

    expect(await screen.findByRole("region", { name: "출석 확인" })).toBeVisible();
    expect(screen.queryByRole("region", { name: "현장 현황" })).not.toBeInTheDocument();
    const attendance = screen.getByRole("region", { name: "출석 확인" });
    await user.click(within(attendance).getByRole("button", { name: "지후 참석" }));
    expect(routeMocks.updateAttendance).toHaveBeenCalledWith({
      sessionId: "session-7",
      attendance: [{ membershipId: "member-1", attendanceStatus: "ATTENDED" }],
    });

    await user.click(await screen.findByRole("button", { name: "실행 취소" }));
    await waitFor(() => expect(routeMocks.restoreChange).toHaveBeenCalledWith({
      sessionId: "session-7",
      changeId: "change-1",
      request: { expectedCurrentHash: "current-hash" },
    }));
  });

  it("renders the existing closing checklist for a completed readable phase", async () => {
    const closed = { ...meetingDetail, state: "CLOSED" as const };
    renderRoute("/clubs/reading-sai/app/host?phase=closing", dashboardData({
      operatingRoom: { currentMeeting: {
        sessionId: closed.sessionId,
        selection: "CLOSING_REQUIRED",
        scheduleSeenAvailability: "AVAILABLE",
      } },
      currentMeeting: closed,
      closingStatus: { state: "ready", data: closingStatus },
    }));

    expect(await screen.findByRole("tab", { name: /마감실/ })).toHaveAttribute("aria-selected", "true");
    const checklist = screen.getByRole("region", { name: "마감 현황" });
    expect(checklist).toHaveTextContent("출석 확정");
    expect(checklist).toHaveTextContent("기록 초안");
    expect(screen.getByRole("region", { name: "다음에 할 일" })).toHaveTextContent("기록 초안을 검토하면 멤버에게 게시할 수 있어요");
    expect(screen.getByRole("link", { name: "기록 미리보기" })).toHaveAttribute(
      "href",
      "/clubs/reading-sai/app/host/sessions/session-7?section=records",
    );
    expect(screen.getByRole("link", { name: "기록 초안 검토" })).toHaveAttribute(
      "href",
      "/clubs/reading-sai/app/host/records",
    );
    expect(within(checklist).getByRole("link", { name: "기록 초안 초안 열기" })).toHaveAttribute(
      "href",
      "/clubs/reading-sai/app/host/sessions/session-7?section=records",
    );
  });

  it("surfaces closing schedule-seen UNAVAILABLE as a retryable optional failure", async () => {
    const closed = {
      ...meetingDetail,
      state: "CLOSED" as const,
      scheduleSeenAvailability: "UNAVAILABLE" as const,
      scheduleSeenSummary: {
        currentCount: null,
        staleCount: null,
        unseenCount: null,
        eligibleCount: null,
      },
    };
    renderRoute("/clubs/reading-sai/app/host?phase=closing", dashboardData({
      operatingRoom: { currentMeeting: {
        sessionId: closed.sessionId,
        selection: "CLOSING_REQUIRED",
        scheduleSeenAvailability: "UNAVAILABLE",
      } },
      currentMeeting: closed,
      closingStatus: { state: "ready", data: closingStatus },
    }));

    expect(await screen.findByRole("tab", { name: /마감실/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("region", { name: "마감 현황" })).toBeVisible();
    const partial = screen.getByRole("region", { name: "일부 운영 정보 불러오기 실패" });
    expect(partial).toHaveTextContent("일정 확인 집계를 불러오지 못했습니다.");
  });

  it("summarizes compact live attendance from the full GET census", async () => {
    stubCompactViewport(true);
    renderRoute("/clubs/reading-sai/app/host?phase=live");

    expect(await screen.findByRole("region", { name: "출석 확인" })).toBeVisible();
    expect(document.querySelector(".rm-meeting-response-ledger__summary")).toHaveTextContent("실제 출석 1 / 2 · 확인 필요 1");
    expect(screen.getByText("현장 운영")).toBeVisible();
    expect(screen.getByRole("link", { name: "진행 순서 보기 ›" })).toHaveAttribute(
      "href",
      "/clubs/reading-sai/app/host/sessions/session-7?section=agenda",
    );
    expect(screen.getByText("진행 중").closest("[data-badge]")).toHaveAttribute("data-badge", "live");
    expect(screen.getByRole("link", { name: "출석 2명 모두 보기" })).toHaveAttribute(
      "href",
      "/clubs/reading-sai/app/host/sessions/session-7?section=attendance",
    );
    const unknown = screen.getByRole("button", { name: "지후 미확인" });
    expect(unknown.querySelector(".rm-attendance-choice [data-icon='question-circle']")).toBeTruthy();
    expect(unknown).toHaveTextContent("미확인");
    expect(screen.getAllByRole("listitem").filter((item) => item.classList.contains("rm-meeting-response-ledger__row"))).toHaveLength(1);
    expect(screen.getByText("지후")).toBeVisible();
    expect(screen.queryByText("서연")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /나머지 .*명 모두 참석/ })).not.toBeInTheDocument();
  });

  it("shows a workbox footer note from the completed receipt while the NOW tab is open", async () => {
    routeMocks.workboxPages.set("NOW:root", workboxPageWithItems(4));
    routeMocks.workboxPages.set("COMPLETED:root", {
      ...workboxPageWithItems(1),
      state: "COMPLETED",
      items: [{
        ...workboxPageWithItems(1).items[0]!,
        state: "COMPLETED",
        deferredUntil: null,
        resolvedAt: new Date(2026, 7, 29, 19, 30, 0).toISOString(),
        receiptSummary: { operation: "SCHEDULE_REMINDER", outcome: "DONE", affectedCount: 8 },
      }],
    });
    renderRoute("/clubs/reading-sai/app/host?phase=prep");

    expect(await screen.findByText(/자동 리마인드 전달됨/)).toBeVisible();
    expect(document.querySelector(".rm-host-workbox__footer")?.querySelector('[data-icon="clock"]')).toBeTruthy();
    expect(document.querySelector(".rm-host-workbox__footer a")).toHaveTextContent("변경 이력");
  });

  it("keeps successful meeting content when optional sources fail and exposes scoped retry", async () => {
    const { router } = renderRoute("/clubs/reading-sai/app/host?phase=prep", dashboardData({
      recordAttention: { state: "failed", error: { message: "기록 확인 항목을 불러오지 못했습니다.", retryable: true } },
      clubOperations: { state: "failed", error: { message: "클럽 운영 상태를 불러오지 못했습니다.", retryable: true } },
      notificationHealth: { state: "failed", error: { message: "알림 상태를 불러오지 못했습니다.", retryable: true } },
    }));
    const revalidate = vi.spyOn(router, "revalidate");

    expect(await screen.findByRole("group", { name: "현재 모임" })).toBeVisible();
    const partial = screen.getByRole("region", { name: "일부 운영 정보 불러오기 실패" });
    expect(partial).toHaveTextContent("기록 확인 항목을 불러오지 못했습니다.");
    expect(partial).toHaveTextContent("클럽 운영 상태를 불러오지 못했습니다.");
    expect(partial).toHaveTextContent("알림 상태를 불러오지 못했습니다.");
    await userEvent.click(within(partial).getByRole("button", { name: "일부 운영 정보 다시 불러오기" }));
    expect(revalidate).toHaveBeenCalledTimes(1);
  });

  it("retries only failed notification health while keeping the current meeting and workbox usable", async () => {
    routeMocks.workboxPages.set("NOW", {
      state: "NOW",
      evaluatedAt: "2026-08-30T09:00:00Z",
      sourceAvailability: [
        { type: "SCHEDULE_UNSEEN", state: "AVAILABLE" },
        { type: "MEMBER_APPROVAL", state: "AVAILABLE" },
        { type: "RECORD_CLOSING", state: "AVAILABLE" },
        { type: "INVITATION_EXPIRY", state: "AVAILABLE" },
        { type: "NOTIFICATION_FAILURE", state: "UNAVAILABLE", failureCode: "NOTIFICATION_SOURCE_UNAVAILABLE" },
      ],
      items: [],
      nextCursor: null,
    });
    renderRoute("/clubs/reading-sai/app/host?phase=prep", dashboardData({
      notificationHealth: {
        state: "failed",
        error: { message: "알림 상태를 불러오지 못했습니다.", retryable: true },
      },
    }));

    expect(await screen.findByRole("group", { name: "현재 모임" })).toBeVisible();
    expect(screen.getByRole("region", { name: "호스트 작업함" })).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "알림 상태 다시 불러오기" }));

    await waitFor(() => expect(routeMocks.retryNotificationHealth).toHaveBeenCalledTimes(1));
    expect(routeMocks.refetchDetail).not.toHaveBeenCalled();
    expect(screen.getByRole("group", { name: "현재 모임" })).toBeVisible();
    await waitFor(() => expect(screen.queryByText("알림 상태를 불러오지 못했습니다.")).not.toBeInTheDocument());
  });

  it("preserves the intended attendance on 409, refetches exact detail, and offers comparison retry", async () => {
    stubCompactViewport(true);
    const user = userEvent.setup();
    routeMocks.updateAttendance
      .mockRejectedValueOnce({ status: 409, code: "REVISION_CONFLICT" })
      .mockResolvedValueOnce({ changeReceipt: null });
    routeMocks.detailRefetchData = {
      ...meetingDetail,
      attendees: meetingDetail.attendees.map((attendee) => attendee.membershipId === "member-1"
        ? { ...attendee, attendanceStatus: "ABSENT" as const, attendanceRevision: 2 }
        : attendee),
    };
    let releaseRefetch: (() => void) | undefined;
    routeMocks.refetchDetail.mockImplementation(() => new Promise<void>((resolve) => {
      releaseRefetch = resolve;
    }));
    renderRoute("/clubs/reading-sai/app/host?phase=live");

    await user.click(await screen.findByRole("button", { name: "지후 참석" }));
    await waitFor(() => expect(routeMocks.refetchDetail).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("alert", { name: "출석 변경 충돌" })).not.toBeInTheDocument();
    await act(async () => {
      releaseRefetch?.();
    });

    const comparison = await screen.findByRole("alert", { name: "출석 변경 충돌" });
    expect(within(comparison).getByText("내가 선택한 값").nextElementSibling).toHaveTextContent("출석");
    expect(within(comparison).getByText("최신 값").nextElementSibling).toHaveTextContent("불참");

    await user.click(within(comparison).getByRole("button", { name: "내 선택으로 다시 저장" }));
    expect(routeMocks.updateAttendance).toHaveBeenLastCalledWith({
      sessionId: "session-7",
      attendance: [{ membershipId: "member-1", attendanceStatus: "ATTENDED" }],
    });
  });

  it("keeps an unknown attendance result reconcilable without blind retry", async () => {
    stubCompactViewport(true);
    const user = userEvent.setup();
    routeMocks.updateAttendance.mockRejectedValueOnce(new HostMutationPendingError());
    routeMocks.detailRefetchData = meetingDetail;
    renderRoute("/clubs/reading-sai/app/host?phase=live");

    await user.click(await screen.findByRole("button", { name: "지후 참석" }));

    const unknown = await screen.findByRole("status", { name: "출석 변경 결과 확인" });
    expect(unknown).toHaveTextContent("같은 변경을 다시 보내지 않습니다");
    expect(within(unknown).getByRole("link", { name: "변경 내역 열기" })).toHaveAttribute(
      "href",
      "/clubs/reading-sai/app/host/sessions/session-7?section=history",
    );
    expect(within(unknown).queryByRole("button", { name: /다시 저장|재시도/ })).not.toBeInTheDocument();
    await user.click(within(unknown).getByRole("button", { name: "최신 출석 확인" }));
    expect(routeMocks.refetchDetail).toHaveBeenCalledTimes(1);
    expect(routeMocks.updateAttendance).toHaveBeenCalledTimes(1);
  });

  it("clears conflict drafts and receipts through the club-scoped authority-loss purge path", async () => {
    stubCompactViewport(true);
    const user = userEvent.setup();
    routeMocks.updateAttendance.mockRejectedValueOnce({ status: 409, code: "REVISION_CONFLICT" });
    routeMocks.detailRefetchData = meetingDetail;
    renderRoute("/clubs/reading-sai/app/host?phase=live");
    await user.click(await screen.findByRole("button", { name: "지후 참석" }));
    expect(await screen.findByRole("alert", { name: "출석 변경 충돌" })).toBeVisible();

    const unsubscribe = subscribeHostAuthorityLoss((event) => {
      void hostSensitiveStorage.clearClub(event.clubSlug);
    });
    await act(async () => {
      signalHostAuthorityLoss({
        code: "HOST_AUTHORITY_REVOKED",
        clubSlug: "reading-sai",
        requestKind: "SESSION_ATTENDANCE_SINGLE",
      });
      await Promise.resolve();
    });
    unsubscribe();

    await waitFor(() => expect(screen.queryByRole("alert", { name: "출석 변경 충돌" })).not.toBeInTheDocument());
    expect(routeMocks.resetAttendance).toHaveBeenCalled();
    expect(routeMocks.resetRestore).toHaveBeenCalled();
  });

  it("drops stale attendance recovery when revalidation selects a different current session", async () => {
    stubCompactViewport(true);
    const user = userEvent.setup();
    routeMocks.updateAttendance.mockRejectedValueOnce({ status: 409, code: "REVISION_CONFLICT" });
    routeMocks.detailRefetchData = meetingDetail;
    const { router } = renderRoute("/clubs/reading-sai/app/host?phase=live");

    await user.click(await screen.findByRole("button", { name: "지후 참석" }));
    expect(await screen.findByRole("alert", { name: "출석 변경 충돌" })).toBeVisible();

    const nextMeeting: HostSessionDetailResponse = {
      ...meetingDetail,
      sessionId: "session-8",
      sessionNumber: 8,
      title: "여덟 번째 독서모임",
      attendees: [{
        ...meetingDetail.attendees[0],
        membershipId: "member-8",
        displayName: "민수",
        accountName: "reader-c",
      }],
    };
    routeMocks.loaderData = dashboardData({
      operatingRoom: { currentMeeting: {
        sessionId: nextMeeting.sessionId,
        selection: "OPEN",
        scheduleSeenAvailability: "AVAILABLE",
      } },
      currentMeeting: nextMeeting,
    });
    routeMocks.detailRefetchData = null;
    routeMocks.updateAttendance.mockReset();
    routeMocks.updateAttendance.mockResolvedValue({ changeReceipt: null });
    await act(async () => router.revalidate());

    await screen.findByText(/여덟 번째 독서모임/);
    expect(screen.queryByRole("alert", { name: "출석 변경 충돌" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "내 선택으로 다시 저장" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "지후 참석" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "민수 참석" }));
    expect(routeMocks.updateAttendance).toHaveBeenCalledTimes(1);
    expect(routeMocks.updateAttendance).toHaveBeenCalledWith({
      sessionId: "session-8",
      attendance: [{ membershipId: "member-8", attendanceStatus: "ATTENDED" }],
    });
  });

  it("keeps workbox=all across workbox tab changes and restores the capped view on Browser Back", async () => {
    routeMocks.workboxPages.set("NOW:root", workboxPageWithItems(12));
    routeMocks.workboxPages.set("DEFERRED:root", {
      ...workboxPageWithItems(0),
      state: "DEFERRED",
      items: [],
    });
    const user = userEvent.setup();
    const { router } = renderRoute("/clubs/reading-sai/app/host?phase=prep");

    const workbox = await screen.findByRole("region", { name: "호스트 작업함" });
    expect(within(workbox).getByRole("tab", { name: /지금 12/ })).toBeVisible();
    expect(within(workbox).getAllByRole("listitem")).toHaveLength(4);
    await user.click(within(workbox).getByRole("button", { name: "작업함 모두 보기" }));
    await waitFor(() => expect(router.state.location.search).toBe("?phase=prep&workbox=all"));
    expect(within(workbox).getAllByRole("listitem")).toHaveLength(12);

    await user.click(within(workbox).getByRole("tab", { name: "보류" }));
    await waitFor(() => expect(router.state.location.search).toBe("?phase=prep&workbox=all"));

    await act(async () => {
      await router.navigate(-1);
    });
    await waitFor(() => expect(router.state.location.search).toBe("?phase=prep"));
    await user.click(within(workbox).getByRole("tab", { name: /지금/ }));
    expect(within(workbox).getAllByRole("listitem")).toHaveLength(4);
  });

  it("shows three workbox items in a compact viewport until expanded", async () => {
    stubCompactViewport(true);
    routeMocks.workboxPages.set("NOW:root", workboxPageWithItems(12));
    renderRoute("/clubs/reading-sai/app/host?phase=prep");

    const workbox = await screen.findByRole("region", { name: "호스트 작업함" });
    expect(within(workbox).getAllByRole("listitem")).toHaveLength(3);
    expect(within(workbox).getByRole("button", { name: "작업함 모두 보기" })).toBeVisible();
  });

  it("keeps the current operating phase when expanding the workbox", async () => {
    routeMocks.workboxPages.set("NOW:root", workboxPageWithItems(12));
    const user = userEvent.setup();
    const { router } = renderRoute("/clubs/reading-sai/app/host?phase=live");

    const workbox = await screen.findByRole("region", { name: "호스트 작업함" });
    await user.click(within(workbox).getByRole("button", { name: "작업함 모두 보기" }));
    await waitFor(() => expect(router.state.location.search).toBe("?phase=live&workbox=all"));
  });

  it("announces workbox source warnings once in the compact state-summary channel", async () => {
    routeMocks.workboxPages.set("NOW:root", {
      ...workboxPageWithItems(1),
      sourceAvailability: [
        { type: "SCHEDULE_UNSEEN", state: "AVAILABLE" },
        { type: "MEMBER_APPROVAL", state: "AVAILABLE" },
        { type: "RECORD_CLOSING", state: "UNAVAILABLE", failureCode: "RECORD_SOURCE_UNAVAILABLE" },
        { type: "INVITATION_EXPIRY", state: "AVAILABLE" },
        { type: "NOTIFICATION_FAILURE", state: "AVAILABLE" },
      ],
    });
    renderRoute("/clubs/reading-sai/app/host?phase=prep");

    const summary = await screen.findByRole("region", { name: "일부 운영 정보 불러오기 실패" });
    expect(summary).toHaveTextContent("지난 모임 기록 마감 정보를 불러오지 못했어요.");
    expect(within(summary).getByRole("button", { name: "지난 모임 기록 마감 다시 불러오기" })).toBeVisible();
    const workbox = screen.getByRole("region", { name: "호스트 작업함" });
    expect(within(workbox).queryByRole("alert")).not.toBeInTheDocument();
  });
});

function workboxPageWithItems(count: number, nextCursor: string | null = null): HostWorkboxPage {
  const types = [
    "SCHEDULE_UNSEEN",
    "MEMBER_APPROVAL",
    "RECORD_CLOSING",
    "INVITATION_EXPIRY",
    "NOTIFICATION_FAILURE",
  ] as const;
  return {
    state: "NOW",
    evaluatedAt: "2026-08-30T09:00:00Z",
    sourceAvailability: types.map((type) => ({ type, state: "AVAILABLE" as const })),
    items: Array.from({ length: count }, (_, index) => {
      const type = types[index % types.length];
      return {
        key: `${type}:resource-${index}:g1`,
        type,
        state: "NOW" as const,
        title: `작업 ${index + 1}`,
        description: `설명 ${index + 1}`,
        count: index + 1,
        dueAt: null,
        deferredUntil: null,
        resolvedAt: null,
        destinationHref: `/app/host/destination/${index}`,
        receiptSummary: null,
      };
    }),
    nextCursor,
  };
}
