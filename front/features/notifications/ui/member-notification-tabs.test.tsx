import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { MemberNotificationTabs } from "./member-notification-tabs";

describe("MemberNotificationTabs", () => {
  it("keeps both tabs in the scoped notification route", () => {
    render(
      <MemoryRouter initialEntries={["/clubs/reading-sai/app/notifications"]}>
        <MemberNotificationTabs
          active="inbox"
          basePath="/clubs/reading-sai/app"
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", {
      name: "받은 알림",
    })).toHaveAttribute(
      "href",
      "/clubs/reading-sai/app/notifications",
    );
    expect(screen.getByRole("link", {
      name: "수신 설정",
    })).toHaveAttribute(
      "href",
      "/clubs/reading-sai/app/notifications/settings",
    );
    expect(screen.getByRole("link", {
      name: "받은 알림",
    })).toHaveAttribute("aria-current", "page");
  });

  it("marks only the settings URL as current on the settings page", () => {
    render(
      <MemoryRouter initialEntries={["/app/notifications/settings"]}>
        <MemberNotificationTabs active="settings" basePath="/app" />
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: "수신 설정" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "받은 알림" })).not.toHaveAttribute("aria-current");
  });
});
