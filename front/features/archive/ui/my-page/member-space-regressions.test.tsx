import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { MyPageProfile } from "@/features/archive/model/archive-model";
import type { MemberSpaceViewModel } from "@/features/archive/model/my-reading-shelf-model";
import { MemberProfileSummary } from "./member-profile-summary";
import { MemberSpaceOverview } from "./member-space-overview";
import { MyReadingShelf } from "./my-reading-shelf";
import { ReadingAchievementSummary } from "./reading-achievement-summary";
import type { RecentReadingListItem } from "./recent-reading-list";

const profile: MyPageProfile = { avatarKey: "banana-green-book", displayName: "멤버1", accountName: "member-one", email: "member1@example.com", role: "MEMBER", membershipStatus: "ACTIVE", clubName: "읽는사이", joinedAt: "2025-11", sessionCount: 7, totalSessionCount: 7, completedReadingCount: 3, currentSessionId: null, recentAttendances: [] };
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
const recentReadings: RecentReadingListItem[] = [{ sessionId: "session-7", sessionNumberLabel: "7차", dateLabel: "2026.07.20", bookTitle: "최근 함께 읽은 책", bookAuthor: "테스트 저자", bookImageUrl: null, coverFallbackLabel: "최", activityLabels: ["질문 2"], feedbackStatus: "피드백 O", href: "/app/sessions/session-7" }];
const save = vi.fn(async (editable) => ({ ...editable, accountName: profile.accountName }));

describe("member-space unaffected presentation", () => {
  it("places the profile before achievements inside the overview", () => {
    const { container } = render(<MemberSpaceOverview><MemberProfileSummary profile={profile} viewModel={viewModel} canEditProfile onSaveProfile={save} /><ReadingAchievementSummary viewModel={viewModel} archiveSessionsHref="/app/archive?view=sessions" /></MemberSpaceOverview>);
    const overview = container.querySelector(".rm-member-space__overview")!;
    const profileSection = within(overview).getByRole("region", { name: "멤버1" });
    const achievement = within(overview).getByRole("region", { name: viewModel.achievementHeading });
    expect(profileSection.compareDocumentPosition(achievement) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("keeps utility links between overview and reading records", () => {
    const { container } = render(<MyReadingShelf profile={profile} viewModel={viewModel} recentReadings={recentReadings} canEditProfile notificationsHref="/notifications" settingsHref="/settings" archiveSessionsHref="/archive" onSaveProfile={save} />);
    const overview = container.querySelector(".rm-member-space__overview")!;
    const utilities = screen.getByRole("region", { name: "내 공간 관리" });
    const records = screen.getByText("나의 독서 기록");
    expect(overview.compareDocumentPosition(utilities) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(utilities.compareDocumentPosition(records) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole("link", { name: /알림/ })).toHaveAttribute("href", "/notifications");
    expect(screen.getByRole("link", { name: /계정 설정/ })).toHaveAttribute("href", "/settings");
    expect(screen.getByRole("link", { name: "최근 함께 읽은 책 회차 기록" })).toHaveAttribute("href", "/app/sessions/session-7");
    expect(screen.getByText("테스트 저자")).toBeVisible();
  });

  it("presents cumulative stats and non-interactive record traces with one archive link", () => {
    const { container } = render(<ReadingAchievementSummary viewModel={viewModel} archiveSessionsHref="/app/archive?view=sessions" />);
    const section = screen.getByRole("region", { name: viewModel.achievementHeading });
    const heading = within(section).getByRole("heading", { level: 2, name: viewModel.achievementHeading });
    const recordsLink = within(section).getByRole("link", { name: "기록 보기" });
    const journeyStats = Array.from(section.querySelectorAll<HTMLElement>(".rm-reading-achievement__stat"));
    const recordTraces = Array.from(section.querySelectorAll<HTMLElement>(".rm-reading-achievement__trace"));

    expect(recordsLink).toHaveAttribute("href", "/app/archive?view=sessions");
    expect(within(section).getAllByRole("link")).toHaveLength(1);
    expect(within(section).getByText("책에서 시작된 생각의 기록")).toBeVisible();
    expect(within(section).getByText("읽고 난 마음을 풀어낸 기록")).toBeVisible();
    for (const value of ["7", "3", "5", "0"]) {
      expect(within(section).getAllByText(value, { exact: true })).toHaveLength(1);
    }
    expect(within(section).queryByText(/완독률/)).toBeNull();
    expect(Array.from(section.querySelectorAll(".rm-reading-achievement__stat-label"), (item) => item.textContent)).toEqual(["함께한 모임", "함께 완독한 책"]);
    expect(container.querySelectorAll(".rm-reading-achievement__trace a, .rm-reading-achievement__trace button")).toHaveLength(0);
    expect([heading, ...journeyStats, recordsLink, ...recordTraces].every((item, index, items) => (
      index === 0 || Boolean(items[index - 1].compareDocumentPosition(item) & Node.DOCUMENT_POSITION_FOLLOWING)
    ))).toBe(true);
  });
});
