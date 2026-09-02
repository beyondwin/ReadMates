import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ManualNotificationPreviewResponse } from "@/features/host/model/host-view-types";
import { HostScheduleReviewPage } from "./host-schedule-review-page";

const preview: ManualNotificationPreviewResponse = {
  previewId: "preview-schedule-28",
  expiresAt: "2026-09-02T12:00:00Z",
  scheduleRevision: 4,
  targetSnapshotHash: "b".repeat(64),
  contentHash: "c".repeat(64),
  template: {
    eventType: "SESSION_REMINDER_DUE",
    label: "일정 변경 알림",
    subject: "모임 시간이 오후 7:30으로 바뀌었어요",
    bodyPreview: "이번 모임 시작 시간이 오후 7:30으로 변경되었습니다.",
  },
  audience: {
    baseGroup: "SELECTED_MEMBERS",
    baseCount: 4,
    excludedCount: 0,
    includedCount: 0,
    finalTargetCount: 4,
  },
  channels: {
    requested: "BOTH",
    inAppEligibleCount: 4,
    emailEligibleCount: 4,
    emailSkippedByPreferenceCount: 0,
    emailMissingCount: 0,
  },
  duplicates: { requiresResendConfirmation: false, recentDispatches: [] },
  warnings: [],
};

describe("HostScheduleReviewPage", () => {
  it("renders the mockup first-viewport two-column review with send confirmation", () => {
    render(
      <HostScheduleReviewPage
        returnHref="/clubs/reading-sai/app/host"
        sessionNumber={28}
        bookTitle="지구 끝의 온실"
        scheduleRevision={4}
        unreadMemberCount={4}
        excludedCurrentCount={8}
        recipients={[
          { membershipId: "membership-park", displayName: "박서윤", avatarKey: "peach-green-book", scheduleSeenState: "STALE" },
          { membershipId: "membership-lee", displayName: "이도현", avatarKey: "banana-green-book", scheduleSeenState: "UNSEEN" },
          { membershipId: "membership-kang", displayName: "강유진", avatarKey: "tulip-notebook", scheduleSeenState: "UNSEEN" },
          { membershipId: "membership-moon", displayName: "문재희", avatarKey: "candle-green-book", scheduleSeenState: "UNSEEN" },
        ]}
        selectedMembershipIds={["membership-park", "membership-lee", "membership-kang", "membership-moon"]}
        subject={preview.template.subject}
        body={preview.template.bodyPreview}
        requestedChannels="BOTH"
        preview={preview}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "일정 미열람 검토" })).toBeVisible();
    expect(screen.getByText("미열람 4명").textContent).toContain("미열람 4명");
    expect(screen.getByRole("heading", { name: "안내 대상 4명" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "보낼 안내" })).toBeVisible();
    expect(screen.getByRole("button", { name: "4명에게 안내 보내기" })).toBeVisible();
    expect(screen.getByRole("checkbox", { name: /박서윤/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /문재희/ })).toBeChecked();
    expect(screen.queryByRole("button", { name: "알림 미리보기" })).not.toBeInTheDocument();
  });
});
