import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
        mySpaceHref="/clubs/reading-sai/app/me"
        onLeaveMembership={vi.fn()}
      />
    </MemoryRouter>,
  );
}

describe("AccountSettingsPage", () => {
  it("renders read-only account and membership information with a stable return link", () => {
    renderAccountSettings();

    expect(screen.getByRole("link", { name: "내 공간" })).toHaveAttribute(
      "href",
      "/clubs/reading-sai/app/me",
    );
    expect(screen.getByRole("heading", { level: 1, name: "계정 설정" })).toBeVisible();
    expect(screen.getByRole("heading", { level: 2, name: "계정 정보" })).toBeVisible();
    expect(screen.getByRole("heading", { level: 2, name: "클럽 멤버십" })).toBeVisible();
    expect(
      screen.getByText("현재 계정과 현재 클럽의 멤버십 정보를 확인합니다."),
    ).toBeVisible();
    expect(screen.getByText(profile.email)).toBeVisible();
    expect(screen.getByText(profile.displayName)).toBeVisible();
    expect(screen.getByText("읽는 사이")).toBeVisible();
    expect(screen.getByRole("button", { name: "클럽 탈퇴…" })).not.toHaveClass(
      "rm-account-settings-page__danger-action",
    );
    expect(screen.queryByRole("button", { name: "이름 변경" })).toBeNull();
    expect(screen.queryByRole("textbox", { name: "이름" })).toBeNull();
    expect(screen.queryByRole("button", { name: "로그아웃" })).toBeNull();
  });

  it("reveals a specific final danger action only after the initial leave action", async () => {
    const user = userEvent.setup();
    renderAccountSettings();

    expect(screen.getByRole("heading", {
      level: 2,
      name: "멤버십 종료",
    })).toBeVisible();
    expect(screen.getByRole("button", { name: "클럽 탈퇴…" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "클럽 탈퇴" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "클럽 탈퇴…" }));

    const confirm = screen.getByRole("button", { name: "클럽 탈퇴" });
    expect(confirm).toHaveClass("rm-account-settings-page__danger-action");
    expect(screen.getByRole("button", { name: "취소" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "취소" }));
    expect(screen.queryByRole("button", { name: "클럽 탈퇴" })).toBeNull();
  });
});
