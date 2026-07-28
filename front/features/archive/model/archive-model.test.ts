import { describe, expect, it } from "vitest";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";
import { inactiveMyPageProfile } from "./archive-model";

describe("inactiveMyPageProfile", () => {
  it("preserves safe auth identity while clearing inactive membership records", () => {
    const auth: AuthMeResponse = {
      authenticated: true,
      userId: "reader-user",
      membershipId: null,
      clubId: null,
      email: "reader@example.com",
      displayName: "독자",
      accountName: "book-friend",
      role: "MEMBER",
      membershipStatus: "INACTIVE",
      approvalState: "ANONYMOUS",
    };

    expect(inactiveMyPageProfile(auth)).toEqual({
      displayName: "독자",
      accountName: "book-friend",
      email: "reader@example.com",
      role: "MEMBER",
      membershipStatus: "INACTIVE",
      clubName: null,
      joinedAt: "",
      sessionCount: 0,
      totalSessionCount: 0,
      completedReadingCount: 0,
      currentSessionId: null,
      recentAttendances: [],
    });
  });
});
