import { readFileSync } from "node:fs";
import { render, screen, waitFor, within } from "@testing-library/react";
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
    accessScope: "HOST_ONLY" as const,
    siteVisibility: "HIDDEN" as const,
  }],
  nextCursor: null,
} satisfies HostDashboardProps["hostSessions"];

const actions = {
  updateCurrentSessionParticipation: async () => undefined,
  updateSessionAccessScope: async () => undefined,
  openSession: async () => undefined,
  loadHostSessions: async () => ({ items: [], nextCursor: null }),
} satisfies HostDashboardProps["actions"];

describe("HostDashboard", () => {
  it("marks operational values as mono tabular ledger numbers while headings stay sans", () => {
    const stylesheet = document.createElement("style");
    stylesheet.textContent = readFileSync("src/styles/globals.css", "utf8");
    document.head.append(stylesheet);

    try {
      const { container } = render(
        <HostDashboard
          data={{
            ...dashboard,
            rsvpPending: 2,
            checkinMissing: 1,
            publishPending: 3,
            feedbackPending: 4,
          }}
          current={{ currentSession: null }}
          hostSessions={hostSessions}
          actions={actions}
        />,
      );

      const ledgerValues = Array.from(
        container.querySelectorAll<HTMLElement>(".rm-host-ledger__metric strong"),
      );
      expect(ledgerValues.length).toBeGreaterThan(0);
      for (const value of ledgerValues) {
        expect(value).toHaveClass("ledger-number");
        expect(getComputedStyle(value).fontFamily).toBe("var(--f-mono)");
        expect(getComputedStyle(value).fontVariantNumeric).toBe("tabular-nums");
      }
      expect(screen.getByRole("heading", { name: "모임 운영", level: 1 })).not.toHaveClass(
        "ledger-number",
      );
    } finally {
      stylesheet.remove();
    }
  });

  it("uses the approved priority-ledger hierarchy without the global two-column grid", () => {
    const { container } = render(
      <HostDashboard
        data={{
          ...dashboard,
          rsvpPending: 2,
          publishPending: 1,
        }}
        current={{ currentSession: null }}
        hostSessions={draftHostSessions}
        actions={actions}
      />,
    );

    const desktop = container.querySelector(".rm-host-dashboard-desktop");
    expect(desktop).not.toBeNull();
    const desktopView = desktop as HTMLElement;

    expect(within(desktopView).getByRole("region", { name: "오늘의 운영" })).toBeInTheDocument();
    for (const title of ["처리 대기 원장", "다음 세션과 운영 흐름", "운영 도구"]) {
      const disclosure = within(desktopView).getByText(title).closest("details");
      expect(disclosure).toHaveClass("rm-host-desktop-disclosure");
      expect(disclosure).not.toHaveAttribute("open");
    }
    expect(desktopView.querySelector(".home-grid")).toBeNull();
  });

  it("keeps primary work direct while preserving secondary actions in closed disclosures", () => {
    const { container } = render(
      <HostDashboard
        data={{
          ...dashboard,
          rsvpPending: 2,
          publishPending: 1,
        }}
        current={{ currentSession: null }}
        hostSessions={draftHostSessions}
        actions={actions}
      />,
    );

    const desktop = container.querySelector(".rm-host-dashboard-desktop");
    expect(desktop).not.toBeNull();
    const desktopView = desktop as HTMLElement;
    const today = within(desktopView).getByRole("region", { name: "오늘의 운영" });

    expect(within(today).getByRole("article", { name: "현재 세션" })).toBeInTheDocument();
    expect(within(today).getByRole("region", { name: "지금 처리할 일" })).toBeInTheDocument();
    expect(today.closest("details")).toBeNull();

    const ledger = within(desktopView).getByText("처리 대기 원장").closest("details");
    const lifecycle = within(desktopView).getByText("다음 세션과 운영 흐름").closest("details");
    const tools = within(desktopView).getByText("운영 도구").closest("details");

    expect(ledger).not.toHaveAttribute("open");
    expect(lifecycle).not.toHaveAttribute("open");
    expect(tools).not.toHaveAttribute("open");
    expect(within(ledger as HTMLElement).getByText("마감·공개·피드백 상태")).toBeInTheDocument();
    expect(within(lifecycle as HTMLElement).getByText("예정 세션·운영 일정")).toBeInTheDocument();
    expect(within(tools as HTMLElement).getByText("알림·멤버·초대·AI 설정")).toBeInTheDocument();
    expect(
      within(ledger as HTMLElement).getByRole("link", {
        name: "세션 기록 전체 보기",
        hidden: true,
      }),
    ).toHaveAttribute("href", "/app/host/sessions");
    expect(
      within(lifecycle as HTMLElement).getByRole("button", {
        name: /현재로 시작/,
        hidden: true,
      }),
    ).toBeInTheDocument();
    expect(
      within(tools as HTMLElement).getByRole("link", {
        name: "멤버 보기",
        hidden: true,
      }),
    ).toHaveAttribute("href", "/app/host/members");
  });

  it("places mobile priority work before the current-session summary", () => {
    const { container } = render(
      <HostDashboard
        data={{
          ...dashboard,
          rsvpPending: 2,
        }}
        current={{ currentSession: null }}
        hostSessions={hostSessions}
        actions={actions}
      />,
    );

    const mobileText = container.querySelector(".rm-host-dashboard-mobile")?.textContent ?? "";
    expect(mobileText.indexOf("지금 처리할 일")).toBeGreaterThanOrEqual(0);
    expect(mobileText.indexOf("현재 세션")).toBeGreaterThanOrEqual(0);
    expect(mobileText.indexOf("지금 처리할 일")).toBeLessThan(mobileText.indexOf("현재 세션"));
  });

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

  it("saves guest access directly and reflects the successful result", async () => {
    const user = userEvent.setup();
    const directActions = {
      ...actions,
      updateSessionAccessScope: vi.fn(actions.updateSessionAccessScope),
    };
    render(
      <HostDashboard
        data={dashboard}
        current={{ currentSession: null }}
        hostSessions={draftHostSessions}
        actions={directActions}
      />,
    );

    await user.click(screen.getAllByRole("button", { name: /게스트 공개/ })[0]);
    await waitFor(() => expect(directActions.updateSessionAccessScope).toHaveBeenCalledWith("session-next", {
      accessScope: "GUEST_READABLE",
    }));
    expect(screen.queryByRole("dialog", {
      name: "반영 방법을 선택해 주세요",
    })).not.toBeInTheDocument();
    expect(screen.getAllByText("게스트 공개").length).toBeGreaterThan(0);
  });

  it("does not reflect visibility when the save fails", async () => {
    const user = userEvent.setup();
    const failingActions = {
      ...actions,
      updateSessionAccessScope: vi.fn().mockRejectedValue(new Error("save failed")),
    };
    render(
      <HostDashboard
        data={dashboard}
        current={{ currentSession: null }}
        hostSessions={draftHostSessions}
        actions={failingActions}
      />,
    );

    await user.click(screen.getAllByRole("button", { name: /게스트 공개/ })[0]);
    await waitFor(() => expect(failingActions.updateSessionAccessScope).toHaveBeenCalledWith("session-next", {
      accessScope: "GUEST_READABLE",
    }));
    expect((await screen.findAllByRole("alert"))[0]).toHaveTextContent(
      "게스트 접근을 저장하지 못했습니다. 기존 접근 범위는 유지됩니다. 다시 시도해 주세요.",
    );
    expect(screen.getAllByText("호스트 전용").length).toBeGreaterThan(0);
  });

  it("keeps the previous session state and names the failed start operation", async () => {
    const user = userEvent.setup();
    const failingActions = {
      ...actions,
      openSession: vi.fn().mockRejectedValue(new Error("open failed")),
    };
    render(
      <HostDashboard
        data={dashboard}
        current={{ currentSession: null }}
        hostSessions={draftHostSessions}
        actions={failingActions}
      />,
    );

    await user.click(screen.getAllByRole("button", { name: /현재로 시작/ })[0]);

    expect((await screen.findAllByRole("alert"))[0]).toHaveTextContent(
      "세션을 시작하지 못했습니다. 기존 세션 상태는 유지됩니다. 다시 시도해 주세요.",
    );
    expect(screen.getAllByText("다음 책").length).toBeGreaterThan(0);
  });

  it("keeps the existing upcoming list when loading another page fails", async () => {
    const user = userEvent.setup();
    const failingActions = {
      ...actions,
      loadHostSessions: vi.fn().mockRejectedValue(new Error("load failed")),
    };
    render(
      <HostDashboard
        data={dashboard}
        current={{ currentSession: null }}
        hostSessions={{ ...draftHostSessions, nextCursor: "cursor-1" }}
        actions={failingActions}
      />,
    );

    await user.click(screen.getAllByRole("button", { name: "더 보기" })[0]);

    expect((await screen.findAllByRole("alert"))[0]).toHaveTextContent(
      "예정 세션을 더 불러오지 못했습니다. 기존 목록은 유지됩니다.",
    );
    expect(screen.getAllByText("다음 책").length).toBeGreaterThan(0);
  });
});
