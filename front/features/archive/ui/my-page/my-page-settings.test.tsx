import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { MyPageProfile } from "@/features/archive/model/archive-model";
import type { MyJourneyPage } from "@/features/archive/model/my-reading-shelf-model";
import MyPage from "../my-page";

afterEach(cleanup);

const profile: MyPageProfile = {
  displayName: "샘플 멤버",
  accountName: "sample-member",
  email: "member@example.com",
  role: "MEMBER",
  membershipStatus: "ACTIVE",
  clubName: "샘플 독서모임",
  joinedAt: "2026-01",
  sessionCount: 6,
  totalSessionCount: 9,
  completedReadingCount: 4,
  currentSessionId: null,
  recentAttendances: [],
};

const journey: MyJourneyPage = {
  items: [
    {
      sessionId: "session-9",
      sessionNumber: 9,
      bookTitle: "보이지 않는 도시들",
      bookAuthor: "이탈로 칼비노",
      bookImageUrl: null,
      date: "2026-07-22",
      readingProgress: 100,
      questionCount: 2,
      reviewCount: 1,
      feedbackDocument: { available: true, readable: true, lockedReason: null },
    },
  ],
  nextCursor: null,
  summary: {
    attendedSessionCount: 6,
    completedReadingCount: 4,
    questionCount: 11,
    reviewCount: 3,
    readableFeedbackDocumentCount: 1,
  },
};

describe("MyPage settings boundary", () => {
  it("does not expose account settings controls on the member shelf", () => {
    render(<MyPage data={profile} journey={journey} />);

    expect(screen.queryByRole("button", { name: "계정·알림 설정" })).toBeNull();
    expect(screen.queryByRole("region", { name: "계정과 알림" })).toBeNull();
    expect(screen.queryByRole("switch", { name: "이메일 알림" })).toBeNull();
    expect(screen.queryByRole("button", { name: "로그아웃" })).toBeNull();
    expect(screen.queryByRole("button", { name: "탈퇴" })).toBeNull();
  });
});
