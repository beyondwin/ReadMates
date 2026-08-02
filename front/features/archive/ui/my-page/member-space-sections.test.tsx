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
    { kind: "sessions", label: "참여한 모임", value: "7", unit: "회" },
    { kind: "completed", label: "완독한 책", value: "3", unit: "권" },
  ],
  recordTraces: [
    { kind: "questions", label: "대화를 연 질문", description: "책에서 시작된 생각의 기록", value: "5", unit: "개" },
    { kind: "reviews", label: "남긴 서평", description: "아직 남긴 서평이 없어요", value: "0", unit: "편" },
  ],
};

describe("MemberProfileSummary", () => {
  it("renders one read-only identity hierarchy and one integrated edit action", () => {
    const { container } = render(<MemberProfileSummary profile={profile} viewModel={viewModel} canEditProfile onSaveProfile={vi.fn()} />);
    const section = screen.getByRole("region", { name: profile.displayName });
    expect(within(section).getAllByRole("heading", { level: 1, name: profile.displayName })).toHaveLength(1);
    const figure = container.querySelector(".rm-member-profile__avatar-figure");
    const artwork = figure?.querySelector(".rm-member-profile__avatar.rm-avatar-chip--artwork");
    expect(artwork).toHaveClass("rm-avatar-chip");
    expect(artwork).toHaveAttribute("data-avatar-size-role", "profile");
    expect(artwork?.querySelector("img")).toHaveAttribute("alt", "");
    expect(artwork?.querySelector("img")).toHaveAttribute("aria-hidden", "true");
    expect(Array.from(section.querySelectorAll(".rm-member-profile__meta-line"), (line) => line.textContent)).toEqual([
      "읽는사이 · 멤버",
      "2025.11부터 함께",
    ]);
    expect(figure?.querySelector("figcaption")).toHaveTextContent("한 장 더 읽는 바나나");
    expect(section).not.toHaveTextContent("나의 아바타 ·");
    const identity = section.querySelector(".rm-member-profile__identity");
    expect(identity).not.toBeNull();
    const editButton = within(identity as HTMLElement).getByRole("button", { name: "프로필 편집" });
    expect(editButton).toHaveTextContent("프로필 편집");
    expect(editButton.querySelector("svg")).toBeNull();
    expect(section.querySelector(".rm-member-profile__actions")).toBeNull();
    expect(within(section).queryByRole("button", { name: "이름 변경" })).toBeNull();
    expect(within(section).queryByRole("button", { name: "아바타 바꾸기" })).toBeNull();
  });

  it("omits the action container when membership cannot edit", () => {
    const { container } = render(<MemberProfileSummary profile={profile} viewModel={viewModel} canEditProfile={false} onSaveProfile={vi.fn()} />);
    expect(container.querySelector("figcaption")).toHaveTextContent("한 장 더 읽는 바나나");
    expect(screen.queryByText(/나의 아바타 ·/)).toBeNull();
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
