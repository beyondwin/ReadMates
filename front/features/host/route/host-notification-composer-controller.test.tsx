import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState, type PropsWithChildren } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ManualNotificationConfirmResponse,
  ManualNotificationOptionsResponse,
  ManualNotificationPreviewResponse,
} from "@/features/host/api/host-contracts";

vi.mock("@/features/host/api/host-api", () => ({
  fetchManualNotificationOptions: vi.fn(),
  previewManualNotification: vi.fn(),
  confirmManualNotification: vi.fn(),
}));

import {
  confirmManualNotification,
  fetchManualNotificationOptions,
  previewManualNotification,
} from "@/features/host/api/host-api";
import {
  HostNotificationComposerController,
  type HostNotificationComposerRequest,
} from "./host-notification-composer-controller";
import { hostNotificationKeys } from "@/features/host/queries/host-notification-queries";

const contentRevision = "b".repeat(64);
const request: HostNotificationComposerRequest = {
  sessionId: "session-1",
  eventType: "FEEDBACK_DOCUMENT_PUBLISHED",
  contentRevision,
  origin: "FIRST_PUBLICATION",
};

const members = [
  {
    membershipId: "membership-1",
    displayName: "첫 멤버",
    maskedEmail: "f***@example.com",
    role: "MEMBER",
    membershipStatus: "ACTIVE",
    sessionParticipationStatus: "ACTIVE",
    attendanceStatus: "CONFIRMED",
    emailEligibility: "ELIGIBLE",
    inAppEligibility: "ELIGIBLE",
  },
  {
    membershipId: "membership-2",
    displayName: "다음 멤버",
    maskedEmail: "n***@example.com",
    role: "MEMBER",
    membershipStatus: "ACTIVE",
    sessionParticipationStatus: "ACTIVE",
    attendanceStatus: "CONFIRMED",
    emailEligibility: "ELIGIBLE",
    inAppEligibility: "ELIGIBLE",
  },
] as const;

function optionsPage(
  items: ManualNotificationOptionsResponse["members"]["items"] = [members[0]],
  nextCursor: string | null = null,
  revision: string = contentRevision,
): ManualNotificationOptionsResponse {
  return {
    session: {
      sessionId: "session-1",
      sessionNumber: 8,
      bookTitle: "Example Book",
      date: "2026-07-23",
      state: "OPEN",
      visibility: "MEMBER",
      feedbackDocumentUploaded: true,
    },
    templates: [{
      eventType: "FEEDBACK_DOCUMENT_PUBLISHED",
      contentRevision: revision,
      label: "피드백 문서 공개",
      enabled: true,
      disabledReason: null,
      defaultAudience: "CONFIRMED_ATTENDEES",
      allowedAudiences: ["ALL_ACTIVE_MEMBERS", "CONFIRMED_ATTENDEES", "SELECTED_MEMBERS"],
      defaultChannels: "BOTH",
    }],
    members: { items: [...items], nextCursor },
    recentDispatches: [],
  };
}

const preview: ManualNotificationPreviewResponse = {
  previewId: "preview-1",
  expiresAt: "2026-07-23T20:10:00+09:00",
  template: {
    eventType: "FEEDBACK_DOCUMENT_PUBLISHED",
    label: "피드백 문서 공개",
    subject: "피드백 문서가 공개됐습니다",
    bodyPreview: "모임의 피드백 문서를 확인해 주세요.",
  },
  audience: {
    baseGroup: "CONFIRMED_ATTENDEES",
    baseCount: 2,
    excludedCount: 0,
    includedCount: 0,
    finalTargetCount: 2,
  },
  channels: {
    requested: "BOTH",
    inAppEligibleCount: 2,
    emailEligibleCount: 2,
    emailSkippedByPreferenceCount: 0,
    emailMissingCount: 0,
  },
  duplicates: {
    requiresResendConfirmation: false,
    recentDispatches: [],
  },
  warnings: [],
};

const confirmResponse: ManualNotificationConfirmResponse = {
  manualDispatchId: "dispatch-1",
  eventId: "event-1",
  status: "PUBLISHED",
  createdAt: "2026-07-23T20:01:00+09:00",
  summary: {
    targetCount: 2,
    requestedChannels: "BOTH",
    expectedInAppCount: 2,
    expectedEmailCount: 2,
  },
};

function createWrapper() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  function Wrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/clubs/reading-sai/app/host/sessions/session-1"]}>
          <Routes>
            <Route path="/clubs/:clubSlug/*" element={children} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
  }
  return { client, Wrapper };
}

