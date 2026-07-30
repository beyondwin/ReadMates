import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { MyPageProfile } from "@/features/archive/model/archive-model";
import { AccountSettingsPage } from "./account-settings-page";

const profile: MyPageProfile = {
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

function renderAccountSettings() {
  return render(
    <MemoryRouter>
      <AccountSettingsPage
        data={profile}
        canEditProfile={false}
        onUpdateProfile={vi.fn().mockResolvedValue({ displayName: profile.displayName, accountName: profile.accountName })}
        onLeaveMembership={vi.fn()}
      />
    </MemoryRouter>,
  );
}

describe("AccountSettingsPage", () => {
  it("renders profile, membership, and leave controls without notifications or logout", () => {
    renderAccountSettings();

    expect(screen.getByRole("heading", { level: 1, name: "계정 관리" })).toBeVisible();
    expect(screen.getByRole("heading", { level: 1, name: profile.displayName })).toHaveAttribute(
      "id",
      "account-settings-profile-name",
    );
    expect(screen.getByText(profile.email)).toBeVisible();
    expect(screen.getByRole("heading", { name: "멤버십" })).toBeVisible();
    expect(screen.getByRole("button", { name: "탈퇴" })).toBeVisible();
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.queryByRole("button", { name: "로그아웃" })).toBeNull();
  });
});
