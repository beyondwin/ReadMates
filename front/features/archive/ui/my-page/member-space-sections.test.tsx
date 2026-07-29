import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { MyPageProfile } from "@/features/archive/model/archive-model";
import type { MemberSpaceViewModel } from "@/features/archive/model/my-reading-shelf-model";
import { MemberProfileSummary } from "./member-profile-summary";
import { ReadingAchievementSummary } from "./reading-achievement-summary";

const profile: MyPageProfile = {
  displayName: "멤버1",
  accountName: "member-one",
  email: "member1@example.com",
  role: "MEMBER",
  membershipStatus: "ACTIVE",
  clubName: "읽는사이",
  joinedAt: "2025-11",
  sessionCount: 7,
  totalSessionCount: 7,
  completedReadingCount: 3,
  currentSessionId: null,
  recentAttendances: [],
};

const viewModel: MemberSpaceViewModel = {
  avatarLabel: "멤",
  profileMetaLabel: "읽는사이 · 멤버 · 함께한 지 8개월",
  joinedMonthLabel: "2025년 11월",
  achievementHeading: "일곱 번의 모임에서 세 권을 끝까지 읽었어요.",
  achievementBody: "함께 읽는 시간이 차분히 쌓이고 있습니다.",
  metrics: [
    { label: "함께한 모임", value: "7" },
    { label: "완독", value: "3" },
    { label: "질문", value: "5" },
    { label: "서평", value: "2" },
  ],
};

function renderProfileSummary(canEditProfile = true) {
  return render(
    <MemberProfileSummary
      profile={profile}
      viewModel={viewModel}
      canEditProfile={canEditProfile}
      accountSettingsHref="/app/me/settings"
      onUpdateProfile={vi.fn().mockResolvedValue({ displayName: profile.displayName, accountName: profile.accountName })}
    />,
  );
}

describe("member-space presentation sections", () => {
  it("renders the editable profile summary before its account-management destination", () => {
    renderProfileSummary();

    expect(screen.getByText("내 프로필")).toBeVisible();
    expect(screen.getByRole("heading", { level: 1, name: "멤버1" })).toBeVisible();
    expect(screen.getByText("읽는사이 · 멤버 · 함께한 지 8개월")).toBeVisible();
    expect(screen.getByRole("button", { name: "프로필 수정" })).toBeVisible();
    expect(screen.getByRole("link", { name: "계정 관리" })).toHaveAttribute("href", "/app/me/settings");
  });

  it("keeps account management available while omitting profile editing without permission", () => {
    renderProfileSummary(false);

    expect(screen.queryByRole("button", { name: "프로필 수정" })).toBeNull();
    expect(screen.queryByLabelText("이름 변경 준비 중")).toBeNull();
    expect(screen.getByRole("link", { name: "계정 관리" })).toBeVisible();
  });

  it("keeps the labelled profile heading available while editing the display name", async () => {
    const user = userEvent.setup();
    renderProfileSummary();

    await user.click(screen.getByRole("button", { name: "프로필 수정" }));

    expect(screen.getByRole("heading", { level: 1, name: "멤버1" })).toHaveAttribute("id", "member-profile-name");
    expect(screen.getByRole("region", { name: "멤버1" })).toBeVisible();
    expect(screen.getByLabelText("이름")).toBeVisible();
    expect(screen.getByRole("button", { name: "이름 저장" })).toBeVisible();
    expect(screen.getByRole("button", { name: "취소" })).toBeVisible();
  });

  it("presents cumulative achievements as ordered definition-list metrics only", () => {
    const { container } = render(<ReadingAchievementSummary viewModel={viewModel} />);
    const section = screen.getByRole("region", { name: "일곱 번의 모임에서 세 권을 끝까지 읽었어요." });
    const metrics = section.querySelector("dl");

    expect(screen.getByText("함께 읽어 온 기록")).toBeVisible();
    expect(within(section).getByRole("heading", { level: 2, name: "일곱 번의 모임에서 세 권을 끝까지 읽었어요." })).toBeVisible();
    expect(within(section).getByText("함께 읽는 시간이 차분히 쌓이고 있습니다.")).toBeVisible();
    expect(metrics).not.toBeNull();
    expect(Array.from(metrics?.querySelectorAll("dt") ?? [], (item) => item.textContent)).toEqual(["함께한 모임", "완독", "질문", "서평"]);
    expect(Array.from(metrics?.querySelectorAll("dd") ?? [], (item) => item.textContent)).toEqual(["7", "3", "5", "2"]);
    expect(within(section).getByText("멤버십 시작")).toBeVisible();
    expect(within(section).getByText("2025년 11월")).toBeVisible();
    expect(container.querySelectorAll("ol, ul, [role='img'], svg")).toHaveLength(0);
    expect(screen.queryByText(/2026|최근|연속/)).toBeNull();
    expect(screen.queryByRole("link", { name: /기록/ })).toBeNull();
  });
});
