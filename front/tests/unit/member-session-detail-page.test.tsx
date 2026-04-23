import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MemberArchiveSessionDetailResponse } from "@/features/archive/api/archive-contracts";
import {
  enrichSessionDetailHighlightAuthors,
  memberSessionDetailLoader,
} from "@/features/archive/route/member-session-detail-data";
import MemberSessionDetailPage from "@/features/archive/ui/member-session-detail-page";
import MemberSessionDetailRoutePage from "@/src/pages/member-session";
import { archiveSessionDetailContractFixture } from "./api-contract-fixtures";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const readableSession: MemberArchiveSessionDetailResponse = archiveSessionDetailContractFixture;

function installRouterRequestShim() {
  const NativeRequest = globalThis.Request;

  vi.stubGlobal(
    "Request",
    class RouterTestRequest extends NativeRequest {
      constructor(input: RequestInfo | URL, init?: RequestInit) {
        super(input, init === undefined ? init : { ...init, signal: undefined });
      }
    },
  );
}

function renderDetail(session: MemberArchiveSessionDetailResponse = readableSession) {
  return render(<MemberSessionDetailPage session={session} />);
}

function getDesktop(container: HTMLElement) {
  const desktop = container.querySelector(".desktop-only");
  expect(desktop).not.toBeNull();
  return within(desktop as HTMLElement);
}

function getMobile(container: HTMLElement) {
  const mobile = container.querySelector(".mobile-only");
  expect(mobile).not.toBeNull();
  return within(mobile as HTMLElement);
}

function LocationStateEcho() {
  const location = useLocation();
  const state = location.state as {
    readmatesReturnTo?: string;
    readmatesReturnLabel?: string;
    readmatesReturnState?: {
      readmatesReturnTo?: string;
      readmatesReturnLabel?: string;
    };
  } | null;

  return (
    <main>
      <div data-testid="return-to">{state?.readmatesReturnTo ?? ""}</div>
      <div data-testid="return-label">{state?.readmatesReturnLabel ?? ""}</div>
      <div data-testid="nested-return-to">{state?.readmatesReturnState?.readmatesReturnTo ?? ""}</div>
      <div data-testid="nested-return-label">{state?.readmatesReturnState?.readmatesReturnLabel ?? ""}</div>
    </main>
  );
}

