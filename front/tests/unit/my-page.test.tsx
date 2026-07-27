import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { MyPageProfile, NotificationPreferences } from "@/features/archive/model/archive-model";
import type { MyJourneyPage } from "@/features/archive/model/my-reading-shelf-model";
import MyPage from "@/features/archive/ui/my-page";

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
  nextCursor: "next-page",
  summary: {
    attendedSessionCount: 6,
    completedReadingCount: 4,
    questionCount: 11,
    reviewCount: 3,
    readableFeedbackDocumentCount: 1,
  },
};

const notificationPreferences: NotificationPreferences = {
  emailEnabled: true,
  events: {
    NEXT_BOOK_PUBLISHED: true,
    SESSION_REMINDER_DUE: true,
    FEEDBACK_DOCUMENT_PUBLISHED: true,
    REVIEW_PUBLISHED: false,
  },
};

function renderMyPage(overrides: Partial<Parameters<typeof MyPage>[0]> = {}) {
  const props: Parameters<typeof MyPage>[0] = {
    data: profile,
    journey,
    LogoutButtonComponent: ({ children }) => <button type="button">{children}</button>,
    onLeaveMembership: async () => undefined,
    notificationPreferences,
    onSaveNotificationPreferences: async (preferences) => preferences,
    onLoadMoreJourney: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };

  return { ...render(<MyPage {...props} />), props };
}

describe("MyPage", () => {
  it("renders the record-first shelf hierarchy and exact personal summary", () => {
    renderMyPage();

    expect(screen.getByRole("heading", { level: 1, name: "나의 서재" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "책별 기록" })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 3, name: "보이지 않는 도시들" })).toHaveLength(2);
    expect(screen.getByText("참여")).toBeInTheDocument();
    expect(screen.getByText("완독 4/6")).toBeInTheDocument();
    expect(screen.getByText("질문")).toBeInTheDocument();
    expect(screen.getByText("서평")).toBeInTheDocument();
    expect(screen.queryByText("member@example.com")).not.toBeInTheDocument();
  });

  it("keeps settings in a controlled disclosure after the record surface", async () => {
    const user = userEvent.setup();
    function ControlledPage() {
      const [settingsOpen, setSettingsOpen] = useState(false);
      return <MyPage {...renderProps()} settingsOpen={settingsOpen} onSettingsOpenChange={setSettingsOpen} />;
    }

    render(<ControlledPage />);
    const trigger = screen.getByRole("button", { name: "계정·알림 설정" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("region", { name: "계정·알림 설정" })).not.toBeInTheDocument();

    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("region", { name: "계정·알림 설정" })).toBeInTheDocument();
  });

  it("forwards the route-owned load-more callback without replacing rendered records", async () => {
    const user = userEvent.setup();
    const onLoadMoreJourney = vi.fn().mockResolvedValue(undefined);
    renderMyPage({ onLoadMoreJourney });

    await user.click(screen.getByRole("button", { name: "기록 더 보기" }));
    expect(onLoadMoreJourney).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("article", { name: "9차 보이지 않는 도시들" })).toBeInTheDocument();
  });

  it("shows the membership-aware empty action instead of zero-value record rows", () => {
    renderMyPage({ journey: { ...journey, items: [], nextCursor: null } });

    expect(screen.getByText("아직 쌓인 개인 기록이 없습니다")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "아카이브 보기" })).toHaveAttribute("href", "/app/archive");
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
  });
});

function renderProps(): Parameters<typeof MyPage>[0] {
  return {
    data: profile,
    journey,
    LogoutButtonComponent: ({ children }) => <button type="button">{children}</button>,
    onLeaveMembership: async () => undefined,
    notificationPreferences,
    onSaveNotificationPreferences: async (preferences) => preferences,
    onLoadMoreJourney: async () => undefined,
  };
}
