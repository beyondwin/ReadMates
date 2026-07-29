import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MyPageProfile } from "@/features/archive/model/archive-model";
import type { MemberSpaceViewModel } from "@/features/archive/model/my-reading-shelf-model";
import MyPage from "@/features/archive/ui/my-page";

afterEach(cleanup);

const profile: MyPageProfile = {
  displayName: "샘플 멤버",
  accountName: "sample-member",
  email: "member@example.com",
  role: "MEMBER",
  membershipStatus: "ACTIVE",
  clubName: "샘플 독서모임",
  joinedAt: "2024-11",
  sessionCount: 9,
  totalSessionCount: 9,
  completedReadingCount: 7,
  currentSessionId: null,
  recentAttendances: [],
};

const viewModel: MemberSpaceViewModel = {
  avatarLabel: "샘",
  profileMetaLabel: "샘플 독서모임 · 멤버 · 함께한 지 1년 8개월",
  joinedMonthLabel: "2024년 11월",
  achievementHeading: "9번의 모임에서 7권을 끝까지 읽었어요.",
  achievementBody: "함께 읽는 시간이 차분히 쌓이고 있습니다.",
  metrics: [
    { label: "함께한 모임", value: "9" },
    { label: "완독", value: "7" },
  ],
};

describe("MyPage", () => {
  it("composes the member profile before cumulative achievements without a route-owned logout control", () => {
    const { container } = render(
      <MyPage
        profile={profile}
        viewModel={viewModel}
        canEditProfile
        accountSettingsHref="/app/me/settings"
        onUpdateProfile={vi.fn().mockResolvedValue({ displayName: profile.displayName, accountName: profile.accountName })}
      />,
    );

    const profileSection = screen.getByRole("region", { name: "샘플 멤버" });
    const achievementSection = screen.getByRole("region", { name: "9번의 모임에서 7권을 끝까지 읽었어요." });

    expect(screen.getByRole("link", { name: "계정 관리" })).toHaveAttribute("href", "/app/me/settings");
    expect(profileSection.compareDocumentPosition(achievementSection) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole("button", { name: "로그아웃" })).toBeNull();
    expect(container.querySelector(".rm-member-profile")).not.toBeNull();
  });
});
