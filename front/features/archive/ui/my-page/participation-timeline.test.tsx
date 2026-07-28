import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ParticipationTimeline } from "./participation-timeline";

describe("ParticipationTimeline", () => {
  it("renders each attendance state with visible text instead of color alone", () => {
    render(
      <ParticipationTimeline
        summaryLabel="최근 확인된 2회 중 1회 함께했어요"
        streakLabel={null}
        items={[
          {
            sessionNumber: 7,
            attendanceStatus: "ATTENDED",
            statusLabel: "참여",
            readingLabel: "완독",
          },
          {
            sessionNumber: 8,
            attendanceStatus: "ABSENT",
            statusLabel: "불참",
            readingLabel: null,
          },
          {
            sessionNumber: 9,
            attendanceStatus: "UNKNOWN",
            statusLabel: "미확인",
            readingLabel: null,
          },
        ]}
      />,
    );

    expect(screen.getByRole("list", { name: "최근 참여 대상 회차" })).toBeVisible();
    expect(screen.getByText("7차")).toBeVisible();
    expect(screen.getByText("참여")).toBeVisible();
    expect(screen.getByText("완독")).toBeVisible();
    expect(screen.getByText("불참")).toBeVisible();
    expect(screen.getByText("미확인")).toBeVisible();
  });
});
