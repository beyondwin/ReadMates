import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HostUtilityActions } from "./host-utility-actions";

const hrefs = {
  settingsHref: "/app/host/settings",
  memberViewHref: "/app",
  notificationsHref: "/app/host/notifications",
  newMeetingHref: "/app/host/sessions/new",
};

describe("HostUtilityActions", () => {
  it("keeps every approved utility and the single global create action discoverable", () => {
    render(
      <HostUtilityActions
        {...hrefs}
        unreadNotifications={0}
        permissionLimits={[]}
      />,
    );

    const navigation = screen.getByRole("navigation", { name: "호스트 유틸리티" });
    expect(within(navigation).getByRole("link", { name: "초대와 설정" })).toHaveAttribute("href", hrefs.settingsHref);
    expect(within(navigation).getByRole("link", { name: "멤버 시야" })).toHaveAttribute("href", hrefs.memberViewHref);
    expect(within(navigation).getByRole("link", { name: "알림" })).toHaveAttribute("href", hrefs.notificationsHref);
    expect(within(navigation).getByRole("link", { name: "새 모임" })).toHaveAttribute("href", hrefs.newMeetingHref);
  });

  it("announces unread notifications without relying on the visible count alone", () => {
    render(
      <HostUtilityActions
        {...hrefs}
        unreadNotifications={12}
        permissionLimits={[]}
      />,
    );

    expect(screen.getByRole("link", { name: "알림, 읽지 않은 알림 12개" })).toBeInTheDocument();
    expect(screen.getByText("12")).toHaveAttribute("aria-hidden", "true");
  });

  it("shows permission-limited actions and their recovery reason without exposing a false link", () => {
    render(
      <HostUtilityActions
        {...hrefs}
        unreadNotifications={0}
        permissionLimits={[
          { id: "settings", reason: "클럽 설정 권한이 필요합니다." },
          { id: "new-meeting", reason: "모임 생성 권한이 필요합니다." },
        ]}
      />,
    );

    for (const [label, reason] of [
      ["초대와 설정", "클럽 설정 권한이 필요합니다."],
      ["새 모임", "모임 생성 권한이 필요합니다."],
    ] as const) {
      const action = screen.getByText(label).closest("span");
      expect(action).toHaveAttribute("aria-disabled", "true");
      expect(action).toHaveAccessibleDescription(reason);
      expect(screen.queryByRole("link", { name: label })).not.toBeInTheDocument();
      expect(screen.getByText(reason)).toBeVisible();
    }
  });

  it("keeps permission reasons unique to each responsive instance", () => {
    render(
      <>
        <HostUtilityActions
          {...hrefs}
          unreadNotifications={0}
          permissionLimits={[{ id: "settings", reason: "데스크톱 설정 권한이 필요합니다." }]}
        />
        <HostUtilityActions
          {...hrefs}
          unreadNotifications={0}
          permissionLimits={[{ id: "settings", reason: "모바일 설정 권한이 필요합니다." }]}
        />
      </>,
    );

    const navigations = screen.getAllByRole("navigation", { name: "호스트 유틸리티" });
    const desktopAction = within(navigations[0]).getByText("초대와 설정");
    const mobileAction = within(navigations[1]).getByText("초대와 설정");
    const desktopReasonId = desktopAction.getAttribute("aria-describedby");
    const mobileReasonId = mobileAction.getAttribute("aria-describedby");

    expect(desktopReasonId).not.toBe(mobileReasonId);
    expect(document.getElementById(desktopReasonId!)).toHaveTextContent("데스크톱 설정 권한이 필요합니다.");
    expect(document.getElementById(mobileReasonId!)).toHaveTextContent("모바일 설정 권한이 필요합니다.");
    expect(desktopAction).toHaveAccessibleDescription("데스크톱 설정 권한이 필요합니다.");
    expect(mobileAction).toHaveAccessibleDescription("모바일 설정 권한이 필요합니다.");
  });

  it("marks the selected utility as the current page", () => {
    render(
      <HostUtilityActions
        {...hrefs}
        unreadNotifications={0}
        permissionLimits={[]}
        currentId="settings"
      />,
    );

    expect(screen.getByRole("link", { name: "초대와 설정" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "멤버 시야" })).not.toHaveAttribute("aria-current");
  });
});
