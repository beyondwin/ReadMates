import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { MyPageProfile } from "@/features/archive/model/archive-model";
import { RhythmSection } from "./my-page-sections";

function profile(overrides: Partial<MyPageProfile>): MyPageProfile {
  return {
    displayName: "독자",
    accountName: "reader",
    email: "reader@example.com",
    role: "MEMBER",
    membershipStatus: "ACTIVE",
    clubName: "테스트 클럽",
    joinedAt: "2026-01",
    sessionCount: 2,
    totalSessionCount: 4,
    completedReadingCount: 1,
    recentAttendances: [{ sessionNumber: 1, attended: true, readingProgress: 100 }],
    ...overrides,
  };
}

describe("RhythmSection", () => {
  it("shows attendance and reading-completion as separate honest stats", () => {
    render(<RhythmSection data={profile({})} reviewCount="3" questionCount="5" />);

    expect(screen.getByText("참석률")).toBeInTheDocument();
    expect(screen.getByText("완독률")).toBeInTheDocument();
    // attendance 2/4 = 50, completion 1/4 = 25 — distinct honest values
    expect(screen.getByText("50")).toBeInTheDocument();
    expect(screen.getByText("25")).toBeInTheDocument();
  });
});
