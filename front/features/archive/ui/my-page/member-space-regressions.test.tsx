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
const viewModel: MemberSpaceViewModel = { profileMetaLabel: "읽는사이 · 멤버 · 2025.11부터 함께", achievementHeading: "일곱 번의 모임에서 세 권을 끝까지 읽었어요.", achievementBody: "함께 읽는 시간이 차분히 쌓이고 있습니다.", metrics: [{ label: "함께한 모임", value: "7" }, { label: "완독", value: "3" }, { label: "질문", value: "5" }, { label: "서평", value: "2" }] };
const recentReadings: RecentReadingListItem[] = [{ sessionId: "session-7", sessionNumberLabel: "7차", dateLabel: "2026.07.20", bookTitle: "최근 함께 읽은 책", bookAuthor: "테스트 저자", bookImageUrl: null, coverFallbackLabel: "최", activityLabels: ["질문 2"], feedbackStatus: "피드백 O", href: "/app/sessions/session-7" }];
const save = vi.fn(async (editable) => ({ ...editable, accountName: profile.accountName }));

describe("member-space unaffected presentation", () => {
  it("places the profile before achievements inside the overview", () => {
    const { container } = render(<MemberSpaceOverview><MemberProfileSummary profile={profile} viewModel={viewModel} canEditProfile onSaveProfile={save} /><ReadingAchievementSummary viewModel={viewModel} /></MemberSpaceOverview>);
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

  it("presents cumulative achievements as ordered definition-list metrics only", () => {
    const { container } = render(<ReadingAchievementSummary viewModel={viewModel} />);
    const section = screen.getByRole("region", { name: viewModel.achievementHeading });
    expect(Array.from(section.querySelectorAll("dt"), (item) => item.textContent)).toEqual(["함께한 모임", "완독", "질문", "서평"]);
    expect(Array.from(section.querySelectorAll("dd"), (item) => item.textContent)).toEqual(["7", "3", "5", "2"]);
    expect(container.querySelectorAll("ol, ul, [role='img'], svg")).toHaveLength(0);
    expect(within(section).queryByText("멤버십 시작")).toBeNull();
  });
});
