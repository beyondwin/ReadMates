import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ParticipationJourneyViewModel } from "@/features/archive/model/my-reading-shelf-model";
import { ParticipationJourney } from "./participation-journey";

function viewModel(overrides: Partial<ParticipationJourneyViewModel> = {}): ParticipationJourneyViewModel {
  return {
    hasParticipationHistory: true,
    achievementLabel: "함께한 모임 9회",
    membershipDurationLabel: "함께한 지 1년 8개월",
    recentSummaryLabel: "최근 3회 중 2회 함께했어요",
    streakLabel: "현재 2회 연속 참여",
    timelineItems: [
      {
        sessionNumber: 9,
        attendanceStatus: "ATTENDED",
        statusLabel: "참여",
        readingLabel: "완독",
      },
    ],
    nudge: {
      body: "다음 모임에도 함께하면 3회 연속 참여가 됩니다.",
      label: "이번 세션 보기",
      href: "/app/session/current",
    },
    supportingStats: [
      { label: "완독", value: "7 / 9" },
      { label: "질문", value: "11" },
      { label: "서평", value: "4" },
    ],
    ...overrides,
  };
}

describe("ParticipationJourney", () => {
  it("renders the participation hierarchy and scoped member actions in order", () => {
    const { container } = render(<ParticipationJourney viewModel={viewModel()} />);

    expect(screen.getByText("함께한 모임 9회")).toBeVisible();
    expect(screen.getByText("함께한 지 1년 8개월")).toBeVisible();
    expect(screen.getByRole("list", { name: "최근 참여 대상 회차" })).toBeVisible();
    expect(screen.getAllByText("완독")[0]).toBeVisible();
    expect(screen.getByText("질문")).toBeVisible();
    expect(screen.getByText("서평")).toBeVisible();
    expect(screen.getByRole("link", { name: "이번 세션 보기" })).toHaveAttribute(
      "href",
      "/app/session/current",
    );
    expect(screen.getByRole("link", { name: "내 책별 기록 전체 보기" })).toHaveAttribute(
      "href",
      "/app/me/records",
    );

    const sections = Array.from(container.querySelectorAll(":scope > section"));
    expect(sections.map((section) => section.className)).toEqual([
      "rm-participation-achievement",
      "rm-participation-timeline",
      "rm-participation-nudge",
      "rm-supporting-reading-stats",
      "rm-participation-records-action",
    ]);
  });

  it("uses the approved empty heading without a zero-filled timeline and keeps nonzero supporting stats", () => {
    render(
      <ParticipationJourney
        viewModel={viewModel({
          hasParticipationHistory: false,
          timelineItems: [],
          recentSummaryLabel: null,
          streakLabel: null,
          supportingStats: [{ label: "질문", value: "1" }],
        })}
      />,
    );

    expect(screen.getByRole("heading", { name: "첫 참여부터 이곳에 흐름이 쌓여요" })).toBeVisible();
    expect(screen.queryByRole("list", { name: "최근 참여 대상 회차" })).toBeNull();
    expect(screen.getByText("질문")).toBeVisible();
    expect(screen.getByText("1")).toBeVisible();
  });
});
