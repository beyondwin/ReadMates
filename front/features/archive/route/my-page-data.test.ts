import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MyJourneyPage, MyPageResponse, NotificationPreferencesResponse } from "@/features/archive/api/archive-contracts";
import { myPageLoader } from "./my-page-data";

const api = vi.hoisted(() => ({
  fetchMyPage: vi.fn(),
  fetchMyJourney: vi.fn(),
  fetchNotificationPreferences: vi.fn(),
  fetchMyFeedbackDocuments: vi.fn(),
  fetchMyArchiveQuestions: vi.fn(),
  fetchMyArchiveReviews: vi.fn(),
}));

const auth = vi.hoisted(() => ({ loadArchiveMemberAuth: vi.fn() }));

vi.mock("@/features/archive/api/archive-api", () => api);
vi.mock("@/features/archive/route/archive-loader-auth", () => auth);

const profile: MyPageResponse = {
  displayName: "독자",
  accountName: "책친구",
  email: "reader@example.com",
  role: "MEMBER",
  membershipStatus: "ACTIVE",
  clubName: "읽는 사이",
  joinedAt: "2026-01",
  sessionCount: 2,
  totalSessionCount: 3,
  completedReadingCount: 1,
  currentSessionId: "session-current",
  recentAttendances: [],
};

const journey: MyJourneyPage = {
  items: [
    {
      sessionId: "session-1",
      sessionNumber: 1,
      bookTitle: "팩트풀니스",
      bookAuthor: "한스 로슬링",
      bookImageUrl: null,
      date: "2026-01-24",
      readingProgress: 100,
      questionCount: 2,
      reviewCount: 1,
      feedbackDocument: { available: true, readable: true, lockedReason: null },
    },
  ],
  nextCursor: "cursor-2",
  summary: {
    attendedSessionCount: 2,
    completedReadingCount: 1,
    questionCount: 2,
    reviewCount: 1,
    readableFeedbackDocumentCount: 1,
  },
};

const preferences: NotificationPreferencesResponse = {
  emailEnabled: true,
  events: {
    NEXT_BOOK_PUBLISHED: true,
    SESSION_REMINDER_DUE: true,
    FEEDBACK_DOCUMENT_PUBLISHED: true,
    REVIEW_PUBLISHED: true,
  },
};

function activeAccess(membershipStatus: "ACTIVE" | "VIEWER" = "ACTIVE") {
  return {
    allowed: true,
    auth: {
      authenticated: true,
      userId: "reader-user",
      membershipId: "reader-membership",
      clubId: "club-id",
      email: profile.email,
      displayName: profile.displayName,
      accountName: profile.accountName,
      role: "MEMBER" as const,
      membershipStatus,
      approvalState: membershipStatus,
    },
  };
}

describe("myPageLoader", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    auth.loadArchiveMemberAuth.mockResolvedValue(activeAccess());
    api.fetchMyPage.mockResolvedValue(profile);
    api.fetchMyJourney.mockResolvedValue(journey);
    api.fetchNotificationPreferences.mockResolvedValue(preferences);
  });

  it("loads the required profile and journey with optional notification preferences", async () => {
    const result = await myPageLoader();

    expect(result).toEqual({
      profile,
      journey,
      notificationPreferences: { status: "ready", preferences },
    });
    expect(api.fetchMyPage).toHaveBeenCalledTimes(1);
    expect(api.fetchMyJourney).toHaveBeenCalledWith({ clubSlug: undefined }, { limit: 12 });
    expect(api.fetchNotificationPreferences).toHaveBeenCalledTimes(1);
    expect(api.fetchMyFeedbackDocuments).not.toHaveBeenCalled();
    expect(api.fetchMyArchiveQuestions).not.toHaveBeenCalled();
    expect(api.fetchMyArchiveReviews).not.toHaveBeenCalled();
  });

  it.each([
    ["profile", "fetchMyPage"],
    ["journey", "fetchMyJourney"],
  ] as const)("rejects when the required %s request fails", async (_name, request) => {
    api[request].mockRejectedValueOnce(new Error("required request failed"));

    await expect(myPageLoader()).rejects.toThrow("required request failed");
  });

  it("keeps the shelf route available when notification preferences fail", async () => {
    api.fetchNotificationPreferences.mockRejectedValueOnce(new Error("preferences unavailable"));

    await expect(myPageLoader()).resolves.toEqual({
      profile,
      journey,
      notificationPreferences: { status: "error" },
    });
  });

  it("does not request writable notification preferences for a viewer", async () => {
    auth.loadArchiveMemberAuth.mockResolvedValue(activeAccess("VIEWER"));

    await expect(myPageLoader()).resolves.toEqual({
      profile,
      journey,
      notificationPreferences: { status: "unavailable" },
    });
    expect(api.fetchNotificationPreferences).not.toHaveBeenCalled();
  });
});
