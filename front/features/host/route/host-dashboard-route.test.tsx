import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryRouter, RouterProvider, useLocation, type RouteObject } from "react-router";
import type {
  HostSessionClosingStatusResponse,
  HostSessionDetailResponse,
} from "@/features/host/api/host-contracts";

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
  deferWorkbox: vi.fn(),
  removeWorkboxDeferral: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  queryOptions: <T,>(options: T) => options,
  useQuery: (query: { testData?: HostSessionDetailResponse; enabled?: boolean }) => ({
    data: query.enabled === false ? undefined : query.testData,
    isError: false,
    isFetching: false,
    refetch: async () => {
      routeMocks.refetchDetail();
      return { data: routeMocks.detailRefetchData ?? query.testData };
    },
  }),
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
}));

vi.mock("@/features/host/queries/host-workbox-queries", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/host/queries/host-workbox-queries")>()),
  hostWorkboxPageQuery: (request: { state: string }) => ({
    queryKey: ["workbox", request.state],
    testData: routeMocks.workboxPages.get(request.state),
  }),
  useDeferHostWorkboxItemMutation: () => ({ mutateAsync: routeMocks.deferWorkbox }),
  useRemoveHostWorkboxDeferralMutation: () => ({ mutateAsync: routeMocks.removeWorkboxDeferral }),
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

beforeEach(() => {
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
  routeMocks.deferWorkbox.mockReset().mockResolvedValue({
    key: "opaque",
    deferredUntil: "2026-09-01T00:00:00Z",
  });
  routeMocks.removeWorkboxDeferral.mockReset().mockResolvedValue(undefined);
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

    await userEvent.click(await screen.findByRole("button", { name: "내일 09:00까지 보류" }));
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

    const button = await screen.findByRole("button", { name: "내일 09:00까지 보류" });
    await userEvent.click(button);
    expect(screen.getByRole("button", { name: "보류 중" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "보류 중" }));
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
    expect(screen.queryByRole("link", { name: "일정 확인 자세히 보기" })).not.toBeInTheDocument();
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
    expect(within(ledger).getByText("현재 일정 확인 1/2")).toBeVisible();
    expect(screen.getByRole("link", { name: "일정 미확인 멤버 검토" })).toHaveAttribute(
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
    expect(screen.getByRole("region", { name: "다음에 할 일" })).toHaveTextContent("실제 출석 확인");
    const ledger = screen.getByRole("region", { name: "준비 현황" });
    expect(within(ledger).getAllByRole("listitem")).toHaveLength(4);
    expect(within(ledger).getByText("현재 일정 확인 1/2")).toBeVisible();
    expect(screen.getByRole("link", { name: "모임 정보" })).toHaveAttribute(
      "href",
      "/clubs/reading-sai/app/host/sessions/session-7?section=basic",
    );
    expect(screen.getByRole("link", { name: "일정 편집" })).toHaveAttribute(
      "href",
      "/clubs/reading-sai/app/host/sessions/session-7?section=basic&edit=1",
    );
    expect(screen.getByRole("link", { name: "멤버 시야" })).toHaveAttribute(
      "href",
      "/clubs/reading-sai/app/sessions/session-7",
    );
    expect(screen.getByRole("link", { name: "실제 출석 확인" })).toHaveAttribute(
      "href",
      "/clubs/reading-sai/app/host/sessions/session-7?section=attendance",
    );
    expect(within(ledger).getByRole("link", { name: "일정 확인 자세히 보기" })).toHaveAttribute(
      "href",
      "/clubs/reading-sai/app/host/sessions/session-7/schedule-review",
    );
  });

  it("changes phase through SPA navigation while preserving unrelated query and recovery state", async () => {
    const user = userEvent.setup();
    routeMocks.updateAttendance.mockRejectedValueOnce({ status: 409, code: "REVISION_CONFLICT" });
    routeMocks.detailRefetchData = meetingDetail;
    const { router } = renderRoute("/clubs/reading-sai/app/host?phase=live&from=notice");

    await user.click(await screen.findByRole("button", { name: /지후/ }));
    expect(await screen.findByRole("alert", { name: "출석 변경 충돌" })).toBeVisible();
    await user.click(screen.getByRole("tab", { name: /준비실/ }));

    await waitFor(() => {
      expect(router.state.location.search).toBe("?phase=prep&from=notice");
    });
    expect(router.state.historyAction).toBe("PUSH");
    expect(screen.getByRole("alert", { name: "출석 변경 충돌" })).toBeVisible();
  });

  it("keeps live attendance writes and the existing restore receipt flow in the operating room", async () => {
    const user = userEvent.setup();
    renderRoute("/clubs/reading-sai/app/host?phase=live");

    const attendance = await screen.findByRole("region", { name: "출석 확인" });
    await user.click(within(attendance).getByRole("button", { name: /지후/ }));
    expect(routeMocks.updateAttendance).toHaveBeenCalledWith({
      sessionId: "session-7",
      attendance: [{ membershipId: "member-1", attendanceStatus: "ATTENDED" }],
    });

    await user.click(await screen.findByRole("button", { name: "되돌리기" }));
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
    const checklist = screen.getByRole("region", { name: "장부 마감 체크리스트" });
    expect(checklist).toHaveTextContent("출석 확정");
    expect(checklist).toHaveTextContent("기록 초안");
    expect(screen.getByRole("link", { name: "기록 패키지 검토" })).toHaveAttribute(
      "href",
      "/clubs/reading-sai/app/host/sessions/session-7/edit?records=json",
    );
    expect(within(checklist).getByRole("link", { name: "확인하기" })).toHaveAttribute(
      "href",
      "/clubs/reading-sai/app/host/sessions/session-7?section=records",
    );
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

  it("preserves the intended attendance on 409, refetches exact detail, and offers comparison retry", async () => {
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
    renderRoute("/clubs/reading-sai/app/host?phase=live");

    await user.click(await screen.findByRole("button", { name: /지후/ }));

    const comparison = await screen.findByRole("alert", { name: "출석 변경 충돌" });
    expect(routeMocks.refetchDetail).toHaveBeenCalledTimes(1);
    expect(within(comparison).getByText("내가 선택한 값").nextElementSibling).toHaveTextContent("출석");
    expect(within(comparison).getByText("최신 값").nextElementSibling).toHaveTextContent("불참");

    await user.click(within(comparison).getByRole("button", { name: "내 선택으로 다시 저장" }));
    expect(routeMocks.updateAttendance).toHaveBeenLastCalledWith({
      sessionId: "session-7",
      attendance: [{ membershipId: "member-1", attendanceStatus: "ATTENDED" }],
    });
  });

  it("keeps an unknown attendance result reconcilable without blind retry", async () => {
    const user = userEvent.setup();
    routeMocks.updateAttendance.mockRejectedValueOnce(new HostMutationPendingError());
    routeMocks.detailRefetchData = meetingDetail;
    renderRoute("/clubs/reading-sai/app/host?phase=live");

    await user.click(await screen.findByRole("button", { name: /지후/ }));

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
    const user = userEvent.setup();
    routeMocks.updateAttendance.mockRejectedValueOnce({ status: 409, code: "REVISION_CONFLICT" });
    routeMocks.detailRefetchData = meetingDetail;
    renderRoute("/clubs/reading-sai/app/host?phase=live");
    await user.click(await screen.findByRole("button", { name: /지후/ }));
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
    const user = userEvent.setup();
    routeMocks.updateAttendance.mockRejectedValueOnce({ status: 409, code: "REVISION_CONFLICT" });
    routeMocks.detailRefetchData = meetingDetail;
    const { router } = renderRoute("/clubs/reading-sai/app/host?phase=live");

    await user.click(await screen.findByRole("button", { name: /지후/ }));
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

    await screen.findByRole("heading", { name: "여덟 번째 독서모임" });
    expect(screen.queryByRole("alert", { name: "출석 변경 충돌" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "내 선택으로 다시 저장" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /지후/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /민수/ }));
    expect(routeMocks.updateAttendance).toHaveBeenCalledTimes(1);
    expect(routeMocks.updateAttendance).toHaveBeenCalledWith({
      sessionId: "session-8",
      attendance: [{ membershipId: "member-8", attendanceStatus: "ATTENDED" }],
    });
  });
});
