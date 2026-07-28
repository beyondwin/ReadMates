import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import type { ParticipationJourneyViewModel } from "@/features/archive/model/my-reading-shelf-model";
import MyPage from "@/features/archive/ui/my-page";

afterEach(cleanup);

const viewModel: ParticipationJourneyViewModel = {
  hasParticipationHistory: true,
  achievementLabel: "함께한 모임 9회",
  membershipDurationLabel: "함께한 지 1년 8개월",
  recentSummaryLabel: "최근 6회 중 5회 함께했어요",
  streakLabel: "현재 3회 연속 참여",
  timelineItems: [
    {
      sessionNumber: 9,
      attendanceStatus: "ATTENDED",
      statusLabel: "참여",
      readingLabel: "완독",
    },
  ],
  nudge: {
    body: "다음 모임에도 함께하면 4회 연속 참여가 됩니다.",
    label: "이번 세션 보기",
    href: "/app/session/current",
  },
  supportingStats: [
    { label: "완독", value: "7 / 9" },
    { label: "질문", value: "28" },
    { label: "서평", value: "3" },
  ],
};

function renderMyPage({
  pageViewModel = viewModel,
  logoutControl = <button type="button">로그아웃</button>,
}: {
  pageViewModel?: ParticipationJourneyViewModel;
  logoutControl?: ReactNode;
} = {}) {
  return render(<MyPage viewModel={pageViewModel} logoutControl={logoutControl} />);
}

describe("MyPage", () => {
  it("renders the participation journey and route-owned account control", () => {
    renderMyPage();

    expect(screen.getByRole("heading", { level: 1, name: "나의 서재" })).toBeVisible();
    expect(screen.getByText("함께한 모임 9회")).toBeVisible();
    expect(screen.getByRole("button", { name: "로그아웃" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "최근 책별 기록" })).toBeNull();
  });

  it("renders the first-participation state from a pure view model", () => {
    renderMyPage({
      pageViewModel: {
        ...viewModel,
        hasParticipationHistory: false,
        achievementLabel: "함께한 모임 0회",
        membershipDurationLabel: null,
        recentSummaryLabel: null,
        streakLabel: null,
        timelineItems: [],
        nudge: null,
        supportingStats: [],
      },
    });

    expect(screen.getByRole("heading", { name: "첫 참여부터 이곳에 흐름이 쌓여요" })).toBeVisible();
    expect(screen.queryByText("함께한 모임 0회")).toBeNull();
  });

  it("does not replace or duplicate the route-owned account control", () => {
    renderMyPage({ logoutControl: <a href="/account/security">보안 설정</a> });

    expect(screen.getByRole("link", { name: "보안 설정" })).toHaveAttribute("href", "/account/security");
    expect(screen.queryByRole("button", { name: "로그아웃" })).toBeNull();
  });
});
