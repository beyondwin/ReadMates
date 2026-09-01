import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PropsWithChildren, type ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  HostSessionDetailResponse,
  ManualNotificationConfirmResponse,
  ManualNotificationOptionsResponse,
  ManualNotificationPreviewResponse,
} from "@/features/host/api/host-contracts";
import { ReadmatesTransportError } from "@/shared/api/errors";
import type { PendingHandle, PendingRegistration, TransitionSafetyRegistrationPort } from "@/shared/model/global-space";
import { SpaceTransitionSafetyProvider } from "@/shared/ui/space-transition-safety-context";
import { createGlobalSpaceTransitionCoordinator } from "@/src/app/global-space-transition";

vi.mock("@/features/host/api/host-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/host/api/host-api")>()),
  fetchHostSessionDetail: vi.fn(),
  fetchManualNotificationOptions: vi.fn(),
  previewManualNotification: vi.fn(),
  confirmManualNotification: vi.fn(),
}));

import {
  confirmManualNotification,
  fetchHostSessionDetail,
  fetchManualNotificationOptions,
  previewManualNotification,
} from "@/features/host/api/host-api";
import { hostNotificationKeys } from "@/features/host/queries/host-notification-queries";
import { hostSessionKeys } from "@/features/host/queries/host-session-queries";
import { hostWorkboxKeys } from "@/features/host/queries/host-workbox-queries";
import { HostScheduleReviewRoute } from "./host-schedule-review-route";

const contentRevision = "a".repeat(64);
const context = { clubSlug: "reading-sai" } as const;

const detail: HostSessionDetailResponse = {
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
  date: "2026-09-07",
  startTime: "19:30",
  endTime: "21:30",
  questionDeadlineAt: "2026-09-06T14:59:00Z",
  visibility: "MEMBER",
  publication: null,
  state: "OPEN",
  scheduleRevision: 7,
  scheduleSeenAvailability: "AVAILABLE",
  scheduleSeenSummary: { currentCount: 1, staleCount: 1, unseenCount: 1, eligibleCount: 3 },
  versions: {
    sessionRevision: 4,
    scheduleRevision: 7,
    exposureRevision: 2,
    participantSetRevision: 3,
    recordDraftRevision: null,
    liveRecordRevision: null,
    publicationRevision: 0,
  },
  attendanceSnapshotId: "attendance-snapshot-7",
  attendees: [
    attendee("member-current", "현재 확인", "CURRENT", 7),
    attendee("member-stale", "변경 전 확인", "STALE", 6),
    attendee("member-unseen", "미열람", "UNSEEN", null),
  ],
  feedbackDocument: { uploaded: false, fileName: null, uploadedAt: null },
};

function attendee(
  membershipId: string,
  displayName: string,
  scheduleSeenState: "CURRENT" | "STALE" | "UNSEEN",
  seenScheduleRevision: number | null,
): HostSessionDetailResponse["attendees"][number] {
  return {
    membershipId,
    avatarKey: "reader-book",
    displayName,
    accountName: membershipId,
    rsvpStatus: "NO_RESPONSE",
    attendanceStatus: "UNKNOWN",
    participationStatus: "ACTIVE",
    attendanceRevision: 1,
    seenScheduleRevision,
    scheduleSeenAt: seenScheduleRevision === null ? null : "2026-08-29T12:00:00Z",
    scheduleSeenState,
  };
}

const options: ManualNotificationOptionsResponse = {
  session: {
    sessionId: detail.sessionId,
    sessionNumber: detail.sessionNumber,
    bookTitle: detail.bookTitle,
    date: detail.date,
    state: detail.state,
    visibility: detail.visibility,
    feedbackDocumentUploaded: false,
    scheduleRevision: detail.scheduleRevision,
  },
  templates: [{
    eventType: "SESSION_REMINDER_DUE",
    contentRevision,
    label: "일정 변경 알림",
    enabled: true,
    disabledReason: null,
    defaultAudience: "SELECTED_MEMBERS",
    allowedAudiences: ["SELECTED_MEMBERS"],
    defaultChannels: "BOTH",
    defaultSubject: "변경된 모임 일정을 확인해 주세요",
    defaultBody: "새 일정을 확인해 주세요.",
  }],
  members: { items: [], nextCursor: null },
  recentDispatches: [],
};

