import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MyJourneyPage, MyPageResponse } from "@/features/archive/api/archive-contracts";
import { emptyMyJourneyPage } from "@/features/archive/model/my-reading-shelf-model";
import { myPageLoader } from "./my-page-data";

const api = vi.hoisted(() => ({
  fetchMyPage: vi.fn(),
  fetchMyJourney: vi.fn(),
  fetchMyFeedbackDocuments: vi.fn(),
  fetchMyArchiveQuestions: vi.fn(),
  fetchMyArchiveReviews: vi.fn(),
}));

const auth = vi.hoisted(() => ({ loadArchiveMemberAuth: vi.fn() }));

vi.mock("@/features/archive/api/archive-api", () => api);
vi.mock("@/features/archive/route/archive-loader-auth", () => auth);

const profile: MyPageResponse = {
  avatarKey: "banana-green-book",
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
  });

  it("loads the profile and three journey items for summary and recent records", async () => {
    await expect(myPageLoader()).resolves.toEqual({ profile, journey });
    expect(api.fetchMyPage).toHaveBeenCalledWith({ clubSlug: undefined });
    expect(api.fetchMyJourney).toHaveBeenCalledWith(
      { clubSlug: undefined },
      { limit: 3 },
    );
    expect(api.fetchMyFeedbackDocuments).not.toHaveBeenCalled();
    expect(api.fetchMyArchiveQuestions).not.toHaveBeenCalled();
    expect(api.fetchMyArchiveReviews).not.toHaveBeenCalled();
  });

  it.each([
    ["profile", "fetchMyPage"],
    ["journey", "fetchMyJourney"],
  ] as const)("rejects when required %s data fails", async (_label, key) => {
    api[key].mockRejectedValueOnce(new Error("required request failed"));

    await expect(myPageLoader()).rejects.toThrow("required request failed");
  });

  it("keeps an inactive shelf membership-aware without starting profile requests", async () => {
    const inactiveProfile = {
      ...profile,
      avatarKey: "cloud-green-book",
      membershipStatus: "INACTIVE" as const,
      clubName: null,
      joinedAt: "",
      sessionCount: 0,
      totalSessionCount: 0,
      completedReadingCount: 0,
      currentSessionId: null,
    };
    auth.loadArchiveMemberAuth.mockResolvedValue({
      allowed: false,
      auth: { ...activeAccess("VIEWER").auth, membershipStatus: "INACTIVE" },
    });

    await expect(myPageLoader()).resolves.toEqual({
      profile: inactiveProfile,
      journey: emptyMyJourneyPage(),
    });
    expect(api.fetchMyPage).not.toHaveBeenCalled();
    expect(api.fetchMyJourney).not.toHaveBeenCalled();
  });
});
