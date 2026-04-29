import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MemberNotificationsPage } from "@/features/notifications/ui/member-notifications-page";

describe("MemberNotificationsPage", () => {
  it("renders unread notification rows", () => {
    render(
      <MemberNotificationsPage
        unreadCount={1}
        items={[
          {
            id: "00000000-0000-0000-0000-000000000001",
            eventType: "NEXT_BOOK_PUBLISHED",
            title: "다음 책이 공개되었습니다",
            body: "12회차 책을 확인해 주세요.",
            deepLinkPath: "/sessions/00000000-0000-0000-0000-000000000002",
            readAt: null,
            createdAt: "2026-04-29T00:00:00Z",
          },
        ]}
        onMarkRead={() => undefined}
        onMarkAllRead={() => undefined}
      />,
    );

    expect(screen.getByText("알림")).toBeInTheDocument();
    expect(screen.getByText("다음 책이 공개되었습니다")).toBeInTheDocument();
    expect(screen.getByText("읽지 않은 알림 1개")).toBeInTheDocument();
  });
});
