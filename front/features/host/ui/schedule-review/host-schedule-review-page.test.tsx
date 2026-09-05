import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ManualNotificationPreviewResponse } from "@/features/host/model/host-view-types";
import { HostScheduleReviewPage, type HostScheduleReviewPageProps } from "./host-schedule-review-page";

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

const recipients: HostScheduleReviewPageProps["recipients"] = [
  { membershipId: "membership-park", displayName: "박서윤", avatarKey: "peach-green-book", scheduleSeenState: "STALE" },
  { membershipId: "membership-lee", displayName: "이도현", avatarKey: "banana-green-book", scheduleSeenState: "UNSEEN" },
  { membershipId: "membership-kang", displayName: "강유진", avatarKey: "tulip-notebook", scheduleSeenState: "UNSEEN" },
  { membershipId: "membership-moon", displayName: "문재희", avatarKey: "candle-green-book", scheduleSeenState: "UNSEEN" },
];

function renderPage(overrides: Partial<HostScheduleReviewPageProps> = {}) {
  return render(
    <HostScheduleReviewPage
      returnHref="/clubs/reading-sai/app/host"
      sessionNumber={28}
      bookTitle="지구 끝의 온실"
      scheduleRevision={4}
      unreadMemberCount={4}
      excludedCurrentCount={8}
      recipients={recipients}
      selectedMembershipIds={recipients.map((member) => member.membershipId)}
      subject={preview.template.subject}
      body={preview.template.bodyPreview}
      requestedChannels="BOTH"
      preview={preview}
      onPreview={vi.fn()}
      onConfirm={vi.fn()}
      {...overrides}
    />,
  );
}

describe("HostScheduleReviewPage", () => {
  it("renders breadcrumb, change table, target table header, select-all, counter, defer, and cancel", () => {
    renderPage({
      startTime: "19:30",
      locationLabel: "책방 안쪽",
      onDefer: vi.fn(),
    });

    expect(document.querySelector(".rm-schedule-review__breadcrumb")).toHaveTextContent("운영실");
    expect(document.querySelector(".rm-schedule-review__breadcrumb")).toHaveTextContent("일정 미열람 확인");
    expect(screen.getByRole("heading", { name: "일정 미열람 안내" })).toBeVisible();
    expect(document.querySelector(".rm-schedule-review__revision")?.querySelector('[data-icon="clock"]')).toBeTruthy();
    expect(document.querySelector(".rm-schedule-review__revision")).toHaveTextContent("현재 일정 revision 4");
    expect(document.querySelector(".rm-schedule-review__changes")).toBeTruthy();
    expect(document.querySelector(".rm-schedule-review__targets thead")).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "전체 선택" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /제외된 8명 보기/ })).toHaveClass("rm-schedule-review__excluded");
    expect(screen.getByText(/\/ 4000/)).toHaveClass("rm-schedule-review__counter");
    expect(screen.getByRole("button", { name: "내일 09:00까지 보류" })).toHaveClass("rm-schedule-review__defer");
    expect(screen.getByRole("link", { name: "취소하고 운영실로" })).toHaveClass("rm-schedule-review__cancel");
    expect(screen.getByRole("button", { name: "알림 미리보기" })).toHaveClass("rm-schedule-review__preview");
    expect(screen.queryByText("세부 조작")).toBeNull();
  });

  it("shows current schedule values as unchanged when previous revision fields are absent", () => {
    renderPage({ startTime: "19:30", locationLabel: "책방 안쪽" });

    const changes = document.querySelector(".rm-schedule-review__changes");
    expect(changes).toHaveTextContent("오후 7:30");
    expect(changes).toHaveTextContent("책방 안쪽");
    expect(changes?.querySelectorAll("tr")).toHaveLength(3);
    expect(changes).toHaveTextContent("변경 없음");
    expect(changes?.querySelector('[data-icon="arrow-right"]')).toBeNull();
    expect(screen.queryByText("어제 19:30")).toBeNull();
    expect(screen.queryByText(/을지로/)).toBeNull();
  });

  it("renders previous-to-current diffs with an arrow when previous values are supplied", () => {
    renderPage({
      startTime: "19:30",
      previousStartTime: "19:00",
      locationLabel: "책방 안쪽",
      previousLocationLabel: "책방 안쪽",
      changeReason: "시작 시간을 늦췄어요",
    });

    const startRow = screen.getByText("시작 시간").closest("tr");
    expect(startRow?.querySelector('[data-icon="arrow-right"]')).toBeTruthy();
    expect(startRow).toHaveTextContent("오후 7:00");
    expect(startRow?.querySelector("[data-new]")).toHaveTextContent("오후 7:30");
    expect(screen.getByText("장소").closest("tr")).toHaveTextContent("변경 없음");
    expect(screen.getByText("변경 사유").closest("tr")).toHaveTextContent("시작 시간을 늦췄어요");
  });

  it("counts the live body against the real composer max and keeps preview then send", async () => {
    const onConfirm = vi.fn();
    renderPage({
      body: "확인해주세요.",
      preview,
      onConfirm,
    });

    expect(screen.getByText("7 / 4000")).toHaveClass("rm-schedule-review__counter");
    expect(screen.queryByText("72 / 140")).toBeNull();
    expect(screen.getByRole("checkbox", { name: "변경 내용 포함" })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "4명에게 안내 보내기" }));
    expect(onConfirm).toHaveBeenCalledWith(false);
    expect(screen.getByRole("button", { name: "알림 미리보기" })).toBeVisible();
    expect(screen.getByRole("region", { name: "발송 전 확인" })).toBeVisible();
  });

  it("renders the mockup first-viewport two-column review with send confirmation", () => {
    renderPage();

    expect(screen.getByRole("heading", { name: "일정 미열람 안내" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "안내 대상 4명" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "보낼 안내" })).toBeVisible();
    expect(screen.getByRole("button", { name: "4명에게 안내 보내기" })).toBeVisible();
    expect(screen.getByRole("checkbox", { name: /박서윤/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /문재희/ })).toBeChecked();
    expect(screen.getByRole("button", { name: "알림 미리보기" })).toBeVisible();
    expect(screen.getByRole("region", { name: "발송 전 확인" })).toBeVisible();
    expect(screen.getByDisplayValue(preview.template.subject)).toBeVisible();
    expect(screen.getByDisplayValue(preview.template.bodyPreview)).toBeVisible();
    expect(screen.getByText("최종 대상")).not.toBeVisible();
  });

  it("keeps send enabled when only a defer error is present", () => {
    renderPage({
      deferError: "작업을 보류하지 못했습니다. 다시 시도해 주세요.",
      onDefer: vi.fn(),
    });

    expect(screen.getByRole("alert")).toHaveTextContent("작업을 보류하지 못했습니다");
    expect(screen.getByRole("button", { name: "4명에게 안내 보내기" })).toBeEnabled();
    expect(screen.getByRole("region", { name: "발송 전 확인" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "미리보기 다시 만들기" })).not.toBeInTheDocument();
  });
});
