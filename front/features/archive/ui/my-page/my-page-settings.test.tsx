import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MyPageProfile, NotificationPreferences } from "@/features/archive/model/archive-model";
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

const notificationPreferences: NotificationPreferences = {
  emailEnabled: true,
  events: {
    NEXT_BOOK_PUBLISHED: true,
    SESSION_REMINDER_DUE: true,
    FEEDBACK_DOCUMENT_PUBLISHED: true,
    REVIEW_PUBLISHED: false,
  },
};

function renderSettings(overrides: Partial<Parameters<typeof MyPage>[0]> = {}) {
  function ControlledMyPage() {
    const [settingsOpen, setSettingsOpen] = useState(false);

    return (
      <MyPage
        data={profile}
        journey={journey}
        LogoutButtonComponent={({ children }) => <button type="button">{children}</button>}
        onLeaveMembership={async () => undefined}
        canEditProfile
        onUpdateProfile={async (displayName) => ({ displayName, accountName: profile.accountName })}
        notificationPreferences={notificationPreferences}
        onSaveNotificationPreferences={async (preferences) => preferences}
        settingsOpen={settingsOpen}
        onSettingsOpenChange={setSettingsOpen}
        {...overrides}
      />
    );
  }

  return render(<ControlledMyPage />);
}

describe("MyPage settings disclosure", () => {
  it("keeps email and writable notification controls inside the closed-by-default disclosure", async () => {
    const user = userEvent.setup();
    renderSettings();

    const trigger = screen.getByRole("button", { name: "계정·알림 설정" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveAttribute("aria-controls", "my-page-settings");
    expect(document.getElementById("my-page-settings")).toHaveAttribute("hidden");
    expect(screen.queryByRole("switch", { name: "이메일 알림" })).not.toBeInTheDocument();

    await user.click(trigger);

    expect(screen.getByText(profile.email)).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "이메일 알림" })).toBeInTheDocument();
  });

  it("moves focus to the settings heading after opening without exposing hidden controls", async () => {
    const user = userEvent.setup();
    renderSettings();

    const trigger = screen.getByRole("button", { name: "계정·알림 설정" });
    await user.click(trigger);

    const heading = screen.getByRole("heading", { level: 2, name: "계정과 알림" });
    await waitFor(() => expect(heading).toHaveFocus());
    expect(screen.getByRole("region", { name: "계정과 알림" })).toContainElement(heading);
  });

  it("keeps profile, membership, notifications, logout, and membership boundary in order", async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.click(screen.getByRole("button", { name: "계정·알림 설정" }));

    const profileHeading = screen.getByRole("heading", { name: "프로필" });
    const membershipHeading = screen.getByRole("heading", { name: "멤버십" });
    const notificationsHeading = screen.getByRole("heading", { name: "알림" });
    const logout = screen.getByRole("button", { name: "로그아웃" });
    const boundaryHeading = screen.getByRole("heading", { name: "멤버십 경계" });

    expect(profileHeading.compareDocumentPosition(membershipHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(membershipHeading.compareDocumentPosition(notificationsHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(notificationsHeading.compareDocumentPosition(logout) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(logout.compareDocumentPosition(boundaryHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole("button", { name: "탈퇴" })).toBeInTheDocument();
  });

  it("isolates an optional notification load failure without blanking the record journey", async () => {
    const user = userEvent.setup();
    const onRetryNotificationPreferences = vi.fn();
    renderSettings({ notificationPreferencesError: true, onRetryNotificationPreferences });

    expect(screen.getByRole("article", { name: "9차 보이지 않는 도시들" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "계정·알림 설정" }));

    expect(screen.getByRole("alert")).toHaveTextContent("알림 설정을 불러오지 못했습니다.");
    await user.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(onRetryNotificationPreferences).toHaveBeenCalledOnce();
    expect(screen.getByRole("article", { name: "9차 보이지 않는 도시들" })).toBeInTheDocument();
  });

  it("explains unavailable notifications for viewers without rendering writable switches", async () => {
    const user = userEvent.setup();
    renderSettings({ data: { ...profile, membershipStatus: "VIEWER" }, canManageNotificationPreferences: false });

    await user.click(screen.getByRole("button", { name: "계정·알림 설정" }));

    expect(screen.getByText("알림 수신은 현재 멤버십에서 제공되지 않습니다.")).toBeInTheDocument();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  });
});