const preview: ManualNotificationPreviewResponse = {
  previewId: "preview-7",
  expiresAt: "2026-08-30T10:00:00Z",
  scheduleRevision: 7,
  targetSnapshotHash: "b".repeat(64),
  contentHash: "c".repeat(64),
  template: {
    eventType: "SESSION_REMINDER_DUE",
    label: "일정 변경 알림",
    subject: options.templates[0].defaultSubject,
    bodyPreview: options.templates[0].defaultBody,
  },
  audience: {
    baseGroup: "SELECTED_MEMBERS",
    baseCount: 2,
    excludedCount: 0,
    includedCount: 0,
    finalTargetCount: 2,
  },
  channels: {
    requested: "BOTH",
    inAppEligibleCount: 2,
    emailEligibleCount: 1,
    emailSkippedByPreferenceCount: 1,
    emailMissingCount: 0,
  },
  duplicates: { requiresResendConfirmation: false, recentDispatches: [] },
  warnings: [],
};

const confirmed: ManualNotificationConfirmResponse = {
  manualDispatchId: "dispatch-7",
  eventId: "event-7",
  status: "PUBLISHED",
  createdAt: "2026-08-30T09:10:00Z",
  summary: {
    targetCount: 2,
    requestedChannels: "BOTH",
    expectedInAppCount: 2,
    expectedEmailCount: 1,
  },
};

function renderRoute(transitionPort?: TransitionSafetyRegistrationPort) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  function Wrapper({ children }: PropsWithChildren) {
    const content: ReactNode = transitionPort
      ? <SpaceTransitionSafetyProvider port={transitionPort}>{children}</SpaceTransitionSafetyProvider>
      : children;
    return <QueryClientProvider client={client}>{content}</QueryClientProvider>;
  }
  render(
    <Routes>
      <Route
        path="/clubs/:clubSlug/app/host/sessions/:sessionId/schedule-review"
        element={<HostScheduleReviewRoute />}
      />
    </Routes>,
    {
      wrapper: ({ children }) => (
        <Wrapper>
          <MemoryRouter initialEntries={["/clubs/reading-sai/app/host/sessions/session-7/schedule-review"]}>
            {children}
          </MemoryRouter>
        </Wrapper>
      ),
    },
  );
  return client;
}

beforeEach(() => {
  vi.mocked(fetchHostSessionDetail).mockReset().mockResolvedValue(detail);
  vi.mocked(fetchManualNotificationOptions).mockReset().mockResolvedValue(options);
  vi.mocked(previewManualNotification).mockReset().mockResolvedValue(preview);
  vi.mocked(confirmManualNotification).mockReset().mockResolvedValue(confirmed);
});

