import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { NotificationPreferences } from "../model/notification-preferences-model";
import { MemberNotificationSettingsPage } from "./member-notification-settings-page";

const preferences: NotificationPreferences = {
  emailEnabled: true,
  events: {
    NEXT_BOOK_PUBLISHED: true,
    SESSION_REMINDER_DUE: true,
    FEEDBACK_DOCUMENT_PUBLISHED: true,
    REVIEW_PUBLISHED: false,
  },
};

function renderPage(
  state: Parameters<typeof MemberNotificationSettingsPage>[0]["state"],
  overrides: Partial<Parameters<typeof MemberNotificationSettingsPage>[0]> = {},
) {
  const props: Parameters<typeof MemberNotificationSettingsPage>[0] = {
    state,
    basePath: "/app",
    mySpaceHref: "/app/me",
    saving: false,
    saveError: null,
    onEmailEnabledChange: vi.fn(),
    onEventEnabledChange: vi.fn(),
    onSave: vi.fn(),
    onRetryLoad: vi.fn(),
    ...overrides,
  };

  render(
    <MemoryRouter initialEntries={["/app/notifications/settings"]}>
      <MemberNotificationSettingsPage {...props} />
    </MemoryRouter>,
  );
  return props;
}

describe("MemberNotificationSettingsPage", () => {
  it("renders the settings tab as current with the existing manual-save controls", async () => {
    const user = userEvent.setup();
    const props = renderPage({ status: "ready", preferences });

    const breadcrumb = screen.getByRole("navigation", { name: "현재 위치" });
    expect(breadcrumb).toHaveClass("desktop-only");
    expect(screen.getByRole("link", { name: "내 공간" })).toHaveAttribute("href", "/app/me");
    expect(screen.getByText("알림", { selector: "[aria-current=page]" })).toBeVisible();
    expect(screen.getByRole("link", { name: "수신 설정" })).toHaveAttribute("aria-current", "page");
    expect(screen.getAllByRole("switch")).toHaveLength(5);
    await user.click(screen.getByRole("switch", { name: "이메일 알림" }));
    await user.click(screen.getByRole("button", { name: "알림 설정 저장" }));
    expect(props.onEmailEnabledChange).toHaveBeenCalledWith(false);
    expect(props.onSave).toHaveBeenCalledOnce();
  });

  it("shows membership unavailability without writable switches", () => {
    renderPage({ status: "unavailable" });

    expect(screen.getByText(
      "알림 수신은 현재 멤버십에서 제공되지 않습니다.",
    )).toBeVisible();
    expect(screen.queryByRole("switch")).toBeNull();
  });

  it("keeps a settings GET failure retry inside the settings page", async () => {
    const user = userEvent.setup();
    const props = renderPage({ status: "error" });

    expect(screen.getByRole("alert")).toHaveTextContent("알림 설정을 불러오지 못했습니다.");
    await user.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(props.onRetryLoad).toHaveBeenCalledOnce();
  });

  it("disables every control while saving and exposes a rejected draft error", () => {
    renderPage(
      { status: "ready", preferences },
      {
        saving: true,
        saveError: "알림 설정 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.",
      },
    );

    for (const control of screen.getAllByRole("switch")) {
      expect(control).toBeDisabled();
    }
    expect(screen.getByRole("button", { name: "저장 중" })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("알림 설정 저장에 실패했습니다.");
  });
});
