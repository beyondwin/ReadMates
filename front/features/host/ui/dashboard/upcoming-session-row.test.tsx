import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { HostSessionListItem } from "@/features/host/model/host-view-types";
import type { HostDashboardLinkComponent, UpcomingActionHandlers } from "./types";
import { UpcomingSessionMobileCard } from "./upcoming-session-row";

const TestLink: HostDashboardLinkComponent = ({ to, state: _state, children, ...props }) => {
  void _state;
  return <a {...props} href={to}>{children}</a>;
};

const actions = (canOpenSession: boolean): UpcomingActionHandlers => ({
  updateVisibility: vi.fn(async () => undefined),
  openSession: vi.fn(async () => undefined),
  isPending: () => false,
  isBusy: false,
  canOpenSession,
});

const draft = (date: string): HostSessionListItem => ({
  sessionId: "session-10",
  sessionNumber: 10,
  title: "10회차 모임",
  bookTitle: "다음 책",
  bookAuthor: "다음 저자",
  bookImageUrl: null,
  date,
  startTime: "20:00",
  endTime: "22:00",
  locationLabel: "온라인",
  state: "DRAFT",
  visibility: "HOST_ONLY",
});

describe("UpcomingSessionMobileCard", () => {
  it("uses the card book title as a level-three heading", () => {
    render(
      <UpcomingSessionMobileCard
        session={draft("2026-08-20")}
        actions={actions(true)}
        LinkComponent={TestLink}
        now={new Date(2026, 7, 1, 12)}
      />,
    );

    expect(screen.getByRole("heading", { level: 3, name: "다음 책" })).toBeInTheDocument();
  });

  it("prioritizes date repair for an overdue draft", () => {
    const { container } = render(
      <UpcomingSessionMobileCard
        session={draft("2026-05-19")}
        actions={actions(true)}
        LinkComponent={TestLink}
        now={new Date(2026, 7, 1, 12)}
      />,
    );

    expect(screen.getByText("일정 지남")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "날짜 수정 · 다음 책" })).toHaveClass("btn-primary");
    expect(screen.getByRole("button", { name: "다음 책 게스트 접근을 게스트 공개로 변경" })).not.toHaveClass("btn-primary");
    expect(container.querySelectorAll(".btn-primary")).toHaveLength(1);
  });

  it("keeps start primary for a future draft when no current session is open", () => {
    const { container } = render(
      <UpcomingSessionMobileCard
        session={draft("2026-08-20")}
        actions={actions(true)}
        LinkComponent={TestLink}
        now={new Date(2026, 7, 1, 12)}
      />,
    );

    expect(screen.getByRole("button", { name: "현재로 시작 · 다음 책" })).toHaveClass("btn-primary");
    expect(screen.getByRole("link", { name: "세션 편집 · 다음 책" })).not.toHaveClass("btn-primary");
    expect(container.querySelectorAll(".btn-primary")).toHaveLength(1);
  });

  it("keeps edit primary when another current session blocks start", () => {
    const { container } = render(
      <UpcomingSessionMobileCard
        session={draft("2026-08-20")}
        actions={actions(false)}
        LinkComponent={TestLink}
        now={new Date(2026, 7, 1, 12)}
      />,
    );

    expect(screen.queryByRole("button", { name: /현재로 시작/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "세션 편집 · 다음 책" })).toHaveClass("btn-primary");
    expect(container.querySelectorAll(".btn-primary")).toHaveLength(1);
  });
});
