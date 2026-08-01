import { useState } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { MyPageProfile } from "@/features/archive/model/archive-model";
import type { MemberSpaceViewModel } from "@/features/archive/model/my-reading-shelf-model";
import { MemberProfileSummary } from "./member-profile-summary";
import { MemberSpaceOverview } from "./member-space-overview";
import { MyReadingShelf } from "./my-reading-shelf";
import { ReadingAchievementSummary } from "./reading-achievement-summary";
import type { RecentReadingListItem } from "./recent-reading-list";
import type { AvatarUpdateResult, ProfileUpdateResult } from "./types";

const profile: MyPageProfile = {
  avatarKey: "squirrel-acorn",
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

const recentReadings: RecentReadingListItem[] = [{
  sessionId: "session-7",
  sessionNumberLabel: "7차",
  dateLabel: "2026.07.20",
  bookTitle: "최근 함께 읽은 책",
  bookAuthor: "테스트 저자",
  bookImageUrl: null,
  coverFallbackLabel: "최",
  activityLabels: ["질문 2"],
  feedbackStatus: "피드백 O",
  href: "/app/sessions/session-7",
}];

function renderProfileSummary(canEditProfile = true) {
  return render(
    <MemberProfileSummary
      profile={profile}
      viewModel={viewModel}
      canEditProfile={canEditProfile}
      onUpdateProfile={vi.fn().mockResolvedValue({ displayName: profile.displayName, accountName: profile.accountName })}
      onUpdateAvatar={vi.fn().mockResolvedValue({ avatarKey: profile.avatarKey })}
    />,
  );
}

describe("member-space presentation sections", () => {
  it.each([
    ["squirrel-acorn", "/assets/avatars/book-club/squirrel-acorn.webp"],
    ["future-avatar", "/assets/avatars/book-club/hedgehog-green-book.webp"],
  ])("renders the stored %s profile key through AvatarChip", (avatarKey, expectedSrc) => {
    const { container } = render(
      <MemberProfileSummary
        profile={{ ...profile, avatarKey }}
        viewModel={viewModel}
        canEditProfile
        onUpdateProfile={vi.fn().mockResolvedValue({ displayName: profile.displayName, accountName: profile.accountName })}
        onUpdateAvatar={vi.fn().mockResolvedValue({ avatarKey })}
      />,
    );

    expect(container.querySelector(".rm-avatar-picker .rm-avatar-chip img, .rm-avatar-picker__opener .rm-avatar-chip img")).toHaveAttribute("src", expectedSrc);
  });

  it("renders one avatar opener before identity, inline name editing, and membership context", () => {
    const { container } = renderProfileSummary();
    const section = screen.getByRole("region", { name: "멤버1" });
    const avatar = within(section).getByRole("button", { name: "아바타 바꾸기" });
    const kicker = within(section).getByText("내 프로필");
    const heading = within(section).getByRole("heading", { level: 1, name: "멤버1" });
    const edit = within(section).getByRole("button", { name: "이름 변경" });
    const byline = within(section).getByText("읽는사이 · 멤버 · 2025.11부터 함께");

    expect(avatar.compareDocumentPosition(kicker) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(kicker.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(heading.compareDocumentPosition(edit) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(edit.compareDocumentPosition(byline) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(section).getAllByRole("button", { name: "아바타 바꾸기" })).toHaveLength(1);
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    expect(screen.queryByRole("link", { name: /계정 (관리|설정)/ })).toBeNull();
  });

  it("renders only a decorative avatar when profile editing is not allowed", () => {
    const { container } = renderProfileSummary(false);

    expect(screen.getByRole("heading", { level: 1, name: "멤버1" })).toBeVisible();
    expect(screen.getByText("읽는사이 · 멤버 · 2025.11부터 함께")).toBeVisible();
    expect(screen.queryByRole("button", { name: "이름 변경" })).toBeNull();
    expect(screen.queryByRole("button", { name: "아바타 바꾸기" })).toBeNull();
    expect(container.querySelector(".rm-avatar-picker--decorative .rm-avatar-chip img")).toHaveAttribute(
      "src",
      "/assets/avatars/book-club/squirrel-acorn.webp",
    );
    expect(screen.queryByLabelText("이름 변경 준비 중")).toBeNull();
    expect(screen.queryByRole("link", { name: /계정 (관리|설정)/ })).toBeNull();
  });

  it("keeps the source avatar until explicit save and then renders the saved key", async () => {
    const onUpdateAvatar = vi.fn(async (avatarKey: string) => ({
      displayName: profile.displayName,
      accountName: profile.accountName,
      avatarKey,
    }));

    function StatefulProfileSummary() {
      const [currentProfile, setCurrentProfile] = useState(profile);
      const saveAvatar = async (avatarKey: string): Promise<AvatarUpdateResult> => {
        const updated = await onUpdateAvatar(avatarKey);
        setCurrentProfile((current) => ({ ...current, avatarKey: updated.avatarKey }));
        return updated;
      };

      return (
        <MemberProfileSummary
          profile={currentProfile}
          viewModel={viewModel}
          canEditProfile
          onUpdateProfile={vi.fn().mockResolvedValue({
            displayName: profile.displayName,
            accountName: profile.accountName,
          })}
          onUpdateAvatar={saveAvatar}
        />
      );
    }

    const user = userEvent.setup();
    render(<StatefulProfileSummary />);
    const opener = screen.getByRole("button", { name: "아바타 바꾸기" });

    expect(opener.querySelector("img")).toHaveAttribute(
      "src",
      "/assets/avatars/book-club/squirrel-acorn.webp",
    );
    await user.click(opener);
    const dialog = screen.getByRole("dialog", { name: "나의 아바타 선택" });
    await user.click(within(dialog).getByRole("button", {
      name: "초록 찻잔을 든 고슴도치 선택",
    }));

    expect(onUpdateAvatar).not.toHaveBeenCalled();
    expect(opener.querySelector("img")).toHaveAttribute(
      "src",
      "/assets/avatars/book-club/squirrel-acorn.webp",
    );

    await user.click(within(dialog).getByRole("button", { name: "이 아바타로 변경" }));

    expect(onUpdateAvatar).toHaveBeenCalledWith("hedgehog-green-mug");
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "아바타 바꾸기" }).querySelector("img")).toHaveAttribute(
        "src",
        "/assets/avatars/book-club/hedgehog-green-mug.webp",
      );
    });
  });

  it("replaces the visible name row with a labelled editor while preserving the profile heading", async () => {
    const user = userEvent.setup();
    renderProfileSummary();

    await user.click(screen.getByRole("button", { name: "이름 변경" }));

    const heading = screen.getByRole("heading", { level: 1, name: "멤버1" });
    expect(heading).toHaveAttribute("id", "member-profile-name");
    expect(heading).toHaveClass("rm-sr-only");
    expect(screen.getByRole("region", { name: "멤버1" })).toBeVisible();
    expect(screen.getByRole("textbox", { name: "표시 이름" })).toHaveFocus();
    expect(screen.getByRole("button", { name: "이름 저장" })).toHaveTextContent("저장");
    expect(screen.getByRole("button", { name: "취소" })).toBeVisible();
  });

  it("moves focus from the name-change control to the name input when editing opens", async () => {
    const user = userEvent.setup();
    renderProfileSummary();

    await user.click(screen.getByRole("button", { name: "이름 변경" }));

    expect(screen.getByRole("textbox", { name: "표시 이름" })).toHaveFocus();
  });

  it("returns focus to the name-change control after cancelling", async () => {
    const user = userEvent.setup();
    renderProfileSummary();

    await user.click(screen.getByRole("button", { name: "이름 변경" }));
    await user.click(screen.getByRole("button", { name: "취소" }));

    expect(screen.getByRole("button", { name: "이름 변경" })).toHaveFocus();
  });

  it("cancels an edited draft with Escape and restores focus", async () => {
    const user = userEvent.setup();
    renderProfileSummary();

    await user.click(screen.getByRole("button", { name: "이름 변경" }));
    const input = screen.getByRole("textbox", { name: "표시 이름" });
    await user.clear(input);
    await user.type(input, "바꾸려던 이름");
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("textbox", { name: "표시 이름" })).toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: "멤버1" })).not.toHaveClass("rm-sr-only");
    expect(screen.getByRole("button", { name: "이름 변경" })).toHaveFocus();
  });

  it("returns focus to the name-change control after a successful save", async () => {
    const user = userEvent.setup();
    renderProfileSummary();

    await user.click(screen.getByRole("button", { name: "이름 변경" }));
    await user.click(screen.getByRole("button", { name: "이름 저장" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "이름 변경" })).toHaveFocus();
    });
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
        onUpdateAvatar={vi.fn().mockResolvedValue({ avatarKey: profile.avatarKey })}
      />,
    );

    await user.click(screen.getByRole("button", { name: "이름 변경" }));
    await user.click(screen.getByRole("button", { name: "이름 저장" }));
    await user.keyboard("{Escape}");

    expect(screen.getByRole("textbox", { name: "표시 이름" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "이름 저장" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "취소" })).toBeDisabled();
    expect(screen.getByText("저장 중…")).toBeVisible();
  });

  it("keeps the edited draft focused and linked to a nearby save error", async () => {
    const user = userEvent.setup();
    render(
      <MemberProfileSummary
        profile={profile}
        viewModel={viewModel}
        canEditProfile
        onUpdateProfile={vi.fn().mockRejectedValue(
          new Error("같은 클럽에서 이미 쓰고 있는 이름입니다."),
        )}
        onUpdateAvatar={vi.fn().mockResolvedValue({ avatarKey: profile.avatarKey })}
      />,
    );

    await user.click(screen.getByRole("button", { name: "이름 변경" }));
    const input = screen.getByRole("textbox", { name: "표시 이름" });
    await user.clear(input);
    await user.type(input, "새 표시 이름");
    await user.click(screen.getByRole("button", { name: "이름 저장" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "같은 클럽에서 이미 쓰고 있는 이름입니다.",
    );
    expect(input).toHaveValue("새 표시 이름");
    expect(input).toHaveAttribute("aria-describedby", alert.id);
    expect(input).toHaveFocus();
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
          onUpdateAvatar={vi.fn().mockResolvedValue({ avatarKey: profile.avatarKey })}
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

  it("places the My Space utility links between the overview and reading records", () => {
    const { container } = render(
      <MyReadingShelf
        profile={profile}
        viewModel={viewModel}
        recentReadings={recentReadings}
        canEditProfile
        notificationsHref="/clubs/reading-sai/app/notifications"
        settingsHref="/clubs/reading-sai/app/me/settings"
        archiveSessionsHref="/clubs/reading-sai/app/archive?view=sessions"
        onUpdateProfile={vi.fn().mockResolvedValue({
          displayName: profile.displayName,
          accountName: profile.accountName,
        })}
        onUpdateAvatar={vi.fn().mockResolvedValue({ avatarKey: profile.avatarKey })}
      />,
    );

    const overview = container.querySelector(".rm-member-space__overview")!;
    const utilities = screen.getByRole("region", { name: "내 공간 관리" });
    const recordsKicker = screen.getByText("나의 독서 기록");
    const notificationLink = screen.getByRole("link", { name: /알림.*받은 알림과 수신 설정/ });
    const settingsLink = screen.getByRole("link", { name: /계정 설정.*프로필과 멤버십 정보/ });

    expect(overview.compareDocumentPosition(utilities) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(utilities.compareDocumentPosition(recordsKicker) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(notificationLink).toHaveAttribute("href", "/clubs/reading-sai/app/notifications");
    expect(settingsLink).toHaveAttribute("href", "/clubs/reading-sai/app/me/settings");
    expect(notificationLink.querySelectorAll("[aria-hidden=\"true\"]")).toHaveLength(1);
    expect(settingsLink.querySelectorAll("[aria-hidden=\"true\"]")).toHaveLength(1);
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
