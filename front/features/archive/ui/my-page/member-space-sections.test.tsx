import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { MyPageProfile } from "@/features/archive/model/archive-model";
import type { MemberSpaceViewModel } from "@/features/archive/model/my-reading-shelf-model";
import { MemberProfileSummary } from "./member-profile-summary";
import { MemberSpaceOverview } from "./member-space-overview";
import { ReadingAchievementSummary } from "./reading-achievement-summary";
import type { ProfileUpdateResult } from "./types";

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
  profileMetaLabel: "읽는사이 · 멤버 · 2025.11부터 함께",
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
      onUpdateProfile={vi.fn().mockResolvedValue({ displayName: profile.displayName, accountName: profile.accountName })}
    />,
  );
}

describe("member-space presentation sections", () => {
  it("renders identity, inline name editing, and membership context without account navigation", () => {
    renderProfileSummary();
    const section = screen.getByRole("region", { name: "멤버1" });
    const heading = within(section).getByRole("heading", { level: 1, name: "멤버1" });
    const edit = within(section).getByRole("button", { name: "이름 변경" });
    const byline = within(section).getByText("읽는사이 · 멤버 · 2025.11부터 함께");

    expect(screen.getByText("내 프로필")).toBeVisible();
    expect(heading.compareDocumentPosition(edit) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(edit.compareDocumentPosition(byline) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole("link", { name: /계정 (관리|설정)/ })).toBeNull();
  });

  it("omits only the name-change control when profile editing is not allowed", () => {
    renderProfileSummary(false);

    expect(screen.getByRole("heading", { level: 1, name: "멤버1" })).toBeVisible();
    expect(screen.getByText("읽는사이 · 멤버 · 2025.11부터 함께")).toBeVisible();
    expect(screen.queryByRole("button", { name: "이름 변경" })).toBeNull();
    expect(screen.queryByLabelText("이름 변경 준비 중")).toBeNull();
    expect(screen.queryByRole("link", { name: /계정 (관리|설정)/ })).toBeNull();
  });

  it("keeps the labelled profile heading available while editing the display name", async () => {
    const user = userEvent.setup();
    renderProfileSummary();

    await user.click(screen.getByRole("button", { name: "이름 변경" }));

    expect(screen.getByRole("heading", { level: 1, name: "멤버1" })).toHaveAttribute("id", "member-profile-name");
    expect(screen.getByRole("region", { name: "멤버1" })).toBeVisible();
    expect(screen.getByLabelText("이름")).toBeVisible();
    expect(screen.getByRole("button", { name: "이름 저장" })).toBeVisible();
    expect(screen.getByRole("button", { name: "취소" })).toBeVisible();
  });

  it("keeps the member-space editor stable while a save is pending", async () => {
    const pendingSave = new Promise<ProfileUpdateResult>(() => undefined);
    const user = userEvent.setup();
    render(
      <MemberProfileSummary
        profile={profile}
        viewModel={viewModel}
        canEditProfile
        onUpdateProfile={() => pendingSave}
      />,
    );

    await user.click(screen.getByRole("button", { name: "이름 변경" }));
    await user.click(screen.getByRole("button", { name: "이름 저장" }));

    expect(screen.getByRole("button", { name: "이름 저장" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "취소" })).toBeDisabled();
    expect(screen.getByText("저장 중")).toBeVisible();
  });

  it("keeps the editor open and exposes a nearby save error", async () => {
    const user = userEvent.setup();
    render(
      <MemberProfileSummary
        profile={profile}
        viewModel={viewModel}
        canEditProfile
        onUpdateProfile={vi.fn().mockRejectedValue(
          new Error("같은 클럽에서 이미 쓰고 있는 이름입니다."),
        )}
      />,
    );

    await user.click(screen.getByRole("button", { name: "이름 변경" }));
    await user.click(screen.getByRole("button", { name: "이름 저장" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "같은 클럽에서 이미 쓰고 있는 이름입니다.",
    );
    expect(screen.getByLabelText("이름")).toBeVisible();
  });

  it("places the profile before achievements inside the member-space overview", () => {
    const { container } = render(
      <MemberSpaceOverview>
        <MemberProfileSummary
          profile={profile}
          viewModel={viewModel}
          canEditProfile
          onUpdateProfile={vi.fn().mockResolvedValue({
            displayName: profile.displayName,
            accountName: profile.accountName,
          })}
        />
        <ReadingAchievementSummary viewModel={viewModel} />
      </MemberSpaceOverview>,
    );
    const overview = container.querySelector(".rm-member-space__overview")!;
    const profileSection = within(overview).getByRole("region", { name: "멤버1" });
    const achievementSection = within(overview).getByRole("region", {
      name: "일곱 번의 모임에서 세 권을 끝까지 읽었어요.",
    });

    expect(
      profileSection.compareDocumentPosition(achievementSection) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
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
    expect(within(section).queryByText("멤버십 시작")).toBeNull();
    expect(container.querySelectorAll("ol, ul, [role='img'], svg")).toHaveLength(0);
    expect(screen.queryByText(/2026|최근|연속/)).toBeNull();
    expect(screen.queryByRole("link", { name: /기록/ })).toBeNull();
  });
});
