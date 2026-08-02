import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MyPageProfile } from "@/features/archive/model/archive-model";
import type { MemberSpaceViewModel } from "@/features/archive/model/my-reading-shelf-model";
import MyPage from "@/features/archive/ui/my-page";
import type { RecentReadingListItem } from "@/features/archive/ui/my-page/recent-reading-list";

afterEach(cleanup);

const profile: MyPageProfile = {
  avatarKey: "banana-green-book",
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
  profileMetaLabel: "샘플 독서모임 · 멤버 · 2024.11부터 함께",
  achievementHeading: "읽고, 묻고, 기록해 온 시간",
  journeyStats: [
    { kind: "sessions", label: "함께한 모임", value: "9", unit: "회" },
    { kind: "completed", label: "함께 완독한 책", value: "7", unit: "권" },
  ],
  recordTraces: [
    { kind: "questions", label: "대화를 연 질문", description: "책에서 시작된 생각의 기록", value: "0", unit: "개" },
    { kind: "reviews", label: "남긴 서평", description: "읽고 난 마음을 풀어낸 기록", value: "0", unit: "편" },
  ],
};

const recentReadings: RecentReadingListItem[] = [{
  sessionId: "session-9",
  sessionNumberLabel: "9차",
  dateLabel: "2026.07.20",
  bookTitle: "최근 함께 읽은 책",
  bookAuthor: "테스트 저자",
  bookImageUrl: null,
  coverFallbackLabel: "최",
  activityLabels: ["질문 2"],
  feedbackStatus: "피드백 O",
  href: "/app/sessions/session-9",
}];

describe("MyPage", () => {
  it("composes the member profile before cumulative achievements without a route-owned logout control", () => {
    const { container } = render(
      <MyPage
        profile={profile}
        viewModel={viewModel}
        recentReadings={recentReadings}
        canEditProfile
        notificationsHref="/app/notifications"
        settingsHref="/app/me/settings"
        archiveSessionsHref="/app/archive?view=sessions"
        onSaveProfile={vi.fn().mockImplementation(async (editable) => ({ ...editable, accountName: profile.accountName }))}
      />,
    );

    const overview = container.querySelector(".rm-member-space__overview")!;
    const recent = screen.getByRole("region", { name: "최근 독서 기록" });
    const profileSection = screen.getByRole("region", { name: "샘플 멤버" });
    const achievementSection = screen.getByRole("region", { name: "읽고, 묻고, 기록해 온 시간" });

    expect(screen.queryByRole("link", { name: "계정 관리" })).toBeNull();
    expect(screen.getByRole("button", { name: "프로필 편집" })).toBeVisible();
    expect(profileSection.compareDocumentPosition(achievementSection) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(
      overview.compareDocumentPosition(recent) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "로그아웃" })).toBeNull();
    expect(container.querySelector(".rm-member-profile")).not.toBeNull();
  });
});
