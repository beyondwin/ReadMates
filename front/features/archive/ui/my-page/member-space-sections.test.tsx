import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { MyPageProfile } from "@/features/archive/model/archive-model";
import type { MemberSpaceViewModel } from "@/features/archive/model/my-reading-shelf-model";
import { MemberProfileSummary } from "./member-profile-summary";

const profile: MyPageProfile = {
  avatarKey: "banana-green-book", displayName: "아주 긴 이름도 자연스럽게 여러 줄로 이어지는 멤버", accountName: "member-one",
  email: "member1@example.com", role: "MEMBER", membershipStatus: "ACTIVE", clubName: "읽는사이",
  joinedAt: "2025-11", sessionCount: 7, totalSessionCount: 7, completedReadingCount: 3,
  currentSessionId: null, recentAttendances: [],
};
const viewModel: MemberSpaceViewModel = {
  profileMetaLabel: "읽는사이 · 멤버 · 2025.11부터 함께",
  achievementHeading: "읽고, 묻고, 기록해 온 시간",
  journeyStats: [
    { kind: "sessions", label: "함께한 모임", value: "7", unit: "회" },
    { kind: "completed", label: "함께 완독한 책", value: "3", unit: "권" },
  ],
  recordTraces: [
    { kind: "questions", label: "대화를 연 질문", description: "책에서 시작된 생각의 기록", value: "5", unit: "개" },
    { kind: "reviews", label: "남긴 서평", description: "읽고 난 마음을 풀어낸 기록", value: "0", unit: "편" },
  ],
};

describe("MemberProfileSummary", () => {
  it("renders one read-only identity hierarchy and one integrated edit action", () => {
    const { container } = render(<MemberProfileSummary profile={profile} viewModel={viewModel} canEditProfile onSaveProfile={vi.fn()} />);
    const section = screen.getByRole("region", { name: profile.displayName });
    expect(within(section).getAllByRole("heading", { level: 1, name: profile.displayName })).toHaveLength(1);
    const artwork = container.querySelector(".rm-member-profile__avatar.rm-avatar-chip--artwork");
    expect(artwork).toHaveClass("rm-avatar-chip");
    expect(artwork).toHaveAttribute("data-avatar-size-role", "profile");
    expect(artwork?.querySelector("img")).toHaveAttribute("alt", "");
    expect(artwork?.querySelector("img")).toHaveAttribute("aria-hidden", "true");
    expect(within(section).getByText(viewModel.profileMetaLabel)).toBeVisible();
    expect(within(section).getByText("나의 아바타 · 한 장 더 읽는 바나나")).toBeVisible();
    expect(within(section).getAllByRole("button", { name: "프로필 편집" })).toHaveLength(1);
    expect(within(section).queryByRole("button", { name: "이름 변경" })).toBeNull();
    expect(within(section).queryByRole("button", { name: "아바타 바꾸기" })).toBeNull();
  });

  it("omits the action container when membership cannot edit", () => {
    const { container } = render(<MemberProfileSummary profile={profile} viewModel={viewModel} canEditProfile={false} onSaveProfile={vi.fn()} />);
    expect(screen.getByText("나의 아바타 · 한 장 더 읽는 바나나")).toBeVisible();
    expect(screen.queryByRole("button", { name: "프로필 편집" })).toBeNull();
    expect(container.querySelector(".rm-member-profile__actions")).toBeNull();
  });

  it("opens the integrated editor from the single action", async () => {
    const user = userEvent.setup();
    render(<MemberProfileSummary profile={profile} viewModel={viewModel} canEditProfile onSaveProfile={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "프로필 편집" }));
    expect(screen.getByRole("dialog", { name: "프로필 편집" })).toBeVisible();
  });
});
