import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MyPageResponse } from "@/features/archive/api/archive-contracts";
import { accountSettingsLoader } from "./account-settings-data";

const api = vi.hoisted(() => ({
  fetchMyPage: vi.fn(),
  fetchMyJourney: vi.fn(),
}));
const auth = vi.hoisted(() => ({ loadArchiveMemberAuth: vi.fn() }));

vi.mock("@/features/archive/api/archive-api", () => api);
vi.mock("@/features/archive/route/archive-loader-auth", () => auth);

const profile: MyPageResponse = {
  avatarKey: "banana-green-book",
  displayName: "독자",
  accountName: "book-friend",
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

const activeAccess = {
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
    membershipStatus: "ACTIVE" as const,
    approvalState: "ACTIVE" as const,
  },
};

describe("accountSettingsLoader", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    auth.loadArchiveMemberAuth.mockResolvedValue(activeAccess);
    api.fetchMyPage.mockResolvedValue(profile);
  });

  it("loads only the account profile for an allowed member", async () => {
    await expect(accountSettingsLoader()).resolves.toEqual(profile);

    expect(api.fetchMyPage).toHaveBeenCalledWith({ clubSlug: undefined });
    expect(api.fetchMyJourney).not.toHaveBeenCalled();
  });

  it("returns an inactive profile without requesting club account data", async () => {
    auth.loadArchiveMemberAuth.mockResolvedValue({
      allowed: false,
      auth: { ...activeAccess.auth, membershipStatus: "INACTIVE" },
    });

    await expect(accountSettingsLoader()).resolves.toMatchObject({
      displayName: profile.displayName,
      membershipStatus: "INACTIVE",
      clubName: null,
      sessionCount: 0,
    });
    expect(api.fetchMyPage).not.toHaveBeenCalled();
  });
});