describe("MemberSessionDetailPage", () => {
  it("enriches legacy session detail highlights from the notes feed authors", () => {
    const enriched = enrichSessionDetailHighlightAuthors(
      {
        ...readableSession,
        publicHighlights: [
          {
            text: "작성자 보강이 필요한 하이라이트",
            sortOrder: 0,
            authorName: null,
            authorShortName: null,
          },
        ],
      },
      [
        {
          sessionId: readableSession.sessionId,
          sessionNumber: readableSession.sessionNumber,
          bookTitle: readableSession.bookTitle,
          date: readableSession.date,
          kind: "HIGHLIGHT",
          text: "작성자 보강이 필요한 하이라이트",
          authorName: "이멤버5",
          authorShortName: "수",
        },
      ],
    );

    expect(enriched.publicHighlights[0]).toMatchObject({
      authorName: "이멤버5",
      authorShortName: "수",
    });
  });

  it("renders readable feedback actions without the public guest CTA", () => {
    const { container } = renderDetail();
    const desktop = getDesktop(container);
    const mobile = getMobile(container);

    expect(desktop.getByText("팩트풀니스")).toBeInTheDocument();
    expect(desktop.getByText(/한스 로슬링/)).toBeInTheDocument();
    expect(desktop.getByText("아카이브 세션 · No.01 · 2025.11.26")).toBeInTheDocument();
    expect(desktop.getByRole("group", { name: "No.01 · 지난 회차 · 공개됨 · 문서 있음" })).toBeInTheDocument();
    expect(desktop.queryByRole("link", { name: "아카이브로" })).not.toBeInTheDocument();
    const returnLink = desktop.getByRole("link", { name: "아카이브로 돌아가기" });
    expect(returnLink).toHaveAttribute("href", "/app/archive?view=sessions");
    expect(returnLink).toHaveTextContent("← 아카이브");
    expect(desktop.getByRole("link", { name: "요약" })).toBeInTheDocument();
    expect(desktop.getByRole("link", { name: "회차 기록" })).toBeInTheDocument();
    expect(desktop.getByRole("link", { name: "함께 남긴 질문" })).toBeInTheDocument();
    expect(desktop.queryByRole("link", { name: "피드백" })).not.toBeInTheDocument();
    expect(desktop.queryByRole("link", { name: "내 기록" })).not.toBeInTheDocument();
    expect(desktop.queryAllByRole("heading", { name: "요약" })).toHaveLength(1);
    expect(desktop.getByRole("heading", { name: "회차 기록" })).toBeInTheDocument();
    expect(desktop.getByRole("heading", { name: "회차 하이라이트 · 1" })).toBeInTheDocument();
    const desktopHighlightRow = desktop
      .getByText("세계는 생각보다 나아지고 있지만, 우리의 감각은 느리게 따라온다.")
      .closest(".rm-session-highlight-row");
    expect(desktopHighlightRow).not.toBeNull();
    expect(within(desktopHighlightRow as HTMLElement).getByText("안멤버1")).toBeInTheDocument();
    expect(within(desktopHighlightRow as HTMLElement).getByLabelText("안멤버1")).toBeInTheDocument();
    expect(desktop.getByRole("heading", { name: "한줄평 · 1" })).toBeInTheDocument();
    expect(desktop.getByRole("heading", { name: "함께 남긴 질문" })).toBeInTheDocument();
    expect(desktop.getByText("Q1 · 이멤버5")).toHaveStyle({ color: "var(--text-3)" });
    expect(desktop.queryByText("함께 남긴 질문 Q1 · 이멤버5")).not.toBeInTheDocument();
    expect(desktop.getAllByText("2026.04.20 등록").length).toBeGreaterThan(0);
    expect(mobile.getByText("팩트풀니스")).toBeInTheDocument();
    expect(mobile.getByText(/한스 로슬링/)).toBeInTheDocument();
    expect(mobile.getByText("No.01 · 2025.11.26")).toBeInTheDocument();
    expect(mobile.getByRole("group", { name: "No.01 · 지난 회차 · 공개됨 · 문서 있음" })).toBeInTheDocument();
    expect(mobile.getByRole("link", { name: "회차 기록" })).toBeInTheDocument();
    expect(mobile.getByRole("link", { name: "질문" })).toBeInTheDocument();
    expect(mobile.queryByRole("link", { name: "피드백" })).not.toBeInTheDocument();
    expect(container.querySelector(".mobile-only .rm-session-detail-mobile-tabs")).not.toBeNull();
    expect(mobile.getByRole("link", { name: "요약" })).toHaveClass("rm-session-detail-mobile-tab");
    expect(mobile.getByRole("link", { name: "회차 기록" })).toHaveClass("rm-session-detail-mobile-tab");
    expect(mobile.getByRole("link", { name: "질문" })).toHaveClass("rm-session-detail-mobile-tab");
    expect(mobile.queryByRole("link", { name: "내 기록" })).not.toBeInTheDocument();
    expect(mobile.queryAllByRole("heading", { name: "요약" })).toHaveLength(1);
    expect(mobile.getByRole("heading", { name: "회차 기록" })).toBeInTheDocument();
    expect(mobile.getByRole("heading", { name: "회차 하이라이트 · 1" })).toBeInTheDocument();
    const mobileHighlightRow = mobile
      .getByText("세계는 생각보다 나아지고 있지만, 우리의 감각은 느리게 따라온다.")
      .closest(".rm-session-highlight-row");
    expect(mobileHighlightRow).not.toBeNull();
    expect(within(mobileHighlightRow as HTMLElement).getByText("안멤버1")).toBeInTheDocument();
    expect(within(mobileHighlightRow as HTMLElement).getByLabelText("안멤버1")).toBeInTheDocument();
    expect(mobile.getByRole("heading", { name: "한줄평 · 1" })).toBeInTheDocument();
    expect(mobile.getByRole("heading", { name: "함께 남긴 질문" })).toBeInTheDocument();
    expect(mobile.getByText("Q1 · 이멤버5")).toHaveStyle({ color: "var(--text-3)" });
    expect(mobile.queryByText("함께 남긴 질문 Q1 · 이멤버5")).not.toBeInTheDocument();
    expect(mobile.getByText("2026.04.20 등록")).toBeInTheDocument();
    expect(container).not.toHaveTextContent("Join the reading");
    expect(container).not.toHaveTextContent("하이라이트와 한줄평");
    expect(container).not.toHaveTextContent("내 질문");
    expect(container.querySelector(".desktop-only #feedback")).toBeNull();
    expect(container.querySelector(".mobile-only #mobile-feedback")).toBeNull();

    for (const scope of [desktop, mobile]) {
      expect(scope.getByRole("link", { name: "피드백 보기" })).toHaveAttribute(
        "href",
        "/app/feedback/00000000-0000-0000-0000-000000000301",
      );
      expect(scope.queryByRole("link", { name: "피드백 문서 열기" })).not.toBeInTheDocument();
      expect(scope.queryByRole("link", { name: "PDF 저장" })).not.toBeInTheDocument();
    }
  });

  it("does not render the archive return link above the session detail", async () => {
    installRouterRequestShim();
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = input.toString();

        if (url === "/api/bff/api/auth/me") {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                authenticated: true,
                userId: "member-user",
                membershipId: "member-membership",
                clubId: "club-id",
                email: "member@example.com",
                displayName: "이멤버5",
                shortName: "멤버",
                role: "MEMBER",
                membershipStatus: "ACTIVE",
                approvalState: "ACTIVE",
              }),
              {
                status: 200,
                headers: { "Content-Type": "application/json" },
              },
            ),
          );
        }

        return Promise.resolve(
          new Response(JSON.stringify(readableSession), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }),
    );

    const router = createMemoryRouter(
      [
        {
          path: "/app/sessions/:sessionId",
          element: <MemberSessionDetailRoutePage />,
          loader: memberSessionDetailLoader,
          hydrateFallbackElement: <div>지난 세션 기록을 불러오는 중</div>,
        },
      ],
      {
        initialEntries: [
          {
            pathname: "/app/sessions/session-1",
            state: {
              readmatesReturnTo: "/app/archive?view=reviews",
              readmatesReturnLabel: "아카이브로",
            },
          },
        ],
      },
    );
    const { container } = render(<RouterProvider router={router} />);

    expect((await screen.findAllByText("팩트풀니스")).length).toBeGreaterThan(0);
    expect(getDesktop(container).queryByRole("link", { name: "아카이브로" })).not.toBeInTheDocument();
  });

  it("passes session-detail return state to feedback actions while preserving archive return state", async () => {
    const user = userEvent.setup();
    installRouterRequestShim();
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = input.toString();

        if (url === "/api/bff/api/auth/me") {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                authenticated: true,
                userId: "member-user",
                membershipId: "member-membership",
                clubId: "club-id",
                email: "member@example.com",
                displayName: "이멤버5",
                shortName: "멤버",
                role: "MEMBER",
                membershipStatus: "ACTIVE",
                approvalState: "ACTIVE",
              }),
              {
                status: 200,
                headers: { "Content-Type": "application/json" },
              },
            ),
          );
        }

        return Promise.resolve(
          new Response(JSON.stringify(readableSession), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }),
    );

    const router = createMemoryRouter(
      [
        {
          path: "/app/sessions/:sessionId",
          element: <MemberSessionDetailRoutePage />,
          loader: memberSessionDetailLoader,
          hydrateFallbackElement: <div>지난 세션 기록을 불러오는 중</div>,
        },
        { path: "/app/feedback/:sessionId", element: <LocationStateEcho /> },
      ],
      {
        initialEntries: [
          {
            pathname: "/app/sessions/session-1",
            state: {
              readmatesReturnTo: "/app/archive?view=reviews",
              readmatesReturnLabel: "아카이브로",
            },
          },
        ],
      },
    );
    const { container } = render(<RouterProvider router={router} />);

    expect((await screen.findAllByText("팩트풀니스")).length).toBeGreaterThan(0);

    await user.click(getDesktop(container).getByRole("link", { name: "피드백 보기" }));

    expect(screen.getByTestId("return-to")).toHaveTextContent(
      "/app/sessions/00000000-0000-0000-0000-000000000301",
    );
    expect(screen.getByTestId("return-label")).toHaveTextContent("세션으로 돌아가기");
    expect(screen.getByTestId("nested-return-to")).toHaveTextContent("/app/archive?view=reviews");
    expect(screen.getByTestId("nested-return-label")).toHaveTextContent("아카이브로");
  });

  it("encodes feedback document links from session details", () => {
    const { container } = renderDetail({
      ...readableSession,
      sessionId: "session 1/slash",
    });
    const desktop = getDesktop(container);

    expect(desktop.getByRole("link", { name: "피드백 보기" })).toHaveAttribute(
      "href",
      "/app/feedback/session%201%2Fslash",
    );
    expect(desktop.queryByRole("link", { name: "PDF 저장" })).not.toBeInTheDocument();
  });

  it("shows locked feedback copy for non-attendees without feedback document links", () => {
    const { container } = renderDetail({
      ...readableSession,
      myAttendanceStatus: "ABSENT",
      feedbackDocument: {
        available: true,
        readable: false,
        lockedReason: "NOT_ATTENDED",
        title: "독서모임 1차 피드백",
        uploadedAt: "2026-04-20T09:00:00Z",
      },
    });

    expect(screen.getAllByText("피드백 문서는 정식 멤버 중 이 회차 참석자로 확인된 계정에만 열립니다.").length).toBeGreaterThan(0);
    expect(screen.queryByRole("link", { name: "피드백 보기" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "PDF 저장" })).not.toBeInTheDocument();
    expect(container.querySelector('a[href="/app/feedback/00000000-0000-0000-0000-000000000301"]')).toBeNull();
    expect(container.querySelector('a[href="/app/feedback/00000000-0000-0000-0000-000000000301/print"]')).toBeNull();

    const lockedBadges = Array.from(container.querySelectorAll(".badge")).filter((badge) => badge.textContent === "피드백 잠김");
    expect(lockedBadges).toHaveLength(2);
    lockedBadges.forEach((badge) => {
      expect(badge).toHaveClass("badge-locked");
      expect(badge).not.toHaveClass("badge-readonly");
    });
    expect(container.querySelectorAll(".rm-locked-state")).toHaveLength(1);
    expect(container.querySelector(".surface-quiet.rm-state--locked")).toHaveTextContent("피드백 잠김");
  });

  it("shows missing feedback copy when no feedback document is available", () => {
    const { container } = renderDetail({
      ...readableSession,
      feedbackDocument: {
        available: false,
        readable: false,
        lockedReason: "NOT_AVAILABLE",
        title: null,
        uploadedAt: null,
      },
    });

    expect(screen.getAllByText("호스트가 문서를 등록하면 참석 기록과 함께 열람 가능 여부가 표시됩니다.").length).toBeGreaterThan(0);
    expect(screen.queryByRole("link", { name: "피드백 보기" })).not.toBeInTheDocument();

    const readonlyBadges = Array.from(container.querySelectorAll(".badge")).filter((badge) => badge.textContent === "피드백 없음");
    expect(readonlyBadges).toHaveLength(2);
    readonlyBadges.forEach((badge) => {
      expect(badge).toHaveClass("badge-readonly");
      expect(badge).not.toHaveClass("badge-locked");
    });
    expect(container.querySelectorAll(".rm-empty-state.rm-state--readonly")).toHaveLength(1);
    expect(container.querySelector(".surface-quiet.rm-state--readonly")).toHaveTextContent("피드백 없음");
  });

  it("does not render personal question records on the session detail", () => {
    renderDetail({
      ...readableSession,
      myQuestions: [
        {
          priority: 1,
          text: "내 질문은 상세 화면에서 숨긴다.",
          draftThought: null,
          authorName: "이멤버5",
          authorShortName: "수",
        },
      ],
    });

    expect(screen.queryByText("내 질문은 상세 화면에서 숨긴다.")).not.toBeInTheDocument();
    expect(screen.queryByText("내 질문")).not.toBeInTheDocument();
  });

  it("renders mobile highlight and question cards in spaced lists", () => {
    const { container } = renderDetail();
    const mobileHighlights = container.querySelector(".mobile-only #mobile-highlights");
    const mobileQuestions = container.querySelector(".mobile-only #mobile-questions");

    expect(mobileHighlights).not.toBeNull();
    expect(mobileQuestions).not.toBeNull();
    expect(mobileHighlights?.querySelector(":scope > .rm-mobile-record-list")).not.toBeNull();
    expect(mobileQuestions?.querySelector(":scope > .rm-mobile-record-list")).not.toBeNull();
    expect(mobileHighlights?.querySelectorAll(".rm-session-highlight-row").length).toBeGreaterThanOrEqual(1);
    expect(mobileHighlights?.querySelectorAll(".m-card, .m-card-quiet").length).toBeGreaterThanOrEqual(1);
    expect(mobileQuestions?.querySelectorAll(".m-card, .m-card-quiet").length).toBeGreaterThanOrEqual(1);
  });

  it("removes club checkins and shows club one-line records", () => {
    renderDetail({
      ...readableSession,
      clubOneLiners: [
        {
          authorName: "김호스트",
          authorShortName: "호스트",
          text: "낙관이 아니라 정확함의 문제였다.",
        },
      ],
      publicOneLiners: [
        {
          authorName: "김호스트",
          authorShortName: "호스트",
          text: "정확함의 문제였다.",
        },
      ],
    });

    expect(screen.queryByText("체크인")).not.toBeInTheDocument();
    expect(screen.getAllByText("낙관이 아니라 정확함의 문제였다.").length).toBeGreaterThan(0);
    const authorAvatars = screen.getAllByLabelText("김호스트");
    expect(authorAvatars.length).toBeGreaterThan(0);
    expect(authorAvatars.every((avatar) => avatar.textContent === "김")).toBe(true);
  });

  it("shows a host edit link in the desktop rail for hosts", () => {
    const { container } = renderDetail({
      ...readableSession,
      isHost: true,
    });

    const desktop = getDesktop(container);
    expect(desktop.getByRole("link", { name: "세션 편집" })).toHaveAttribute(
      "href",
      "/app/host/sessions/00000000-0000-0000-0000-000000000301/edit",
    );
  });
});
