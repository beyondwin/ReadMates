import { render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type {
  HostSessionListItem,
  ManualNotificationOptionsResponse,
  ManualNotificationPreviewResponse,
} from "@/features/host/model/host-view-types";
import { ManualNotificationWorkbench } from "./manual-notification-workbench";

const contentRevision = "a".repeat(64);

const options: ManualNotificationOptionsResponse = {
  session: {
    sessionId: "session-9",
    sessionNumber: 9,
    bookTitle: "Example Book",
    date: "2026-07-15",
    state: "OPEN",
    visibility: "MEMBER",
    feedbackDocumentUploaded: false,
  },
  templates: [
    {
      eventType: "SESSION_REMINDER_DUE",
      contentRevision,
      label: "모임 전날 리마인더",
      enabled: true,
      disabledReason: null,
      defaultAudience: "ALL_ACTIVE_MEMBERS",
      allowedAudiences: ["ALL_ACTIVE_MEMBERS", "SESSION_PARTICIPANTS"],
      defaultChannels: "BOTH",
    },
    {
      eventType: "FEEDBACK_DOCUMENT_PUBLISHED",
      contentRevision,
      label: "피드백 문서 등록",
      enabled: false,
      disabledReason: "피드백 문서가 등록된 뒤 발송할 수 있습니다.",
      defaultAudience: "CONFIRMED_ATTENDEES",
      allowedAudiences: ["CONFIRMED_ATTENDEES"],
      defaultChannels: "BOTH",
    },
  ],
  members: { items: [], nextCursor: null },
  recentDispatches: [],
};

const sessions: HostSessionListItem[] = [{
  sessionId: "session-9",
  sessionNumber: 9,
  title: "9회차 모임",
  bookTitle: "Example Book",
  bookAuthor: "Example Author",
  bookImageUrl: null,
  date: "2026-07-15",
  startTime: "20:00",
  endTime: "22:00",
  locationLabel: "온라인",
  state: "OPEN",
  visibility: "MEMBER",
}];

const previewFixture: ManualNotificationPreviewResponse = {
  previewId: "preview-1",
  expiresAt: "2026-07-25T12:10:00+09:00",
  template: {
    eventType: "SESSION_REMINDER_DUE",
    label: "모임 전날 리마인더",
    subject: "모임 전날 리마인더",
    bodyPreview: "내일 모임 준비를 확인해 주세요.",
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
    requiresResendConfirmation: false,
    recentDispatches: [],
  },
  warnings: [],
};

type WorkbenchProps = ComponentProps<typeof ManualNotificationWorkbench>;

function renderWorkbench(overrides: Partial<WorkbenchProps> = {}) {
  const props: WorkbenchProps = {
    options,
    hostSessions: sessions,
    initialSessionId: "session-9",
    initialEventType: "SESSION_REMINDER_DUE",
    preview: null,
    busy: false,
    error: null,
    onPreview: vi.fn().mockResolvedValue(undefined),
    onConfirm: vi.fn().mockResolvedValue(undefined),
    onPreviewDismiss: vi.fn(),
    ...overrides,
  };
  return render(<ManualNotificationWorkbench {...props} />);
}

describe("ManualNotificationWorkbench", () => {
  it("renders the safe guided-ledger hierarchy without raw enums", () => {
    renderWorkbench();

    const workbench = screen.getByRole("region", { name: "새 알림 발송" });
    expect(within(workbench).getByText(
      "선택만으로는 발송되지 않습니다. 미리보기에서 최종 확인합니다.",
    )).toBeInTheDocument();
    expect(within(workbench).getByText("미리보기 후 발송")).toBeInTheDocument();
    expect(within(workbench).getByText(
      "진행 중 · 게스트 공개 · 피드백 문서 준비 전",
    )).toBeInTheDocument();
    expect(within(workbench).queryByText(/OPEN|HOST_ONLY/)).not.toBeInTheDocument();

    const decisionHeadings = within(workbench)
      .getAllByRole("heading", { level: 3 })
      .map((heading) => heading.textContent);

    expect(decisionHeadings).toEqual([
      "대상 회차",
      "알림 종류",
      "대상과 채널",
    ]);
    expect(within(workbench).getAllByText(/^01$/)).toHaveLength(1);
    expect(within(workbench).getAllByText(/^02$/)).toHaveLength(1);
    expect(within(workbench).getAllByText(/^03$/)).toHaveLength(1);
    expect(within(workbench).getByRole("button", { name: "미리보기 열기" })).toBeEnabled();
    expect(within(workbench).queryByRole("heading", { name: "멤버에게 알림을 보낼까요?" })).not.toBeInTheDocument();
  });

  it("renders notification types as descriptive radio cards", () => {
    renderWorkbench();

    const reminder = screen.getByRole("radio", { name: /모임 전날 리마인더/ });
    expect(reminder).toBeChecked();
    expect(screen.getByText("일정과 참석 여부를 다시 안내합니다.")).toBeInTheDocument();

    const unavailable = screen.getByRole("radio", { name: /피드백 문서 등록/ });
    const reason = screen.getByText("피드백 문서가 등록된 뒤 발송할 수 있습니다.");
    expect(unavailable).toBeDisabled();
    expect(unavailable).toHaveAttribute("aria-describedby", reason.id);
  });

  it("does not offer client-owned recipients when the active template is unavailable", () => {
    renderWorkbench({
      options: {
        ...options,
        templates: [],
      },
    });

    expect(within(screen.getByRole("group", { name: "알림 대상" }))
      .queryByRole("radio")).not.toBeInTheDocument();
  });

  it("opens preview externally and Escape dismisses without confirming", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onPreviewDismiss = vi.fn();
    renderWorkbench({
      preview: previewFixture,
      onConfirm,
      onPreviewDismiss,
    });

    const dialog = screen.getByRole("dialog", { name: "발송 전 확인" });
    expect(within(dialog).getByRole("button", { name: "3명에게 알림 발송" }))
      .toBeInTheDocument();
    expect(screen.getAllByText("발송 전 확인")).toHaveLength(1);

    await user.keyboard("{Escape}");

    expect(onPreviewDismiss).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("backdrop dismissal never confirms a preview", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onPreviewDismiss = vi.fn();
    renderWorkbench({
      preview: previewFixture,
      onConfirm,
      onPreviewDismiss,
    });

    await user.click(screen.getByTestId("host-notification-composer-backdrop"));

    expect(onPreviewDismiss).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("provides a visible close action that dismisses without confirming", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onPreviewDismiss = vi.fn();
    renderWorkbench({
      preview: previewFixture,
      onConfirm,
      onPreviewDismiss,
    });

    const dialog = screen.getByRole("dialog", { name: "발송 전 확인" });
    await user.click(within(dialog).getByRole("button", { name: "닫기" }));

    expect(onPreviewDismiss).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("disables the visible close action while the side sheet is busy", () => {
    renderWorkbench({
      preview: previewFixture,
      busy: true,
    });

    const dialog = screen.getByRole("dialog", { name: "발송 전 확인" });
    expect(within(dialog).getByRole("button", { name: "닫기" })).toBeDisabled();
  });

  it("shows confirm errors inside the open side sheet and can refresh", async () => {
    const user = userEvent.setup();
    const onPreview = vi.fn().mockResolvedValue(undefined);
    renderWorkbench({
      preview: previewFixture,
      error: "발송을 요청하지 못했습니다. 미리보기를 다시 확인해 주세요.",
      onPreview,
    });

    const dialog = screen.getByRole("dialog", { name: "발송 전 확인" });
    expect(within(dialog).getByRole("alert")).toBeVisible();
    await user.click(within(dialog).getByRole("button", { name: "미리보기 다시 만들기" }));
    expect(onPreview).toHaveBeenCalledWith({
      sessionId: "session-9",
      eventType: "SESSION_REMINDER_DUE",
      contentRevision,
      audience: "ALL_ACTIVE_MEMBERS",
      requestedChannels: "BOTH",
      selectedMembershipIds: [],
      excludedMembershipIds: [],
      includedMembershipIds: [],
      sendMode: "NOW",
    });
  });
});
