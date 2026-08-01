import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { MemberNotificationsPage } from "./member-notifications-page";

describe("MemberNotificationsPage", () => {
  it("renders a Korean-only compact reflection row", () => {
    render(
      <MemoryRouter initialEntries={["/app/notifications"]}>
        <MemberNotificationsPage
          unreadCount={1}
          items={[{
            id: "n1",
            eventType: "FEEDBACK_DOCUMENT_PUBLISHED",
            title: "7회차 모임 기록이 준비됐어요",
            body: "지난 모임의 기록과 피드백을 이어 읽을 수 있어요.",
            deepLinkPath: "/sessions/11111111-1111-1111-1111-111111111111",
            readAt: null,
            createdAt: "2026-06-18T10:00:00Z",
        }]}
          mySpaceHref="/app/me"
          onMarkAllRead={vi.fn()}
        />
      </MemoryRouter>,
    );

    const row = screen.getByRole("link", {
      name: "읽지 않음 · 7회차 모임 기록이 준비됐어요 열기",
    });
    expect(row).toHaveClass("rm-member-notifications-list__item");
    expect(row).toHaveAttribute(
      "href",
      "/app/sessions/11111111-1111-1111-1111-111111111111",
    );
    expect(screen.getByText("새 알림 1개")).toBeVisible();
    const breadcrumb = screen.getByRole("navigation", { name: "현재 위치" });
    expect(breadcrumb).toHaveClass("desktop-only");
    expect(screen.getByRole("link", { name: "내 공간" })).toHaveAttribute("href", "/app/me");
    expect(screen.getByText("알림", { selector: "[aria-current=page]" })).toBeVisible();
    expect(screen.getByRole("link", { name: "받은 알림" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "수신 설정" })).toHaveAttribute(
      "href",
      "/app/notifications/settings",
    );
    expect(screen.queryByText("Open")).toBeNull();
    expect(screen.queryByText("View record")).toBeNull();
    expect(screen.queryByText("Past session reflection")).toBeNull();
    expect(screen.queryByRole("button", { name: "읽음" })).toBeNull();
  });

  it("passes reflection route state when an unread notification is opened", () => {
    const onOpenNotification = vi.fn();

    render(
      <MemberNotificationsPage
        unreadCount={1}
        items={[{
          id: "n1",
          eventType: "FEEDBACK_DOCUMENT_PUBLISHED",
          title: "7회차 모임 기록이 준비됐어요",
          body: "지난 모임의 기록과 피드백을 이어 읽을 수 있어요.",
          deepLinkPath: "/sessions/11111111-1111-1111-1111-111111111111",
          readAt: null,
          createdAt: "2026-06-18T10:00:00Z",
          }]}
        mySpaceHref="/app/me"
        onMarkAllRead={vi.fn()}
        onOpenNotification={onOpenNotification}
      />,
    );

    screen.getByRole("link", {
      name: "읽지 않음 · 7회차 모임 기록이 준비됐어요 열기",
    }).click();

    expect(onOpenNotification).toHaveBeenCalledWith(
      "n1",
      "/app/sessions/11111111-1111-1111-1111-111111111111",
      {
        readmatesReturnTo: "/app/notifications",
        readmatesReturnLabel: "지난 모임 회고",
      },
    );
  });
});
