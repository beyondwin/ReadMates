import { readFileSync } from "node:fs";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { findUnnamedInteractiveElements } from "@/shared/testing/accessibility-checks";
import HostDashboard from "./host-dashboard";

type HostDashboardProps = Parameters<typeof HostDashboard>[0];

const currentSession = {
  currentSession: {
    sessionId: "session-9",
    sessionNumber: 9,
    title: "9회차 모임 · 돈의 심리학",
    bookTitle: "돈의 심리학 (당신은 왜 부자가 되지 못했는가)",
    bookAuthor: "모건 하우절",
    bookLink: null,
    bookImageUrl: null,
    date: "2026-07-15",
    startTime: "20:00",
    endTime: "22:00",
    locationLabel: "온라인",
    meetingUrl: null,
    meetingPasscode: null,
    questionDeadlineAt: "2026-07-14T14:59:00Z",
    myRsvpStatus: "GOING" as const,
    myCheckin: { readingProgress: 100 },
    myQuestions: [],
    myOneLineReview: null,
    myLongReview: null,
    board: {
      questions: [{
        priority: 1,
        text: "돈을 대하는 태도는 어떻게 만들어지는가?",
        draftThought: null,
        authorName: "호스트",
        authorShortName: "호스트",
        avatarKey: "deer-brown-book",
      }],
      longReviews: [],
    },
    attendees: [
      {
        membershipId: "membership-host",
        avatarKey: "deer-brown-book",
        displayName: "호스트",
        accountName: "호스트",
        role: "HOST" as const,
        rsvpStatus: "GOING" as const,
        attendanceStatus: "UNKNOWN" as const,
      },
      {
        membershipId: "membership-member",
        avatarKey: "squirrel-acorn",
        displayName: "멤버",
        accountName: "멤버",
        role: "MEMBER" as const,
        rsvpStatus: "NO_RESPONSE" as const,
        attendanceStatus: "UNKNOWN" as const,
      },
    ],
  },
} satisfies NonNullable<HostDashboardProps["current"]>;

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
    const mobile = container.querySelector(".rm-host-dashboard-mobile") as HTMLElement;
    expect(mobileText.indexOf("지금 처리할 일")).toBeGreaterThanOrEqual(0);
    expect(mobileText.indexOf("현재 세션")).toBeGreaterThanOrEqual(0);
    expect(mobileText.indexOf("지금 처리할 일")).toBeLessThan(mobileText.indexOf("현재 세션"));
    expect(within(mobile).getByText("확인할 운영 항목")).toBeInTheDocument();
    expect(within(mobile).getByText("예정 세션", { exact: true })).toBeInTheDocument();
    expect(within(mobile).getByRole("heading", { name: "운영 흐름", level: 3 })).toBeInTheDocument();
    expect(within(mobile).queryByText("다음 세션과 운영 흐름")).not.toBeInTheDocument();
  });

  it("summarizes the highest mobile ledger item in the disclosure", () => {
    const { container } = render(
      <HostDashboard
        data={{ ...dashboard, rsvpPending: 4, checkinMissing: 2 }}
        current={currentSession}
        hostSessions={hostSessions}
        actions={actions}
      />,
    );

    const mobile = container.querySelector(".rm-host-dashboard-mobile") as HTMLElement;
    const disclosure = within(mobile).getByText("확인할 운영 항목").closest("details") as HTMLElement;
    expect(within(disclosure).getByText("6건")).toBeInTheDocument();
    expect(within(disclosure).getByText(/RSVP.*4건/)).toBeInTheDocument();
  });

  it("groups mobile current-session content and removes duplicate attendance copy", () => {
    const { container } = render(
      <HostDashboard
        data={{ ...dashboard, rsvpPending: 1 }}
        current={currentSession}
        hostSessions={hostSessions}
        actions={actions}
      />,
    );

    const mobile = container.querySelector(".rm-host-dashboard-mobile") as HTMLElement;
    const card = within(mobile).getByRole("article", { name: "현재 세션 요약" });
    const head = card.querySelector(".rm-host-dashboard-mobile__session-head") as HTMLElement;
    const note = head.querySelector(".rm-host-dashboard-mobile__session-note") as HTMLElement;

    expect(head).toBeInTheDocument();
    expect(within(head).getByRole("group", { name: /No\.09/ })).not.toHaveTextContent("이번 세션");
    expect(note).toHaveTextContent("미응답 1명");
    expect(head).not.toHaveTextContent("참석 1명");
    expect(within(card).getByRole("link", { name: "세션 문서 열기" })).toHaveAttribute(
      "href",
      "/app/host/sessions/session-9/edit",
    );
  });

  it("keeps the mobile current-session empty state actionable", () => {
    const { container } = render(
      <HostDashboard
        data={dashboard}
        current={{ currentSession: null }}
        hostSessions={hostSessions}
        actions={actions}
      />,
    );

    const mobile = container.querySelector(".rm-host-dashboard-mobile") as HTMLElement;
    const card = within(mobile).getByRole("article", { name: "현재 세션 요약" });
    expect(within(card).getByText("열린 세션 없음")).toBeInTheDocument();
    expect(within(card).getByRole("link", { name: "세션 문서 만들기" })).toBeInTheDocument();
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
    expect((await screen.findAllByRole("alert"))[0]).toHaveTextContent(
      "공개 범위를 저장하지 못했습니다. 기존 공개 범위는 유지됩니다. 다시 시도해 주세요.",
    );
    expect(screen.getAllByText("비공개").length).toBeGreaterThan(0);
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
