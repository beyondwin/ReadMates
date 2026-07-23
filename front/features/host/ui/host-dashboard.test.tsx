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
  previewSessionVisibility: async () => ({
    previewId: "preview-1",
    targetCount: 1,
    expectedInAppCount: 1,
    expectedEmailCount: 1,
    excludedCount: 0,
    expiresAt: "2026-07-23T20:00:00+09:00",
  }),
  updateSessionVisibility: async () => undefined,
  openSession: async () => undefined,
  loadHostSessions: async () => ({ items: [], nextCursor: null }),
} satisfies HostDashboardProps["actions"];

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

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

  it("requires a no-default SEND or SKIP confirmation when capability is enabled", async () => {
    const user = userEvent.setup();
    const gatedActions = {
      ...actions,
      previewSessionVisibility: vi.fn(actions.previewSessionVisibility),
      updateSessionVisibility: vi.fn(actions.updateSessionVisibility),
    };
    render(
      <HostDashboard
        data={dashboard}
        current={{ currentSession: null }}
        hostSessions={draftHostSessions}
        actions={gatedActions}
        hostActionNotificationConfirmationRequired
      />,
    );

    await user.click(screen.getAllByRole("button", { name: /멤버 공개/ })[0]);
    expect(gatedActions.previewSessionVisibility).toHaveBeenCalledWith("session-next", "MEMBER");
    expect(gatedActions.updateSessionVisibility).not.toHaveBeenCalled();
    expect(await screen.findByRole("button", { name: "선택대로 반영" })).toBeDisabled();

    await user.click(screen.getByRole("radio", { name: "알림 없이 반영" }));
    await user.click(screen.getByRole("button", { name: "선택대로 반영" }));
    await waitFor(() => expect(gatedActions.updateSessionVisibility).toHaveBeenCalledWith("session-next", {
      visibility: "MEMBER",
      previewId: "preview-1",
      notificationDecision: "SKIP",
    }));
  });

  it("keeps rollout-off visibility legacy and fails closed on confirmation-required", async () => {
    const user = userEvent.setup();
    const confirmationRequired = {
      ...actions,
      previewSessionVisibility: vi.fn(actions.previewSessionVisibility),
      updateSessionVisibility: vi.fn(async () => {
        throw { code: "NOTIFICATION_CONFIRMATION_REQUIRED" };
      }),
    };
    render(
      <HostDashboard
        data={dashboard}
        current={{ currentSession: null }}
        hostSessions={draftHostSessions}
        actions={confirmationRequired}
      />,
    );

    await user.click(screen.getAllByRole("button", { name: /멤버 공개/ })[0]);
    expect(confirmationRequired.previewSessionVisibility).not.toHaveBeenCalled();
    expect(confirmationRequired.updateSessionVisibility).toHaveBeenCalledTimes(1);
    expect(confirmationRequired.updateSessionVisibility).toHaveBeenCalledWith("session-next", {
      visibility: "MEMBER",
    });
    expect((await screen.findAllByRole("alert"))[0]).toHaveTextContent("화면을 새로고침");
  });

  it("reopens changed target counts and requires a new decision", async () => {
    const user = userEvent.setup();
    const previewSessionVisibility = vi.fn()
      .mockResolvedValueOnce(await actions.previewSessionVisibility())
      .mockResolvedValueOnce({
        ...(await actions.previewSessionVisibility()),
        previewId: "preview-2",
        targetCount: 2,
        expectedInAppCount: 2,
      });
    const changedTargets = {
      ...actions,
      previewSessionVisibility,
      updateSessionVisibility: vi.fn(async () => {
        throw { code: "NOTIFICATION_TARGETS_CHANGED" };
      }),
    };
    render(
      <HostDashboard
        data={dashboard}
        current={{ currentSession: null }}
        hostSessions={draftHostSessions}
        actions={changedTargets}
        hostActionNotificationConfirmationRequired
      />,
    );

    await user.click(screen.getAllByRole("button", { name: /멤버 공개/ })[0]);
    await user.click(await screen.findByRole("radio", { name: "알림 없이 반영" }));
    await user.click(screen.getByRole("button", { name: "선택대로 반영" }));

    await waitFor(() => expect(previewSessionVisibility).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("dialog")).toHaveTextContent("미리보기 대상 2명");
    expect(screen.getByRole("radio", { name: "알림 없이 반영" })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "선택대로 반영" })).toBeDisabled();
  });

  it("keeps an ambiguous next-book apply retryable with the same preview receipt", async () => {
    const user = userEvent.setup();
    const updateSessionVisibility = vi.fn()
      .mockRejectedValueOnce(new TypeError("network response lost"))
      .mockResolvedValueOnce(undefined);
    render(
      <HostDashboard
        data={dashboard}
        current={{ currentSession: null }}
        hostSessions={draftHostSessions}
        actions={{ ...actions, updateSessionVisibility }}
        hostActionNotificationConfirmationRequired
      />,
    );

    await user.click(screen.getAllByRole("button", { name: /멤버 공개/ })[0]);
    await user.click(await screen.findByRole("radio", { name: "알림 없이 반영" }));
    await user.click(screen.getByRole("button", { name: "선택대로 반영" }));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getAllByRole("alert")[0]).toHaveTextContent("처리 결과를 확인하지 못했습니다");
    expect(screen.getAllByRole("alert")[0]).not.toHaveTextContent("변경되지 않았습니다");
    await user.click(screen.getByRole("button", { name: "선택대로 반영" }));

    await waitFor(() => expect(updateSessionVisibility).toHaveBeenCalledTimes(2));
    expect(updateSessionVisibility.mock.calls[0]).toEqual(updateSessionVisibility.mock.calls[1]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("disables the stale confirmation while target re-preview is pending", async () => {
    const user = userEvent.setup();
    const refreshed = deferred<Awaited<ReturnType<typeof actions.previewSessionVisibility>>>();
    const previewSessionVisibility = vi.fn()
      .mockResolvedValueOnce(await actions.previewSessionVisibility())
      .mockImplementationOnce(() => refreshed.promise);
    render(
      <HostDashboard
        data={dashboard}
        current={{ currentSession: null }}
        hostSessions={draftHostSessions}
        actions={{
          ...actions,
          previewSessionVisibility,
          updateSessionVisibility: vi.fn().mockRejectedValue({ code: "NOTIFICATION_TARGETS_CHANGED" }),
        }}
        hostActionNotificationConfirmationRequired
      />,
    );

    await user.click(screen.getAllByRole("button", { name: /멤버 공개/ })[0]);
    await user.click(await screen.findByRole("radio", { name: "알림 없이 반영" }));
    await user.click(screen.getByRole("button", { name: "선택대로 반영" }));
    await waitFor(() => expect(previewSessionVisibility).toHaveBeenCalledTimes(2));

    expect(screen.getByRole("button", { name: "반영 중" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "취소" })).toBeDisabled();
    refreshed.resolve({ ...(await actions.previewSessionVisibility()), previewId: "preview-2" });
    await waitFor(() => expect(screen.getByRole("button", { name: "취소" })).toBeEnabled());
  });
});
