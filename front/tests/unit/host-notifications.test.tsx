import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { LoaderFunctionArgs } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { hostNotificationsLoader } from "@/features/host/route/host-notifications-data";
import { HostNotificationsPage } from "@/features/host/ui/host-notifications-page";
import type {
  HostNotificationDeliveryItem,
  HostNotificationEventItem,
  HostNotificationSummary,
  HostSessionListItem,
  ManualNotificationConfirmRequest,
  ManualNotificationOptionsResponse,
  ManualNotificationPreviewRequest,
  ManualNotificationPreviewResponse,
  NotificationTestMailAuditItem,
} from "@/features/host/api/host-contracts";

const summary: HostNotificationSummary = {
  pending: 2,
  failed: 1,
  dead: 1,
  sentLast24h: 3,
  latestFailures: [],
};

const audit: NotificationTestMailAuditItem[] = [
  {
    id: "audit-1",
    recipientEmail: "t***@example.com",
    status: "SENT",
    lastError: null,
    createdAt: "2026-04-29T00:00:00Z",
  },
];

const pendingEvent: HostNotificationEventItem = {
  id: "event-1",
  eventType: "FEEDBACK_DOCUMENT_PUBLISHED",
  status: "PENDING",
  attemptCount: 1,
  createdAt: "2026-04-29T00:00:00Z",
  updatedAt: "2026-04-29T00:00:00Z",
};

const deadDelivery: HostNotificationDeliveryItem = {
  id: "notification-1",
  eventId: "event-1",
  channel: "EMAIL",
  status: "DEAD",
  recipientEmail: "m***@example.com",
  attemptCount: 5,
  updatedAt: "2026-04-29T00:00:00Z",
};

const manualOptionsFixture: ManualNotificationOptionsResponse = {
  session: {
    sessionId: "session-1",
    sessionNumber: 8,
    bookTitle: "Example Book",
    date: "2026-05-20",
    state: "OPEN",
    visibility: "MEMBER",
    feedbackDocumentUploaded: true,
  },
  templates: [
    {
      eventType: "SESSION_REMINDER_DUE",
      label: "모임 전날 리마인더",
      enabled: true,
      disabledReason: null,
      defaultAudience: "ALL_ACTIVE_MEMBERS",
      allowedAudiences: ["ALL_ACTIVE_MEMBERS", "SESSION_PARTICIPANTS"],
      defaultChannels: "BOTH",
    },
    {
      eventType: "FEEDBACK_DOCUMENT_PUBLISHED",
      label: "피드백 문서 등록",
      enabled: false,
      disabledReason: "피드백 문서를 먼저 등록해야 합니다.",
      defaultAudience: "CONFIRMED_ATTENDEES",
      allowedAudiences: ["CONFIRMED_ATTENDEES", "SESSION_PARTICIPANTS"],
      defaultChannels: "BOTH",
    },
  ],
  members: { items: [], nextCursor: null },
  recentDispatches: [],
};

const hostSessionOpen = {
  sessionId: "session-open",
  sessionNumber: 9,
  title: "9회차 모임",
  bookTitle: "돈의 심리학",
  bookAuthor: "모건 하우절",
  bookImageUrl: null,
  date: "2026-07-15",
  startTime: "20:00",
  endTime: "22:00",
  locationLabel: "온라인",
  state: "OPEN",
  visibility: "MEMBER",
} as const;

const hostSessionDraft = {
  ...hostSessionOpen,
  sessionId: "session-draft",
  sessionNumber: 10,
  title: "10회차 모임",
  bookTitle: "다음 책",
  date: "2026-08-19",
  state: "DRAFT",
} as const;

const hostSessionCurrent: HostSessionListItem = {
  ...hostSessionOpen,
  sessionId: "session-1",
  sessionNumber: 8,
  title: "8회차 모임",
  bookTitle: "Example Book",
  bookAuthor: "Example Author",
  date: "2026-05-20",
};

