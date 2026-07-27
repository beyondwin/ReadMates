import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ManualNotificationPreviewResponse } from "@/features/host/model/host-view-types";
import { ManualNotificationPreviewConfirmation } from "./manual-notification-preview";

const previewFixture: ManualNotificationPreviewResponse = {
  previewId: "preview-counts",
  expiresAt: "2030-01-01T00:00:00+09:00",
  template: {
    eventType: "SESSION_REMINDER_DUE",
    label: "모임 전날 리마인더",
    subject: "내일 모임을 확인해 주세요",
    bodyPreview: "모임 시작 시간과 장소를 다시 확인해 주세요.",
  },
  audience: {
    baseGroup: "ALL_ACTIVE_MEMBERS",
    baseCount: 8,
    excludedCount: 1,
    includedCount: 0,
    finalTargetCount: 7,
  },
  channels: {
    requested: "BOTH",
    inAppEligibleCount: 6,
    emailEligibleCount: 5,
    emailSkippedByPreferenceCount: 2,
    emailMissingCount: 0,
  },
  duplicates: {
    requiresResendConfirmation: false,
    recentDispatches: [],
  },
  warnings: [],
};

const duplicatePreview: ManualNotificationPreviewResponse = {
  ...previewFixture,
  previewId: "preview-duplicate",
  duplicates: {
    requiresResendConfirmation: true,
    recentDispatches: [],
  },
};

function renderPreview({
  preview = previewFixture,
  onConfirm = vi.fn(),
}: {
  preview?: ManualNotificationPreviewResponse;
  onConfirm?: (resendConfirmed: boolean) => void;
} = {}) {
  render(
    <ManualNotificationPreviewConfirmation
      preview={preview}
      busy={false}
      presentation="side-sheet"
      onConfirm={onConfirm}
    />,
  );
}

describe("ManualNotificationPreviewConfirmation", () => {
  it("renders server-calculated counts and message content in side-sheet mode", () => {
    renderPreview();

    expect(screen.getByText("최종 대상")).toBeInTheDocument();
    expect(screen.getByText("앱 알림 가능")).toBeInTheDocument();
    expect(screen.getByText("이메일 가능")).toBeInTheDocument();
    expect(screen.getByText(previewFixture.template.subject)).toBeInTheDocument();
    expect(screen.getByText(previewFixture.template.bodyPreview)).toBeInTheDocument();
  });

  it("keeps a failed confirmation visible and requires a new preview", async () => {
    const user = userEvent.setup();
    const onRefreshPreview = vi.fn().mockResolvedValue(undefined);
    render(
      <ManualNotificationPreviewConfirmation
        preview={previewFixture}
        busy={false}
        presentation="side-sheet"
        error="발송을 요청하지 못했습니다. 미리보기를 다시 확인해 주세요."
        onRefreshPreview={onRefreshPreview}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("발송을 요청하지 못했습니다");
    expect(screen.getByRole("button", { name: /명에게 알림 발송/ })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "미리보기 다시 만들기" }));
    expect(onRefreshPreview).toHaveBeenCalledTimes(1);
  });

  it("still requires explicit duplicate resend confirmation", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    renderPreview({ preview: duplicatePreview, onConfirm });

    const send = screen.getByRole("button", { name: /명에게 알림 발송/ });
    expect(send).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: "재발송을 확인했습니다" }));
    await user.click(send);
    expect(onConfirm).toHaveBeenCalledWith(true);
  });
});
