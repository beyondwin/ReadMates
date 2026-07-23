import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { findUnnamedInteractiveElements } from "@/shared/testing/accessibility-checks";
import HostDashboard from "./host-dashboard";

type HostDashboardProps = Parameters<typeof HostDashboard>[0];

const dashboard = {
  rsvpPending: 0,
  checkinMissing: 0,
  publishPending: 0,
  feedbackPending: 0,
} satisfies HostDashboardProps["data"];

const hostSessions = {
  items: [],
  nextCursor: null,
} satisfies HostDashboardProps["hostSessions"];

const draftHostSessions = {
  items: [{
    sessionId: "session-next",
    sessionNumber: 8,
    title: "다음 모임",
    bookTitle: "다음 책",
    bookAuthor: "테스트 저자",
    bookImageUrl: null,
    date: "2026-08-20",
    startTime: "20:00",
    endTime: "22:00",
    locationLabel: "온라인",
    state: "DRAFT" as const,
    visibility: "HOST_ONLY" as const,
  }],
  nextCursor: null,
} satisfies HostDashboardProps["hostSessions"];

const actions = {
  updateCurrentSessionParticipation: async () => undefined,
  updateSessionVisibility: async () => undefined,
  openSession: async () => undefined,
  loadHostSessions: async () => ({ items: [], nextCursor: null }),
} satisfies HostDashboardProps["actions"];

describe("HostDashboard", () => {
  it("renders headings without unnamed interactive elements", () => {
    const { container } = render(
      <HostDashboard
        data={dashboard}
        current={{ currentSession: null }}
        hostSessions={hostSessions}
        actions={actions}
      />,
    );

    expect(screen.getAllByRole("heading").length).toBeGreaterThan(0);
    expect(findUnnamedInteractiveElements(container)).toEqual([]);
  });

  it("renders the session-prep pace badge", () => {
    render(
      <HostDashboard
        data={dashboard}
        current={{ currentSession: null }}
        hostSessions={hostSessions}
        actions={actions}
      />,
    );

    expect(screen.getAllByLabelText(/준비 페이스:/).length).toBeGreaterThan(0);
  });

  it("saves visibility directly and reflects the successful result", async () => {
    const user = userEvent.setup();
    const directActions = {
      ...actions,
      updateSessionVisibility: vi.fn(actions.updateSessionVisibility),
    };
    render(
      <HostDashboard
        data={dashboard}
        current={{ currentSession: null }}
        hostSessions={draftHostSessions}
        actions={directActions}
      />,
    );

    await user.click(screen.getAllByRole("button", { name: /멤버 공개/ })[0]);
    await waitFor(() => expect(directActions.updateSessionVisibility).toHaveBeenCalledWith("session-next", {
      visibility: "MEMBER",
    }));
    expect(screen.queryByRole("dialog", {
      name: "반영 방법을 선택해 주세요",
    })).not.toBeInTheDocument();
    expect(screen.getAllByText("멤버 공개").length).toBeGreaterThan(0);
  });

  it("does not reflect visibility when the save fails", async () => {
    const user = userEvent.setup();
    const failingActions = {
      ...actions,
      updateSessionVisibility: vi.fn().mockRejectedValue(new Error("save failed")),
    };
    render(
      <HostDashboard
        data={dashboard}
        current={{ currentSession: null }}
        hostSessions={draftHostSessions}
        actions={failingActions}
      />,
    );

    await user.click(screen.getAllByRole("button", { name: /멤버 공개/ })[0]);
    await waitFor(() => expect(failingActions.updateSessionVisibility).toHaveBeenCalledWith("session-next", {
      visibility: "MEMBER",
    }));
    expect((await screen.findAllByRole("alert"))[0]).toHaveTextContent("저장하지 못했습니다");
    expect(screen.getAllByText("비공개").length).toBeGreaterThan(0);
  });
});
