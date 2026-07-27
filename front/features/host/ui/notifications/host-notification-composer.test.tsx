import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type {
  ManualNotificationOptionsResponse,
  ManualNotificationPreviewResponse,
} from "@/features/host/model/host-view-types";
import type {
  HostNotificationComposerDraft,
  HostNotificationRecipientMode,
} from "@/features/host/model/host-notification-composer-model";
import { HostNotificationComposer } from "./host-notification-composer";

const contentRevision = "a".repeat(64);

const member = {
  membershipId: "membership-1",
  displayName: "읽는 멤버",
  maskedEmail: "r***@example.com",
  role: "MEMBER",
  membershipStatus: "ACTIVE",
  sessionParticipationStatus: "ACTIVE",
  attendanceStatus: "CONFIRMED",
  emailEligibility: "ELIGIBLE",
  inAppEligibility: "ELIGIBLE",
} as const;

const options: ManualNotificationOptionsResponse = {
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
    contentRevision,
    label: "피드백 문서 공개",
    enabled: true,
    disabledReason: null,
    defaultAudience: "CONFIRMED_ATTENDEES",
    allowedAudiences: ["ALL_ACTIVE_MEMBERS", "CONFIRMED_ATTENDEES", "SELECTED_MEMBERS"],
    defaultChannels: "BOTH",
  }],
  members: { items: [member], nextCursor: null },
  recentDispatches: [],
};

const draft: HostNotificationComposerDraft = {
  sessionId: "session-1",
  eventType: "FEEDBACK_DOCUMENT_PUBLISHED",
  contentRevision,
  recipientMode: "RECOMMENDED",
  requestedChannels: "BOTH",
  selectedMembershipIds: [],
};

const duplicatePreview: ManualNotificationPreviewResponse = {
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
    recentDispatches: [],
  },
  warnings: [],
};

function renderComposer({
  currentDraft = draft,
  preview = null,
  onDraftChange = vi.fn(),
  onConfirm = vi.fn(),
  presentation,
  recipientModes,
}: {
  currentDraft?: HostNotificationComposerDraft;
  preview?: ManualNotificationPreviewResponse | null;
  onDraftChange?: (next: HostNotificationComposerDraft) => void;
  onConfirm?: (resendConfirmed: boolean) => void;
  presentation?: "dialog" | "workbench";
  recipientModes?: readonly HostNotificationRecipientMode[];
} = {}) {
  render(
    <HostNotificationComposer
      options={options}
      eventType={currentDraft.eventType}
      draft={currentDraft}
      preview={preview}
      busy={false}
      error={null}
      onDraftChange={onDraftChange}
      onSearch={vi.fn()}
      onLoadMore={vi.fn()}
      onPreview={vi.fn()}
      onConfirm={onConfirm}
      onSkip={vi.fn()}
      showSkip
      presentation={presentation}
      recipientModes={recipientModes}
    />,
  );
  return { onDraftChange, onConfirm };
}