function renderController({
  onClose = vi.fn(),
  onConfirmed = vi.fn(),
}: {
  onClose?: () => void;
  onConfirmed?: (result: ManualNotificationConfirmResponse) => void;
} = {}) {
  const { client, Wrapper } = createWrapper();
  render(
    <HostNotificationComposerController
      request={request}
      onClose={onClose}
      onConfirmed={onConfirmed}
    />,
    { wrapper: Wrapper },
  );
  return { client, onClose, onConfirmed };
}

beforeEach(() => {
  vi.mocked(fetchManualNotificationOptions).mockReset();
  vi.mocked(previewManualNotification).mockReset();
  vi.mocked(confirmManualNotification).mockReset();
  vi.mocked(fetchManualNotificationOptions).mockResolvedValue(optionsPage());
  vi.mocked(previewManualNotification).mockResolvedValue(preview);
  vi.mocked(confirmManualNotification).mockResolvedValue(confirmResponse);
});

describe("HostNotificationComposerController", () => {
  it("loads session options and uses the template content revision as the draft key", async () => {
    renderController();

    expect(await screen.findByRole("dialog", { name: "알림 보내기" })).toBeInTheDocument();
    expect(fetchManualNotificationOptions).toHaveBeenCalledWith(
      { clubSlug: "reading-sai" },
      expect.objectContaining({ sessionId: "session-1", page: { limit: 50 } }),
    );

    await userEvent.click(await screen.findByRole("button", { name: "알림 미리보기" }));
    expect(previewManualNotification).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: "session-1",
      contentRevision,
    }));
  });

  it("never retargets a mutation request to a newer options revision", async () => {
    const newerRevision = "c".repeat(64);
    vi.mocked(fetchManualNotificationOptions).mockResolvedValue(
      optionsPage([members[0]], null, newerRevision),
    );
    renderController();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "알림 내용이 변경되었습니다",
    );
    expect(screen.queryByRole("button", { name: "알림 미리보기" })).not.toBeInTheDocument();
    expect(previewManualNotification).not.toHaveBeenCalled();
  });

  it("accumulates searched recipient pages by cursor", async () => {
    vi.mocked(fetchManualNotificationOptions).mockImplementation((_context, input) => {
      if (input?.search === "멤버") {
        return Promise.resolve(input.page?.cursor === "cursor-2"
          ? optionsPage([members[1]], null)
          : optionsPage([members[0]], "cursor-2"));
      }
      return Promise.resolve(optionsPage([members[0]], null));
    });
    renderController();

    await userEvent.click(await screen.findByRole("radio", { name: "직접 선택" }));
    await userEvent.type(screen.getByRole("searchbox", { name: "멤버 검색" }), "멤버");
    await userEvent.click(screen.getByRole("button", { name: "검색" }));
    expect(await screen.findByRole("button", { name: "멤버 더 보기" })).toBeInTheDocument();
    expect(screen.getByText("첫 멤버")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "멤버 더 보기" }));

    expect(await screen.findByText("다음 멤버")).toBeInTheDocument();
    expect(screen.getByText("첫 멤버")).toBeInTheDocument();
    expect(fetchManualNotificationOptions).toHaveBeenLastCalledWith(
      { clubSlug: "reading-sai" },
      expect.objectContaining({
        search: "멤버",
        page: { limit: 50, cursor: "cursor-2" },
      }),
    );
  });

  it("fails closed when options revision changes while loading members", async () => {
    const newerRevision = "d".repeat(64);
    vi.mocked(fetchManualNotificationOptions).mockImplementation((_context, input) =>
      Promise.resolve(
        input?.search
          ? optionsPage([members[0]], null, newerRevision)
          : optionsPage(),
      ));
    renderController();

    await userEvent.click(await screen.findByRole("radio", { name: "직접 선택" }));
    await userEvent.type(screen.getByRole("searchbox", { name: "멤버 검색" }), "멤버");
    await userEvent.click(screen.getByRole("button", { name: "검색" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "멤버를 불러오는 동안 알림 내용이 변경되었습니다",
    );
    expect(screen.getByRole("button", { name: "알림 미리보기" })).toBeDisabled();
    expect(previewManualNotification).not.toHaveBeenCalled();
  });

  it("invalidates a preview whenever the draft changes", async () => {
    renderController();

    await userEvent.click(await screen.findByRole("button", { name: "알림 미리보기" }));
    expect(await screen.findByRole("region", { name: "발송 전 확인" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("radio", { name: "앱 알림" }));
    expect(screen.queryByRole("region", { name: "발송 전 확인" })).not.toBeInTheDocument();
  });

  it("calls onConfirmed only after confirm succeeds", async () => {
    const onConfirmed = vi.fn();
    renderController({ onConfirmed });

    await userEvent.click(await screen.findByRole("button", { name: "알림 미리보기" }));
    await userEvent.click(await screen.findByRole("button", { name: "발송 확인" }));

    await waitFor(() => expect(onConfirmed).toHaveBeenCalledWith(confirmResponse));
  });

  it("does not call onConfirmed when confirm fails", async () => {
    vi.mocked(confirmManualNotification).mockRejectedValue(new Error("conflict"));
    const onConfirmed = vi.fn();
    renderController({ onConfirmed });

    await userEvent.click(await screen.findByRole("button", { name: "알림 미리보기" }));
    await userEvent.click(await screen.findByRole("button", { name: "발송 확인" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "발송을 요청하지 못했습니다",
    );
    expect(onConfirmed).not.toHaveBeenCalled();
  });

  it("clears preview and evicts options on authoritative stale content errors", async () => {
    vi.mocked(confirmManualNotification).mockRejectedValue({
      code: "MANUAL_NOTIFICATION_CONTENT_STALE",
    });
    const { client } = renderController();
    const removeSpy = vi.spyOn(client, "removeQueries");

    await userEvent.click(await screen.findByRole("button", { name: "알림 미리보기" }));
    await userEvent.click(await screen.findByRole("button", { name: "발송 확인" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "최신 저장 결과에서 작성기를 다시 열어 주세요",
    );
    expect(screen.queryByRole("region", { name: "발송 전 확인" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "알림 미리보기" })).toBeDisabled();
    expect(removeSpy).toHaveBeenCalledWith({
      queryKey: hostNotificationKeys.manualOptionsRoot({ clubSlug: "reading-sai" }),
    });
  });

  it("requires a fresh preview after an expired confirmation", async () => {
    vi.mocked(confirmManualNotification).mockRejectedValue({
      code: "MANUAL_NOTIFICATION_PREVIEW_EXPIRED",
    });
    renderController();

    await userEvent.click(await screen.findByRole("button", { name: "알림 미리보기" }));
    await userEvent.click(await screen.findByRole("button", { name: "발송 확인" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "새 미리보기를 만든 뒤 다시 발송해 주세요",
    );
    expect(screen.queryByRole("region", { name: "발송 전 확인" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "알림 미리보기" })).toBeEnabled();
  });

  it("requires a fresh preview when the server no longer has the preview", async () => {
    vi.mocked(confirmManualNotification).mockRejectedValue({
      code: "MANUAL_NOTIFICATION_PREVIEW_NOT_FOUND",
    });
    renderController();

    await userEvent.click(await screen.findByRole("button", { name: "알림 미리보기" }));
    await userEvent.click(await screen.findByRole("button", { name: "발송 확인" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "새 미리보기를 만든 뒤 다시 발송해 주세요",
    );
    expect(screen.queryByRole("region", { name: "발송 전 확인" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "알림 미리보기" })).toBeEnabled();
  });

  it("offers retry and a safe later action when options loading fails", async () => {
    vi.mocked(fetchManualNotificationOptions)
      .mockRejectedValueOnce(new Error("network failed"))
      .mockResolvedValueOnce(optionsPage());
    const onClose = vi.fn();
    renderController({ onClose });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "콘텐츠는 저장됐지만 알림을 준비하지 못했습니다",
    );
    expect(confirmManualNotification).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "나중에 발송" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(confirmManualNotification).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(await screen.findByRole("button", { name: "알림 미리보기" })).toBeInTheDocument();
  });

  it("does not confirm when the composer is closed with Escape", async () => {
    const onClose = vi.fn();
    renderController({ onClose });

    await screen.findByRole("dialog", { name: "알림 보내기" });
    await userEvent.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(confirmManualNotification).not.toHaveBeenCalled();
  });

  it("resets draft state when the same request is closed and reopened", async () => {
    function Harness() {
      const [open, setOpen] = useState(true);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>다시 열기</button>
          <HostNotificationComposerController
            request={open ? request : null}
            onClose={() => setOpen(false)}
            onConfirmed={vi.fn()}
          />
        </>
      );
    }
    const { Wrapper } = createWrapper();
    render(<Harness />, { wrapper: Wrapper });

    await userEvent.click(await screen.findByRole("radio", { name: "직접 선택" }));
    await userEvent.click(screen.getByRole("checkbox", { name: /첫 멤버/ }));
    await userEvent.click(screen.getByRole("button", { name: "이번에는 보내지 않기" }));
    expect(confirmManualNotification).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "다시 열기" }));

    expect(await screen.findByRole("radio", { name: "추천 대상 · 참석 확정자" })).toBeChecked();
    await userEvent.click(screen.getByRole("radio", { name: "직접 선택" }));
    expect(screen.getByRole("checkbox", { name: /첫 멤버/ })).not.toBeChecked();
  });
});