const manualDispatch = {
  manualDispatchId: "dispatch-1",
  eventId: "event-manual",
  source: "MANUAL",
  eventType: "SESSION_REMINDER_DUE",
  sessionId: "session-1",
  sessionNumber: 8,
  bookTitle: "Example Book",
  requestedChannels: "BOTH",
  audience: "ALL_ACTIVE_MEMBERS",
  resend: true,
  requestedBy: "h***@example.com",
  targetCount: 17,
  expectedInAppCount: 17,
  expectedEmailCount: 14,
  eventStatus: "PUBLISHED",
  createdAt: "2026-05-13T10:10:00Z",
} as const;

type ActionMock = ReturnType<typeof vi.fn>;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function renderPage({
  summaryData = summary,
  events = [pendingEvent],
  deliveries = [deadDelivery],
  auditItems = [],
  manualOptions = manualOptionsFixture,
  hostSessions = [hostSessionCurrent, hostSessionDraft],
  initialManualSelection = { sessionId: "session-1", eventType: null },
  onProcess = vi.fn().mockResolvedValue(undefined),
  onRetry = vi.fn().mockResolvedValue(undefined),
  onRestore = vi.fn().mockResolvedValue(undefined),
  onSendTestMail = vi.fn().mockResolvedValue(undefined),
  onPreviewManual = vi.fn().mockResolvedValue(undefined),
  onConfirmManual = vi.fn().mockResolvedValue(undefined),
  onLoadManualOptions = vi.fn().mockResolvedValue(manualOptions),
  onLoadMoreManualMembers = vi.fn().mockResolvedValue(manualOptions),
}: {
  summaryData?: HostNotificationSummary;
  events?: HostNotificationEventItem[];
  deliveries?: HostNotificationDeliveryItem[];
  auditItems?: NotificationTestMailAuditItem[];
  manualOptions?: ManualNotificationOptionsResponse;
  hostSessions?: HostSessionListItem[];
  initialManualSelection?: {
    sessionId: string | null;
    eventType: ManualNotificationOptionsResponse["templates"][number]["eventType"] | null;
  };
  onProcess?: ActionMock;
  onRetry?: ActionMock;
  onRestore?: ActionMock;
  onSendTestMail?: ActionMock;
  onPreviewManual?: (request: ManualNotificationPreviewRequest) => Promise<unknown>;
  onConfirmManual?: (request: ManualNotificationConfirmRequest) => Promise<unknown>;
  onLoadManualOptions?: (sessionId?: string, search?: string) => Promise<ManualNotificationOptionsResponse>;
  onLoadMoreManualMembers?: () => Promise<ManualNotificationOptionsResponse>;
} = {}) {
  render(
    <HostNotificationsPage
      summary={summaryData}
      events={events}
      deliveries={deliveries}
      audit={auditItems}
      hostSessions={hostSessions}
      manualOptions={manualOptions}
      initialManualSelection={initialManualSelection}
      onProcess={onProcess}
      onRetry={onRetry}
      onRestore={onRestore}
      onSendTestMail={onSendTestMail}
      onPreviewManual={onPreviewManual}
      onConfirmManual={onConfirmManual}
      onLoadManualOptions={onLoadManualOptions}
      onLoadMoreManualMembers={onLoadMoreManualMembers}
    />,
  );

  return { onProcess, onRetry, onRestore, onSendTestMail, onPreviewManual, onConfirmManual };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("hostNotificationsLoader", () => {
  it("loads manual options for the first open host session when the URL has no session id", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = input.toString();
      if (url === "/api/bff/api/auth/me?clubSlug=reading-sai") {
        return Promise.resolve(jsonResponse({
          authenticated: true,
          userId: "user-host",
          membershipId: "membership-host",
          clubId: "club-1",
          email: "host@example.com",
          displayName: "호스트",
          accountName: "호",
          role: "HOST",
          membershipStatus: "ACTIVE",
          approvalState: "ACTIVE",
        }));
      }
      if (url === "/api/bff/api/host/notifications/summary?clubSlug=reading-sai") return Promise.resolve(jsonResponse(summary));
      if (url === "/api/bff/api/host/notifications/events?limit=50&clubSlug=reading-sai") return Promise.resolve(jsonResponse({ items: [], nextCursor: null }));
      if (url === "/api/bff/api/host/notifications/deliveries?limit=50&clubSlug=reading-sai") return Promise.resolve(jsonResponse({ items: [], nextCursor: null }));
      if (url === "/api/bff/api/host/notifications/test-mail/audit?limit=50&clubSlug=reading-sai") return Promise.resolve(jsonResponse({ items: [], nextCursor: null }));
      if (url === "/api/bff/api/host/sessions?clubSlug=reading-sai") {
        return Promise.resolve(jsonResponse({ items: [hostSessionDraft, hostSessionOpen], nextCursor: null }));
      }
      if (url === "/api/bff/api/host/notifications/manual/options?sessionId=session-open&clubSlug=reading-sai") {
        return Promise.resolve(jsonResponse({ ...manualOptionsFixture, session: { ...manualOptionsFixture.session, sessionId: "session-open" } }));
      }
      if (url === "/api/bff/api/host/notifications/manual/dispatches?limit=20&clubSlug=reading-sai") {
        return Promise.resolve(jsonResponse({ items: [], nextCursor: null }));
      }
      return Promise.reject(new Error(`Unexpected URL: ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(hostNotificationsLoader({
      params: { clubSlug: "reading-sai" },
      request: new Request("https://readmates.test/clubs/reading-sai/app/host/notifications"),
    } as LoaderFunctionArgs)).resolves.toMatchObject({
      hostSessions: { items: [hostSessionDraft, hostSessionOpen], nextCursor: null },
      initialManualSelection: { sessionId: "session-open", eventType: null },
    });
  });

  it("falls back from an unknown URL session id before loading manual options", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = input.toString();
      if (url === "/api/bff/api/auth/me?clubSlug=reading-sai") {
        return Promise.resolve(jsonResponse({
          authenticated: true,
          userId: "user-host",
          membershipId: "membership-host",
          clubId: "club-1",
          email: "host@example.com",
          displayName: "호스트",
          accountName: "호",
          role: "HOST",
          membershipStatus: "ACTIVE",
          approvalState: "ACTIVE",
        }));
      }
      if (url === "/api/bff/api/host/notifications/summary?clubSlug=reading-sai") return Promise.resolve(jsonResponse(summary));
      if (url === "/api/bff/api/host/notifications/events?limit=50&clubSlug=reading-sai") return Promise.resolve(jsonResponse({ items: [], nextCursor: null }));
      if (url === "/api/bff/api/host/notifications/deliveries?limit=50&clubSlug=reading-sai") return Promise.resolve(jsonResponse({ items: [], nextCursor: null }));
      if (url === "/api/bff/api/host/notifications/test-mail/audit?limit=50&clubSlug=reading-sai") return Promise.resolve(jsonResponse({ items: [], nextCursor: null }));
      if (url === "/api/bff/api/host/sessions?clubSlug=reading-sai") {
        return Promise.resolve(jsonResponse({ items: [hostSessionOpen], nextCursor: null }));
      }
      if (url === "/api/bff/api/host/notifications/manual/options?sessionId=session-open&clubSlug=reading-sai") {
        return Promise.resolve(jsonResponse({ ...manualOptionsFixture, session: { ...manualOptionsFixture.session, sessionId: "session-open" } }));
      }
      if (url === "/api/bff/api/host/notifications/manual/dispatches?limit=20&clubSlug=reading-sai") {
        return Promise.resolve(jsonResponse({ items: [], nextCursor: null }));
      }
      return Promise.reject(new Error(`Unexpected URL: ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    await hostNotificationsLoader({
      params: { clubSlug: "reading-sai" },
      request: new Request("https://readmates.test/clubs/reading-sai/app/host/notifications?sessionId=missing"),
    } as LoaderFunctionArgs);

    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining("sessionId=missing"),
      expect.anything(),
    );
  });
});

describe("HostNotificationsPage", () => {
  it("renders manual notification workbench before ledgers", () => {
    renderPage({
      manualOptions: {
        templates: [
          {
            eventType: "SESSION_REMINDER_DUE",
            label: "모임 전날 리마인더",
            enabled: true,
            disabledReason: null,
            defaultAudience: "ALL_ACTIVE_MEMBERS",
            allowedAudiences: ["ALL_ACTIVE_MEMBERS", "SESSION_PARTICIPANTS"],
            defaultChannels: "BOTH",
          },
        ],
        members: { items: [], nextCursor: null },
        session: null,
        recentDispatches: [],
      },
    });

    expect(screen.getByRole("heading", { name: "새 알림 발송" })).toBeInTheDocument();
    expect(screen.getByText("모임 전날 리마인더")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "운영 장부" })).toBeInTheDocument();
  });

  it("renders recent manual dispatches and source metadata", () => {
    renderPage({
      manualOptions: {
        ...manualOptionsFixture,
        recentDispatches: [manualDispatch],
      } as ManualNotificationOptionsResponse,
      events: [
        {
          ...pendingEvent,
          id: "event-manual",
          eventType: "SESSION_REMINDER_DUE",
          source: "MANUAL",
          manualDispatch: {
            manualDispatchId: "dispatch-1",
            requestedChannels: "BOTH",
            audience: "ALL_ACTIVE_MEMBERS",
            resend: true,
            requestedBy: "h***@example.com",
            targetCount: 17,
            expectedInAppCount: 17,
            expectedEmailCount: 14,
          },
        } as HostNotificationEventItem,
      ],
    });

    expect(screen.getByRole("heading", { name: "최근 수동 발송" })).toBeInTheDocument();
    expect(screen.getAllByText("앱+이메일").length).toBeGreaterThan(0);
    expect(screen.getAllByText("수동").length).toBeGreaterThan(0);
  });

  it("renders a session selector instead of a raw session id field", () => {
    renderPage();

    expect(screen.getByLabelText("세션 선택")).toHaveValue("session-1");
    expect(screen.queryByLabelText("세션 ID")).not.toBeInTheDocument();
    expect(screen.getByText("Example Book")).toBeInTheDocument();
    expect(screen.getByText(/OPEN/)).toBeInTheDocument();
  });

  it("disables manual preview when there are no host sessions", () => {
    renderPage({
      hostSessions: [],
      manualOptions: { ...manualOptionsFixture, session: null },
      initialManualSelection: { sessionId: null, eventType: null },
    });

    expect(screen.getByText("선택 가능한 세션이 없습니다.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "미리보기" })).toBeDisabled();
  });

  it("reloads manual options when the host changes the selected session", async () => {
    const user = userEvent.setup();
    const nextOptions = {
      ...manualOptionsFixture,
      session: {
        ...manualOptionsFixture.session!,
        sessionId: "session-draft",
        sessionNumber: 10,
        bookTitle: "다음 책",
        date: "2026-08-19",
        state: "DRAFT",
      },
    } as ManualNotificationOptionsResponse;
    const onLoadManualOptions = vi.fn().mockResolvedValue(nextOptions);

    renderPage({ onLoadManualOptions });

    await user.selectOptions(screen.getByLabelText("세션 선택"), "session-draft");

    expect(onLoadManualOptions).toHaveBeenCalledWith("session-draft", undefined);
    expect(await screen.findByText("다음 책")).toBeInTheDocument();
  });

  it("shows an inline error when changing sessions cannot reload manual options", async () => {
    const user = userEvent.setup();
    const onLoadManualOptions = vi.fn().mockRejectedValue(new Error("network failed"));

    renderPage({ onLoadManualOptions });

    await user.selectOptions(screen.getByLabelText("세션 선택"), "session-draft");

    expect(await screen.findByRole("alert")).toHaveTextContent("세션 정보를 불러오지 못했습니다.");
  });

  it("searches manual notification members and loads more", async () => {
    const user = userEvent.setup();
    const searchedOptions = {
      ...manualOptionsFixture,
      members: {
        items: [],
        nextCursor: "cursor-2",
      },
    } as ManualNotificationOptionsResponse;
    const nextOptions = {
      ...manualOptionsFixture,
      members: {
        items: [
          {
            membershipId: "member-2",
            displayName: "추가 멤버 이름",
            maskedEmail: "m***@example.com",
            role: "MEMBER",
            membershipStatus: "ACTIVE",
            sessionParticipationStatus: "ACTIVE",
            attendanceStatus: null,
            emailEligibility: "ELIGIBLE",
            inAppEligibility: "ELIGIBLE",
          },
        ],
        nextCursor: null,
      },
    } as ManualNotificationOptionsResponse;
    const onLoadManualOptions = vi.fn().mockResolvedValue(searchedOptions);
    const onLoadMoreManualMembers = vi.fn().mockResolvedValue(nextOptions);

    renderPage({
      manualOptions: {
        ...manualOptionsFixture,
        members: { items: [], nextCursor: "cursor-1" },
      },
      onLoadManualOptions,
      onLoadMoreManualMembers,
    });

    await user.type(screen.getByRole("searchbox", { name: "멤버 검색" }), "김");
    await user.click(screen.getByRole("button", { name: "검색" }));
    expect(onLoadManualOptions).toHaveBeenCalledWith("session-1", "김");

    await user.click(screen.getByRole("button", { name: "멤버 더 보기" }));
    expect(onLoadMoreManualMembers).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("추가 멤버 이름")).toBeInTheDocument();
  });

  it("previews and confirms a manual notification with resend confirmation", async () => {
    const user = userEvent.setup();
    const onPreviewManual = vi.fn<[ManualNotificationPreviewRequest], Promise<ManualNotificationPreviewResponse>>().mockResolvedValue({
      previewId: "preview-1",
      expiresAt: "2026-05-13T09:10:00Z",
      template: {
        eventType: "SESSION_REMINDER_DUE",
        label: "모임 전날 리마인더",
        subject: "모임 전날 리마인더",
        bodyPreview: "모임 전 준비를 확인해 주세요.",
      },
      audience: {
        baseGroup: "ALL_ACTIVE_MEMBERS",
        baseCount: 3,
        excludedCount: 0,
        includedCount: 0,
        finalTargetCount: 3,
      },
      channels: {
        requested: "BOTH",
        inAppEligibleCount: 3,
        emailEligibleCount: 2,
        emailSkippedByPreferenceCount: 1,
        emailMissingCount: 0,
      },
      duplicates: {
        requiresResendConfirmation: true,
        recentDispatches: [
          {
            manualDispatchId: "dispatch-1",
            eventType: "SESSION_REMINDER_DUE",
            requestedChannels: "BOTH",
            createdAt: "2026-05-12T09:00:00Z",
            requestedBy: "h***@example.com",
            targetCount: 3,
          },
        ],
      },
      warnings: [{ code: "EMAIL_PREFERENCE_SKIPS", message: "이메일 알림 설정 때문에 1명에게는 이메일이 가지 않습니다." }],
    });
    const onConfirmManual = vi.fn<[ManualNotificationConfirmRequest], Promise<void>>().mockResolvedValue(undefined);

    renderPage({ onPreviewManual, onConfirmManual, manualOptions: manualOptionsFixture });

    await user.click(screen.getByRole("button", { name: "모임 전날 리마인더" }));
    await user.click(screen.getByRole("button", { name: "미리보기" }));

    expect(await screen.findByText("앱 알림 3명")).toBeInTheDocument();
    expect(screen.getByText("이메일 2명")).toBeInTheDocument();
    const previewPanel = screen.getByRole("heading", { name: "발송 전 확인" }).closest("section");
    expect(previewPanel).not.toBeNull();
    expect(within(previewPanel as HTMLElement).getByText("모임 전날 리마인더")).toBeInTheDocument();
    expect(within(previewPanel as HTMLElement).getByText("모임 전 준비를 확인해 주세요.")).toBeInTheDocument();
    expect(screen.getByText("이미 발송된 알림입니다.")).toBeInTheDocument();

    const confirm = screen.getByRole("button", { name: "발송 확인" });
    expect(confirm).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: "재발송을 확인했습니다" }));
    await user.click(confirm);

    expect(onConfirmManual).toHaveBeenCalledWith(expect.objectContaining({ previewId: "preview-1", resendConfirmed: true }));
  });

  it("renders event and delivery operation ledgers", async () => {
    const user = userEvent.setup();

    renderPage();

    expect(screen.getByRole("tab", { name: "이벤트" })).toBeInTheDocument();
    expect(screen.getByText("Kafka 발행 대기")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "배송" }));

    expect(screen.getByText("EMAIL")).toBeInTheDocument();
  });

  it("renders notification ledger and restores a dead item after confirmation", async () => {
    const user = userEvent.setup();
    const onRestore = vi.fn().mockResolvedValue(undefined);

    renderPage({ onRestore });

    expect(screen.getByText("알림 발송 장부")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "배송" }));
    expect(screen.getByText("m***@example.com")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "복구" }));
    await user.click(screen.getByRole("button", { name: "복구 확인" }));

    expect(onRestore).toHaveBeenCalledWith("notification-1");
  });

  it("retries pending and failed notifications only", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn().mockResolvedValue(undefined);
    const pendingItem: HostNotificationDeliveryItem = { ...deadDelivery, id: "notification-2", status: "PENDING" };
    const sentItem: HostNotificationDeliveryItem = { ...deadDelivery, id: "notification-3", status: "SENT" };

    renderPage({ deliveries: [pendingItem, sentItem], onRetry });
    await user.click(screen.getByRole("tab", { name: "배송" }));

    await user.click(screen.getByRole("button", { name: "재시도" }));

    expect(onRetry).toHaveBeenCalledWith("notification-2");
    const sentRow = screen.getByText("SENT").closest("article");
    expect(sentRow).not.toBeNull();
    expect(within(sentRow as HTMLElement).queryByRole("button", { name: "재시도" })).not.toBeInTheDocument();
  });

  it("processes pending and failed notifications", async () => {
    const user = userEvent.setup();
    const onProcess = vi.fn().mockResolvedValue(undefined);

    renderPage({ onProcess });

    await user.click(screen.getByRole("button", { name: "대기/실패 처리" }));

    expect(onProcess).toHaveBeenCalledTimes(1);
  });

  it("does not process notifications when there are no pending or failed items", async () => {
    const user = userEvent.setup();
    const onProcess = vi.fn().mockResolvedValue(undefined);

    render(
      <HostNotificationsPage
        summary={{ ...summary, pending: 0, failed: 0 }}
        events={[]}
        deliveries={[]}
        audit={[]}
        manualOptions={manualOptionsFixture}
        initialManualSelection={{ sessionId: "session-1", eventType: null }}
        onProcess={onProcess}
        onRetry={vi.fn()}
        onRestore={vi.fn()}
        onSendTestMail={vi.fn()}
        onPreviewManual={vi.fn().mockResolvedValue(undefined)}
        onConfirmManual={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    const processButton = screen.getByRole("button", { name: "처리할 알림 없음" });
    expect(processButton).toBeDisabled();

    await user.click(processButton);

    expect(onProcess).not.toHaveBeenCalled();
  });

  it("keeps processing available when a pending item is visible even if the summary is stale", async () => {
    const user = userEvent.setup();
    const onProcess = vi.fn().mockResolvedValue(undefined);
    const pendingItem: HostNotificationDeliveryItem = { ...deadDelivery, id: "notification-2", status: "PENDING" };

    render(
      <HostNotificationsPage
        summary={{ ...summary, pending: 0, failed: 0 }}
        events={[]}
        deliveries={[pendingItem]}
        audit={[]}
        manualOptions={manualOptionsFixture}
        initialManualSelection={{ sessionId: "session-1", eventType: null }}
        onProcess={onProcess}
        onRetry={vi.fn()}
        onRestore={vi.fn()}
        onSendTestMail={vi.fn()}
        onPreviewManual={vi.fn().mockResolvedValue(undefined)}
        onConfirmManual={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    await user.click(screen.getByRole("button", { name: "대기/실패 처리" }));

    expect(onProcess).toHaveBeenCalledTimes(1);
  });

  it("keeps processing available when a pending event is visible even if the summary is stale", async () => {
    const user = userEvent.setup();
    const onProcess = vi.fn().mockResolvedValue(undefined);

    renderPage({
      summaryData: { ...summary, pending: 0, failed: 0 },
      events: [pendingEvent],
      deliveries: [],
      onProcess,
    });

    await user.click(screen.getByRole("button", { name: "대기/실패 처리" }));

    expect(onProcess).toHaveBeenCalledTimes(1);
  });

  it("keeps notification operations disabled while route data is refreshing", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn().mockResolvedValue(undefined);
    const pendingItem: HostNotificationDeliveryItem = { ...deadDelivery, id: "notification-2", status: "FAILED" };

    render(
      <HostNotificationsPage
        summary={summary}
        events={[pendingEvent]}
        deliveries={[pendingItem]}
        audit={[]}
        manualOptions={manualOptionsFixture}
        initialManualSelection={{ sessionId: "session-1", eventType: null }}
        isRefreshing
        onProcess={vi.fn()}
        onRetry={onRetry}
        onRestore={vi.fn()}
        onSendTestMail={vi.fn()}
        onPreviewManual={vi.fn().mockResolvedValue(undefined)}
        onConfirmManual={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.getByRole("button", { name: "새로고침 중" })).toBeDisabled();
    await user.click(screen.getByRole("tab", { name: "배송" }));
    const retryButton = screen.getByRole("button", { name: "재시도" });
    expect(retryButton).toBeDisabled();

    await user.click(retryButton);

    expect(onRetry).not.toHaveBeenCalled();
  });

  it("shows restore failures inside the active confirmation dialog", async () => {
    const user = userEvent.setup();
    const onRestore = vi.fn().mockRejectedValue(new Error("restore failed"));

    renderPage({ onRestore });

    await user.click(screen.getByRole("tab", { name: "배송" }));
    await user.click(screen.getByRole("button", { name: "복구" }));
    await user.click(screen.getByRole("button", { name: "복구 확인" }));

    const dialog = screen.getByRole("dialog", { name: "중단된 알림을 복구할까요?" });
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "복구하지 못했습니다. 목록을 새로고침한 뒤 다시 시도해 주세요.",
    );
  });

  it("sends a test mail request and renders masked audit rows", async () => {
    const user = userEvent.setup();
    const onSendTestMail = vi.fn().mockResolvedValue(undefined);

    renderPage({ auditItems: audit, onSendTestMail });

    await user.type(screen.getByLabelText("테스트 메일 주소"), "test@example.com");
    await user.click(screen.getByRole("button", { name: "테스트 발송" }));

    expect(onSendTestMail).toHaveBeenCalledWith({ recipientEmail: "test@example.com" });
    expect(screen.getByText("t***@example.com")).toBeInTheDocument();
  });
});
