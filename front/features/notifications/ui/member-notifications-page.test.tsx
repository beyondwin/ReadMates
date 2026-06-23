import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemberNotificationsPage } from "./member-notifications-page";

describe("MemberNotificationsPage", () => {
  it("shows reflection action for session notification without private sentinels", () => {
    render(
      <MemberNotificationsPage
        unreadCount={1}
        items={[{
          id: "n1",
          eventType: "FEEDBACK_DOCUMENT_PUBLISHED",
          title: "No.07 session record is ready",
          body: "You can continue into records and feedback.",
          deepLinkPath: "/sessions/11111111-1111-1111-1111-111111111111",
          readAt: null,
          createdAt: "2026-06-18T10:00:00Z",
        }]}
        onMarkRead={vi.fn()}
        onMarkAllRead={vi.fn()}
      />,
    );

    expect(screen.getByText("Past session reflection")).toBeVisible();
    expect(screen.getByText("View record")).toBeVisible();
    expect(screen.getByRole("link", { name: /No.07 session record/ })).toHaveAttribute(
      "href",
      "/app/sessions/11111111-1111-1111-1111-111111111111",
    );
    expect(screen.queryByText("member1@example.com")).toBeNull();
    expect(screen.queryByText("ADMIN_ROUTE")).toBeNull();
  });

  it("passes reflection route state when an unread notification is opened", () => {
    const onOpenNotification = vi.fn();

    render(
      <MemberNotificationsPage
        unreadCount={1}
        items={[{
          id: "n1",
          eventType: "FEEDBACK_DOCUMENT_PUBLISHED",
          title: "No.07 session record is ready",
          body: "You can continue into records and feedback.",
          deepLinkPath: "/sessions/11111111-1111-1111-1111-111111111111",
          readAt: null,
          createdAt: "2026-06-18T10:00:00Z",
        }]}
        onMarkRead={vi.fn()}
        onMarkAllRead={vi.fn()}
        onOpenNotification={onOpenNotification}
      />,
    );

    screen.getByRole("link", { name: /No.07 session record/ }).click();

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