describe("HostScheduleReviewRoute", () => {
  it("shows all attendees, selects only STALE and UNSEEN, and sends nothing on open/select/edit", async () => {
    renderRoute();

    expect(await screen.findByRole("checkbox", { name: /현재 확인/ })).toBeDisabled();
    expect(screen.getByRole("heading", { name: "일정 미열람 검토" })).toBeVisible();
    expect(screen.getByRole("checkbox", { name: /현재 확인/ })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: /변경 전 확인/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /미열람/ })).toBeChecked();

    await userEvent.click(screen.getByRole("checkbox", { name: /변경 전 확인/ }));
    await userEvent.clear(screen.getByRole("textbox", { name: "알림 제목" }));
    await userEvent.type(screen.getByRole("textbox", { name: "알림 제목" }), "새 제목");

    expect(previewManualNotification).not.toHaveBeenCalled();
    expect(confirmManualNotification).not.toHaveBeenCalled();
  });

  it("previews the exact snapshot-bound Task 2 selection and invalidates it after edits", async () => {
    renderRoute();
    await screen.findByRole("heading", { name: "일정 미열람 검토" });

    await userEvent.click(screen.getByRole("button", { name: "알림 미리보기" }));
    await waitFor(() => expect(previewManualNotification).toHaveBeenCalledWith({
      sessionId: "session-7",
      eventType: "SESSION_REMINDER_DUE",
      contentRevision,
      audience: "SELECTED_MEMBERS",
      requestedChannels: "BOTH",
      selectedMembershipIds: ["member-stale", "member-unseen"],
      excludedMembershipIds: [],
      includedMembershipIds: [],
      sendMode: "NOW",
      scheduleRevision: 7,
      subject: "변경된 모임 일정을 확인해 주세요",
      body: "새 일정을 확인해 주세요.",
    }, context));
    expect(await screen.findByRole("region", { name: "발송 전 확인" })).toBeVisible();

    await userEvent.type(screen.getByRole("textbox", { name: "알림 본문" }), " 수정");
    expect(screen.queryByRole("region", { name: "발송 전 확인" })).not.toBeInTheDocument();
    expect(confirmManualNotification).not.toHaveBeenCalled();
  });

  it("confirms only the current preview, preserves a durable partial receipt, and invalidates scoped caches", async () => {
    const client = renderRoute();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    await screen.findByRole("heading", { name: "일정 미열람 검토" });

    await userEvent.click(screen.getByRole("button", { name: "알림 미리보기" }));
    await userEvent.click(await screen.findByRole("button", { name: "2명에게 알림 발송" }));

    await waitFor(() => expect(confirmManualNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        previewId: "preview-7",
        resendConfirmed: false,
        selectedMembershipIds: ["member-stale", "member-unseen"],
        scheduleRevision: 7,
      }),
      context,
    ));
    expect(await screen.findByRole("status", { name: "일정 알림 · 일부 완료" })).toBeVisible();
    expect(screen.queryByRole("button", { name: /알림 발송/ })).not.toBeInTheDocument();

    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: hostWorkboxKeys.scope(context) });
      expect(invalidate).toHaveBeenCalledWith({ queryKey: hostNotificationKeys.manual(context) });
      expect(invalidate).toHaveBeenCalledWith({ queryKey: hostSessionKeys.detail("session-7", context) });
      expect(invalidate).toHaveBeenCalledWith({ queryKey: hostSessionKeys.operatingRoomCurrent(context) });
    });
  });

  it("fails closed when schedule-seen authority is unavailable", async () => {
    vi.mocked(fetchHostSessionDetail).mockResolvedValue({
      ...detail,
      scheduleSeenAvailability: "UNAVAILABLE",
      scheduleSeenSummary: { currentCount: null, staleCount: null, unseenCount: null, eligibleCount: null },
    });
    renderRoute();

    expect(await screen.findByRole("alert")).toHaveTextContent("일정 확인 상태를 사용할 수 없습니다");
    expect(screen.queryByRole("button", { name: "알림 미리보기" })).not.toBeInTheDocument();
    expect(fetchManualNotificationOptions).not.toHaveBeenCalled();
    expect(previewManualNotification).not.toHaveBeenCalled();
  });

  it("fails closed when exact detail does not match the URL session", async () => {
    vi.mocked(fetchHostSessionDetail).mockResolvedValue({ ...detail, sessionId: "different-session" });
    renderRoute();

    expect(await screen.findByRole("alert")).toHaveTextContent("현재 일정과 일치하는 알림 템플릿을 사용할 수 없습니다");
    expect(screen.queryByRole("button", { name: "알림 미리보기" })).not.toBeInTheDocument();
    expect(previewManualNotification).not.toHaveBeenCalled();
    expect(confirmManualNotification).not.toHaveBeenCalled();
  });

  it("recovers stale authority by refreshing exact evidence while retaining the draft and never resending", async () => {
    vi.mocked(confirmManualNotification).mockRejectedValueOnce({ code: "MANUAL_NOTIFICATION_PREVIEW_STALE", status: 409 });
    renderRoute();
    await screen.findByRole("heading", { name: "일정 미열람 검토" });
    await userEvent.clear(screen.getByRole("textbox", { name: "알림 제목" }));
    await userEvent.type(screen.getByRole("textbox", { name: "알림 제목" }), "보존할 제목");
    await userEvent.click(screen.getByRole("button", { name: "알림 미리보기" }));
    await userEvent.click(await screen.findByRole("button", { name: "2명에게 알림 발송" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("최신 정보로 새 미리보기를 만들어 주세요");
    expect(screen.getByRole("textbox", { name: "알림 제목" })).toHaveValue("보존할 제목");
    expect(screen.queryByRole("region", { name: "발송 전 확인" })).not.toBeInTheDocument();
    expect(confirmManualNotification).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(fetchHostSessionDetail).toHaveBeenCalledTimes(2));
  });

  it.each([
    "MANUAL_NOTIFICATION_PREVIEW_EXPIRED",
    "MANUAL_NOTIFICATION_PREVIEW_NOT_FOUND",
    "MANUAL_NOTIFICATION_PREVIEW_REUSED",
    "MANUAL_NOTIFICATION_SELECTION_INVALID",
    "MANUAL_NOTIFICATION_COPY_INVALID",
    "DUPLICATE_NOTIFICATION_DISPATCH",
  ])("clears the non-current preview after %s", async (code) => {
    vi.mocked(confirmManualNotification).mockRejectedValueOnce({ code, status: 409 });
    renderRoute();
    await screen.findByRole("heading", { name: "일정 미열람 검토" });
    await userEvent.click(screen.getByRole("button", { name: "알림 미리보기" }));
    await userEvent.click(await screen.findByRole("button", { name: "2명에게 알림 발송" }));

    expect(await screen.findByRole("alert")).toBeVisible();
    expect(screen.queryByRole("region", { name: "발송 전 확인" })).not.toBeInTheDocument();
    expect(confirmManualNotification).toHaveBeenCalledTimes(1);
  });

  it.each([
    "MANUAL_NOTIFICATION_PREVIEW_STALE",
    "MANUAL_NOTIFICATION_CONTENT_STALE",
    "MANUAL_NOTIFICATION_STATE_INVALID",
    "MANUAL_NOTIFICATION_RECIPIENTS_CHANGED",
    "MANUAL_NOTIFICATION_RECIPIENT_INVALID",
    "MANUAL_NOTIFICATION_AUDIENCE_EMPTY",
    "MANUAL_NOTIFICATION_TEMPLATE_UNAVAILABLE",
  ])("refreshes exact authority before re-enabling after %s", async (code) => {
    vi.mocked(confirmManualNotification).mockRejectedValueOnce({ code, status: 409 });
    renderRoute();
    await screen.findByRole("heading", { name: "일정 미열람 검토" });
    await userEvent.clear(screen.getByRole("textbox", { name: "알림 제목" }));
    await userEvent.type(screen.getByRole("textbox", { name: "알림 제목" }), "보존할 제목");
    await userEvent.click(screen.getByRole("button", { name: "알림 미리보기" }));
    await userEvent.click(await screen.findByRole("button", { name: "2명에게 알림 발송" }));

    await waitFor(() => expect(fetchHostSessionDetail).toHaveBeenCalledTimes(2));
    expect(fetchManualNotificationOptions).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("textbox", { name: "알림 제목" })).toHaveValue("보존할 제목");
    expect(screen.queryByRole("region", { name: "발송 전 확인" })).not.toBeInTheDocument();
  });

  it("keeps the composer fail-closed until both exact authority refetches recover", async () => {
    vi.mocked(confirmManualNotification).mockRejectedValueOnce({
      code: "MANUAL_NOTIFICATION_RECIPIENTS_CHANGED",
      status: 409,
    });
    renderRoute();
    await screen.findByRole("heading", { name: "일정 미열람 검토" });
    await userEvent.clear(screen.getByRole("textbox", { name: "알림 제목" }));
    await userEvent.type(screen.getByRole("textbox", { name: "알림 제목" }), "보존할 제목");
    await userEvent.click(screen.getByRole("button", { name: "알림 미리보기" }));
    vi.mocked(fetchHostSessionDetail).mockRejectedValueOnce(new Error("detail refetch failed"));
    await userEvent.click(await screen.findByRole("button", { name: "2명에게 알림 발송" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("최신 권한을 확인하지 못했습니다");
    expect(screen.queryByRole("button", { name: "알림 미리보기" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "다시 확인" }));
    expect(await screen.findByRole("textbox", { name: "알림 제목" })).toHaveValue("보존할 제목");
  });

  it("reconciles scoped caches after an indeterminate confirm without resending or navigating away", async () => {
    vi.mocked(confirmManualNotification).mockRejectedValueOnce(new ReadmatesTransportError());
    const client = renderRoute();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    await screen.findByRole("heading", { name: "일정 미열람 검토" });
    await userEvent.click(screen.getByRole("button", { name: "알림 미리보기" }));
    await userEvent.click(await screen.findByRole("button", { name: "2명에게 알림 발송" }));

    expect(await screen.findByRole("status", { name: "일정 알림 · 결과 확인 필요" })).toBeVisible();
    expect(screen.getByRole("link", { name: "알림 장부에서 결과 확인" })).toHaveAttribute(
      "href",
      "/clubs/reading-sai/app/host/notifications",
    );
    expect(screen.queryByRole("button", { name: /다시|재발송|알림 발송/ })).not.toBeInTheDocument();
    expect(confirmManualNotification).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: hostWorkboxKeys.scope(context) });
      expect(invalidate).toHaveBeenCalledWith({ queryKey: hostNotificationKeys.manual(context) });
      expect(invalidate).toHaveBeenCalledWith({ queryKey: hostSessionKeys.manualDispatchesRoot(context) });
      expect(invalidate).toHaveBeenCalledWith({ queryKey: hostSessionKeys.detail("session-7", context) });
      expect(invalidate).toHaveBeenCalledWith({ queryKey: hostSessionKeys.operatingRoomCurrent(context) });
    });
  });

  it("publishes nothing when authority is lost after failed settlement but before error continuation", async () => {
    const rejection = deferred<void>();
    const failedSettled = deferred<void>();
    const continueFailure = deferred<void>();
    vi.mocked(confirmManualNotification).mockImplementation(() => rejection.promise.then(() => {
      throw new ReadmatesTransportError();
    }));
    const coordinator = createGlobalSpaceTransitionCoordinator();
    const replay = vi.fn();
    let capturedHandle: PendingHandle | null = null;
    const transitionPort: TransitionSafetyRegistrationPort = {
      ...coordinator,
      beginPending(registration: PendingRegistration) {
        const handle = coordinator.beginPending({
          ...registration,
          recovery: {
            kind: "authoritative-history",
            operationId: registration.operationId,
            reconcile: async () => {
              replay();
              return { operationId: registration.operationId, outcome: "still-unknown" };
            },
          },
        });
        capturedHandle = handle;
        return {
          ...handle,
          async settle(result) {
            const outcome = await handle.settle(result);
            if (result === "failed") {
              failedSettled.resolve();
              await continueFailure.promise;
            }
            return outcome;
          },
        };
      },
    };
    const client = renderRoute(transitionPort);
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const storageWrite = vi.spyOn(Storage.prototype, "setItem");
    await screen.findByRole("heading", { name: "일정 미열람 검토" });
    await userEvent.click(screen.getByRole("button", { name: "알림 미리보기" }));
    await userEvent.click(await screen.findByRole("button", { name: "2명에게 알림 발송" }));

    rejection.resolve();
    await failedSettled.promise;
    coordinator.invalidateForAuthorityLoss();
    continueFailure.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(confirmManualNotification).toHaveBeenCalledTimes(1);
    expect(replay).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
    expect(screen.queryByRole("status", { name: /일정 알림/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "알림 장부에서 결과 확인" })).not.toBeInTheDocument();
    expect(storageWrite).not.toHaveBeenCalled();
    await expect(capturedHandle?.reconcile()).resolves.toEqual(expect.objectContaining({ outcome: "authority-lost" }));
    storageWrite.mockRestore();
  });

  it("publishes nothing when preview authority is lost after failed settlement but before recovery continuation", async () => {
    const rejection = deferred<void>();
    const failedSettled = deferred<void>();
    const continueFailure = deferred<void>();
    const coordinator = createGlobalSpaceTransitionCoordinator();
    const replay = vi.fn();
    let capturedHandle: PendingHandle | null = null;
    const transitionPort: TransitionSafetyRegistrationPort = {
      ...coordinator,
      beginPending(registration: PendingRegistration) {
        const handle = coordinator.beginPending({
          ...registration,
          recovery: {
            kind: "authoritative-history",
            operationId: registration.operationId,
            reconcile: async () => {
              replay();
              return { operationId: registration.operationId, outcome: "still-unknown" };
            },
          },
        });
        capturedHandle = handle;
        return {
          ...handle,
          async settle(result) {
            const outcome = await handle.settle(result);
            if (result === "failed") {
              failedSettled.resolve();
              await continueFailure.promise;
            }
            return outcome;
          },
        };
      },
    };
    const client = renderRoute(transitionPort);
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const storageWrite = vi.spyOn(Storage.prototype, "setItem");
    await screen.findByRole("heading", { name: "일정 미열람 검토" });
    await userEvent.click(screen.getByRole("button", { name: "알림 미리보기" }));
    expect(await screen.findByRole("region", { name: "발송 전 확인" })).toBeVisible();

    vi.mocked(previewManualNotification).mockClear();
    vi.mocked(previewManualNotification).mockImplementation(() => rejection.promise.then(() => {
      throw { code: "MANUAL_NOTIFICATION_RECIPIENTS_CHANGED", status: 409 };
    }));
    await userEvent.click(screen.getByRole("button", { name: "알림 미리보기" }));
    rejection.resolve();
    await failedSettled.promise;
    coordinator.invalidateForAuthorityLoss();
    continueFailure.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(previewManualNotification).toHaveBeenCalledTimes(1);
    expect(replay).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
    expect(screen.getByRole("region", { name: "발송 전 확인" })).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("status", { name: /일정 알림/ })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "일정 미열람 검토" })).toBeVisible();
    expect(storageWrite).not.toHaveBeenCalled();
    await expect(capturedHandle?.reconcile()).resolves.toEqual(expect.objectContaining({ outcome: "authority-lost" }));
    storageWrite.mockRestore();
  });
});

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
}
