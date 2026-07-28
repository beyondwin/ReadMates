import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { MyPageProfile } from "@/features/archive/model/archive-model";
import type { MyJourneyPage } from "@/features/archive/model/my-reading-shelf-model";
import MyPage from "@/features/archive/ui/my-page";

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

function renderMyPage(overrides: Partial<Parameters<typeof MyPage>[0]> = {}) {
  return render(<MyPage data={profile} journey={journey} {...overrides} />);
}

describe("MyPage", () => {
  it("renders only the summary and recent-book shelf hierarchy", () => {
    renderMyPage();

    expect(screen.getByRole("heading", {
      level: 1,
      name: "나의 서재",
    })).toBeVisible();
    expect(screen.getByRole("heading", {
      level: 2,
      name: "최근 책별 기록",
    })).toBeVisible();
    expect(screen.queryByRole("button", {
      name: "계정·알림 설정",
    })).toBeNull();
    expect(screen.queryByRole("region", {
      name: "계정과 알림",
    })).toBeNull();
    expect(screen.queryByText(/마지막 기록은/)).toBeNull();
    expect(screen.queryByRole("button", {
      name: "기록 더 보기",
    })).toBeNull();
  });

  it("shows the membership-aware empty action instead of zero-value record rows", () => {
    renderMyPage({ journey: { ...journey, items: [], nextCursor: null } });

    expect(screen.getByText("아직 쌓인 개인 기록이 없습니다")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "아카이브 보기" })).toHaveAttribute("href", "/app/archive");
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "개인 요약" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 2, name: "최근 책별 기록" })).not.toBeInTheDocument();
  });

  it("keeps a viewer's empty shelf free of personal-summary metrics and record chrome", () => {
    renderMyPage({
      data: { ...profile, membershipStatus: "VIEWER", currentSessionId: "current-session" },
      journey: { ...journey, items: [], nextCursor: null, summary: { ...journey.summary, attendedSessionCount: 0, completedReadingCount: 0, questionCount: 0, reviewCount: 0 } },
    });

    expect(screen.getByRole("link", { name: "아카이브 둘러보기" })).toHaveAttribute("href", "/app/archive");
    expect(screen.queryByRole("region", { name: "개인 요약" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 2, name: "최근 책별 기록" })).not.toBeInTheDocument();
  });
});