describe("HostNotificationComposer", () => {
  it("offers recommended, all-member, and direct recipient choices", () => {
    renderComposer();

    expect(screen.getByRole("radio", { name: "추천 대상 · 참석 확정자" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "전체 활성 멤버" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "직접 선택" })).toBeInTheDocument();
  });

  it("labels the next-book recommendation as all active members", () => {
    renderComposer({
      currentDraft: {
        ...draft,
        eventType: "NEXT_BOOK_PUBLISHED",
      },
    });

    expect(
      screen.getByRole("radio", { name: "추천 대상 · 전체 활성 멤버" }),
    ).toBeInTheDocument();
  });

  it("requires a selected member before preview", async () => {
    const user = userEvent.setup();
    const onDraftChange = vi.fn();
    const { rerender } = render(
      <HostNotificationComposer
        options={options}
        eventType="FEEDBACK_DOCUMENT_PUBLISHED"
        draft={draft}
        preview={null}
        busy={false}
        error={null}
        onDraftChange={onDraftChange}
        onSearch={vi.fn()}
        onLoadMore={vi.fn()}
        onPreview={vi.fn()}
        onConfirm={vi.fn()}
        onSkip={vi.fn()}
        showSkip
      />,
    );

    await user.click(screen.getByRole("radio", { name: "직접 선택" }));
    const selectedDraft = onDraftChange.mock.calls.at(-1)?.[0] as HostNotificationComposerDraft;
    rerender(
      <HostNotificationComposer
        options={options}
        eventType="FEEDBACK_DOCUMENT_PUBLISHED"
        draft={selectedDraft}
        preview={null}
        busy={false}
        error={null}
        onDraftChange={onDraftChange}
        onSearch={vi.fn()}
        onLoadMore={vi.fn()}
        onPreview={vi.fn()}
        onConfirm={vi.fn()}
        onSkip={vi.fn()}
        showSkip
      />,
    );

    expect(screen.getByRole("button", { name: "알림 미리보기" })).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: /읽는 멤버/ }));
    expect(onDraftChange).toHaveBeenLastCalledWith(expect.objectContaining({
      recipientMode: "SELECTED_MEMBERS",
      selectedMembershipIds: ["membership-1"],
    }));
  });

  it("requires explicit duplicate resend confirmation", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    renderComposer({ preview: duplicatePreview, onConfirm });

    const previewRegion = screen.getByRole("region", { name: "발송 전 확인" });
    const confirmButton = within(previewRegion).getByRole("button", { name: "발송 확인" });
    expect(confirmButton).toBeDisabled();

    await user.click(within(previewRegion).getByRole("checkbox", { name: "재발송을 확인했습니다" }));
    expect(confirmButton).toBeEnabled();
    await user.click(confirmButton);

    expect(onConfirm).toHaveBeenCalledWith(true);
  });

  it("keeps the shared centered preview heading and confirmation copy", () => {
    renderComposer({ preview: duplicatePreview });

    const previewRegion = screen.getByRole("region", { name: "발송 전 확인" });
    expect(
      within(previewRegion).getByRole("heading", { name: "발송 전 확인" }),
    ).toBeVisible();
    expect(
      within(previewRegion).getByRole("button", { name: "발송 확인" }),
    ).toBeInTheDocument();
    expect(
      within(previewRegion).queryByRole("button", { name: "3명에게 알림 발송" }),
    ).not.toBeInTheDocument();
    expect(previewRegion).not.toHaveClass("rm-notification-preview");
    expect(
      previewRegion.querySelector(".rm-notification-preview__counts"),
    ).toBeNull();
    expect(within(previewRegion).getByText("앱 알림 3명")).toHaveClass(
      "badge",
      "badge-accent",
      "badge-dot",
    );
    expect(within(previewRegion).getByText("이메일 2명")).toHaveClass(
      "badge",
      "badge-accent",
      "badge-dot",
    );
    expect(within(previewRegion).getByText("최종 대상 3명")).toHaveClass("badge");
    expect(within(previewRegion).queryByText("피드백 문서 공개")).not.toBeInTheDocument();
    expect(
      within(previewRegion).getByRole("button", { name: "발송 확인" }),
    ).not.toHaveClass("rm-notification-preview__confirm");
  });

  it("shows the selected member count in workbench presentation", () => {
    renderComposer({
      currentDraft: {
        ...draft,
        recipientMode: "SELECTED_MEMBERS",
        selectedMembershipIds: ["membership-1"],
      },
      presentation: "workbench",
    });

    expect(screen.getByText("직접 선택 · 1명")).toBeInTheDocument();
  });

  it("renders workbench recipients as concrete descriptive choices", () => {
    renderComposer({
      currentDraft: {
        ...draft,
        recipientMode: "CONFIRMED_ATTENDEES",
      },
      presentation: "workbench",
      recipientModes: [
        "ALL_ACTIVE_MEMBERS",
        "CONFIRMED_ATTENDEES",
        "SELECTED_MEMBERS",
      ],
    });

    const confirmed = screen.getByRole("radio", { name: "참석 확정자" });
    expect(confirmed).toBeChecked();
    expect(screen.getByText("이 회차 참석을 확정한 멤버")).toBeInTheDocument();
    expect(screen.getByText("추천")).toBeInTheDocument();
  });

  it("renders workbench channels as descriptive choices and a safe summary", () => {
    renderComposer({ presentation: "workbench" });

    expect(screen.getByRole("radio", { name: "앱 + 이메일" })).toBeChecked();
    expect(screen.getByText("가능한 두 채널 모두 사용")).toBeInTheDocument();
    expect(screen.getByText("아직 발송되지 않음")).toBeInTheDocument();
    const previewAction = screen.getByRole("button", { name: "알림 미리보기" });
    expect(previewAction.closest(".rm-notification-workbench__footer"))
      .not.toBeNull();
    expect(previewAction.parentElement)
      .toHaveClass("rm-notification-workbench__actions");
  });

  it("explains why direct selection cannot preview with zero members", () => {
    renderComposer({
      currentDraft: {
        ...draft,
        recipientMode: "SELECTED_MEMBERS",
        selectedMembershipIds: [],
      },
      presentation: "workbench",
    });

    expect(screen.getByText("한 명 이상 선택해 주세요.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "알림 미리보기" })).toBeDisabled();
  });
});
