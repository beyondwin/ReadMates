import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  buildHostMeetingDiary,
} from "@/features/host/model/host-meeting-diary-model";
import { buildHostMeetingWorkspace } from "@/features/host/model/host-session-workspace-model";
import { MeetingDiaryTimeline } from "./meeting-diary-timeline";

const CURRENT_URL =
  "https://readmates.test/clubs/alpha/app/host/sessions/11111111-1111-1111-1111-111111111111";

const STEP_LABELS = [
  "모임 만들기",
  "멤버와 준비",
  "응답 모으는 중",
  "모임 당일(출석)",
  "기록 정리",
  "기록 게시",
] as const;

function diaryForOpenMeetingDay() {
  const workspace = buildHostMeetingWorkspace({
    currentUrl: CURRENT_URL,
    state: "OPEN",
    meetingDate: "2026-08-26",
    today: "2026-08-26",
    unansweredResponseCount: 0,
    unknownAttendanceCount: 1,
    recordReadiness: { status: "not-required" },
  });
  return buildHostMeetingDiary({
    workspace,
    meetingDate: "2026-08-26",
    today: "2026-08-26",
    currentUrl: CURRENT_URL,
  });
}

describe("MeetingDiaryTimeline", () => {
  it("renders the six §4.2 steps and marks current with aria-current plus text", () => {
    const diary = diaryForOpenMeetingDay();
    render(<MeetingDiaryTimeline diary={diary} />);

    const timeline = screen.getByRole("navigation", { name: "모임의 걸음" });
    const steps = within(timeline).getAllByRole("listitem");
    expect(steps).toHaveLength(6);
    expect(steps.map((step) => step.textContent ?? "")).toEqual(
      expect.arrayContaining(STEP_LABELS.map((label) => expect.stringContaining(label))),
    );
    STEP_LABELS.forEach((label) => {
      expect(within(timeline).getByText(label)).toBeVisible();
    });

    const current = within(timeline).getByRole("listitem", { current: "step" });
    expect(current).toHaveAttribute("aria-current", "step");
    expect(current).toHaveTextContent("모임 당일(출석)");
    expect(current).toHaveTextContent("지금");
    expect(within(timeline).getAllByText("지금")).toHaveLength(1);
  });
});
