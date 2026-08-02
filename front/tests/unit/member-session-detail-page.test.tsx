import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, useLocation } from "react-router";
import { RouterProvider } from "react-router/dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MemberArchiveSessionDetailResponse } from "@/features/archive/api/archive-contracts";
import {
  guestSessionDetailReadView,
  memberSessionDetailReadView,
  type GuestSessionDetailReadSource,
  type SessionDetailReadView,
} from "@/features/archive/model/session-detail-read-view";
import {
  enrichSessionDetailHighlightAuthors,
  memberSessionDetailLoaderFactory,
} from "@/features/archive/route/member-session-detail-data";
import MemberSessionDetailPage from "@/features/archive/ui/member-session-detail-page";
import MemberSessionDetailRoutePage, { GuestSessionDetailContent } from "@/src/pages/member-session";
import { archiveSessionDetailContractFixture } from "./api-contract-fixtures";
import {
  GUEST_READ_SURFACE_CAPABILITIES,
  MEMBER_READ_SURFACE_CAPABILITIES,
  VIEWER_READ_SURFACE_CAPABILITIES,
} from "@/shared/model/read-surface-capabilities";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const readableSession: MemberArchiveSessionDetailResponse = archiveSessionDetailContractFixture;

const anonymousAuth = {
  authenticated: false,
  userId: null,
  membershipId: null,
  clubId: null,
  email: null,
  displayName: null,
  accountName: null,
  role: null,
  membershipStatus: null,
  approvalState: "ANONYMOUS",
};

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

function memberDetailView(
  session: MemberArchiveSessionDetailResponse = readableSession,
): SessionDetailReadView {
  return memberSessionDetailReadView(
    session,
    MEMBER_READ_SURFACE_CAPABILITIES,
  );
}

function renderDetail(session: MemberArchiveSessionDetailResponse = readableSession) {
  return render(<MemberSessionDetailPage session={memberDetailView(session)} />);
}

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

function renderRouterWithQueryClient(router: ReturnType<typeof createMemoryRouter>, queryClient: QueryClient) {
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
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

function badgeTexts(scope: HTMLElement) {
  return Array.from(scope.querySelectorAll(".badge")).map((badge) => badge.textContent);
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
  it("keeps member and guest public section heading order identical", () => {
    const member = memberSessionDetailReadView(
      readableSession,
      MEMBER_READ_SURFACE_CAPABILITIES,
      [{ authorName: "서평 작성자", authorShortName: "서평", avatarKey: "book", body: "공개 서평" }],
    );
    const guest = guestSessionDetailReadView({
      sessionId: "guest-session-7",
      sessionNumber: 7,
      title: "지난 모임",
      bookTitle: "기록 책",
      bookAuthor: "기록 작가",
      bookImageUrl: null,
      date: "2026-07-01",
      attendance: 4,
      total: 5,
      state: "CLOSED",
      summary: "공개 요약",
      highlights: [],
      questions: [],
      oneLiners: [{ text: "한 줄 감상", authorName: "전체 이름", authorShortName: "전체", avatarKey: "book" }],
      longReviews: [{ title: "공개 서평 제목", content: "공개 서평", authorName: "서평 작성자", authorShortName: "서평", avatarKey: "book" }],
    } satisfies GuestSessionDetailReadSource);
    expect(guest).not.toBeNull();

    const memberRender = render(<MemberSessionDetailPage session={member} />);
    const memberDesktop = memberRender.container.querySelector(".desktop-only");
    expect(memberDesktop).not.toBeNull();
    const memberHeadings = Array.from(
      (memberDesktop as HTMLElement).querySelectorAll("#summary > h2, #highlights > h2, #questions > h2, #long-reviews > h2"),
    )
      .map((heading) => heading.textContent);
    const memberMobileHeadings = Array.from(
      memberRender.container.querySelectorAll("#mobile-summary h2, #mobile-highlights h2, #mobile-questions h2, #mobile-long-reviews h2"),
    ).map((heading) => heading.textContent);
    expect(within(memberDesktop as HTMLElement).getByText("공개 서평", { selector: "p" })).toBeVisible();
    memberRender.unmount();

    const guestRender = render(
      <MemberSessionDetailPage
        session={guest as SessionDetailReadView}
        feedbackLockedAction={<button type="button">피드백 보기</button>}
      />,
    );
    const guestDesktop = guestRender.container.querySelector(".desktop-only");
    expect(guestDesktop).not.toBeNull();
    const guestHeadings = Array.from(
      (guestDesktop as HTMLElement).querySelectorAll("#summary > h2, #highlights > h2, #questions > h2, #long-reviews > h2"),
    )
      .map((heading) => heading.textContent);
    const guestMobileHeadings = Array.from(
      guestRender.container.querySelectorAll("#mobile-summary h2, #mobile-highlights h2, #mobile-questions h2, #mobile-long-reviews h2"),
    ).map((heading) => heading.textContent);
    expect(within(guestDesktop as HTMLElement).getByText("공개 서평", { selector: "p" })).toBeVisible();
    expect(within(guestDesktop as HTMLElement).getByText("전체 이름")).toBeVisible();
    const guestOneLinerAvatar = within(guestDesktop as HTMLElement)
      .getByText("한 줄 감상")
      .closest("article")
      ?.querySelector(".rm-avatar-chip");
    expect(guestOneLinerAvatar?.querySelector("img")).toHaveAttribute("aria-hidden", "true");
    expect(guestOneLinerAvatar).toHaveAttribute("data-avatar-size-role", "dense");
    expect(
      within(guestDesktop as HTMLElement)
        .getByText("공개 서평", { selector: "p" })
        .closest("article")
        ?.querySelector(".rm-avatar-chip"),
    ).toHaveAttribute("data-avatar-size-role", "dense");

    expect(memberHeadings).toEqual(["요약", "회차 기록", "함께 남긴 질문", "공개 서평"]);
    expect(guestHeadings).toEqual(memberHeadings);
    expect(memberMobileHeadings).toEqual(memberHeadings);
    expect(guestMobileHeadings).toEqual(memberHeadings);
    expect(guest?.capabilities).toBe(GUEST_READ_SURFACE_CAPABILITIES);
  });

  it("renders generic locked feedback for viewers without reading feedback metadata", () => {
    const viewer = memberSessionDetailReadView(
      readableSession,
      VIEWER_READ_SURFACE_CAPABILITIES,
    );
    Object.defineProperty(viewer, "feedbackDocument", {
      configurable: true,
      get() {
        throw new Error("feedback metadata must stay unread");
      },
    });

    const { container } = render(
      <MemberSessionDetailPage
        session={viewer}
        feedbackLockedAction={<button type="button">피드백 보기</button>}
      />,
    );

    for (const scope of [getDesktop(container), getMobile(container)]) {
      expect(scope.getByText("정식 멤버 전용")).toBeVisible();
      expect(scope.getByText("피드백 문서는 정식 멤버에게만 열립니다.")).toBeVisible();
      expect(scope.getByRole("button", { name: "피드백 보기" })).toBeVisible();
      expect(scope.queryByText("내부 피드백")).not.toBeInTheDocument();
      expect(scope.queryByText(/등록$/)).not.toBeInTheDocument();
      expect(scope.queryByText(/피드백 O|피드백 잠김|피드백 없음/)).not.toBeInTheDocument();
    }
  });

  it("renders the existing unavailable boundary for an invalid guest session state", () => {
    render(
      <GuestSessionDetailContent
        data={{
          sessionId: "guest-invalid",
          sessionNumber: 7,
          title: "지난 모임",
          bookTitle: "기록 책",
          bookAuthor: "기록 작가",
          bookImageUrl: null,
          date: "2026-07-01",
          attendance: 4,
          total: 5,
          state: "ARCHIVED",
          summary: "공개 요약",
          highlights: [],
          questions: [],
          oneLiners: [],
          longReviews: [],
        }}
        appBasePath="/clubs/reading-sai/app"
        feedbackLockedAction={<button type="button">피드백 보기</button>}
      />,
    );

    expect(screen.getAllByText("지난 세션을 찾을 수 없습니다.")).toHaveLength(2);
  });

  it("redirects anonymous direct session-detail navigation to login with returnTo", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      if (input.toString() === "/api/bff/api/auth/me?clubSlug=reading-sai") {
        return Promise.resolve(
          new Response(JSON.stringify(anonymousAuth), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }

      return Promise.reject(new Error(`Unexpected BFF path: ${input.toString()}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    try {
      await memberSessionDetailLoaderFactory(createTestQueryClient())({
        params: { clubSlug: "reading-sai", sessionId: "session-6" },
        request: new Request("https://app.readmates.example/clubs/reading-sai/app/sessions/session-6?from=email"),
      } as Parameters<ReturnType<typeof memberSessionDetailLoaderFactory>>[0]);
      throw new Error("Expected redirect");
    } catch (error) {
      expect(error).toBeInstanceOf(Response);
      expect((error as Response).status).toBe(302);
      expect((error as Response).headers.get("Location")).toBe(
        "/login?returnTo=%2Fclubs%2Freading-sai%2Fapp%2Fsessions%2Fsession-6%3Ffrom%3Demail",
      );
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

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
            avatarKey: "cloud-green-book",
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
          avatarKey: "cloud-green-book",
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
    expect(desktop.getByRole("group", { name: "No.01 · 비공개" })).toBeInTheDocument();
    const desktopBadges = badgeTexts(container.querySelector(".desktop-only") as HTMLElement);
    expect(desktopBadges).toContain("2025.11.26");
    expect(desktopBadges).toContain("참석 5/6");
    expect(desktopBadges).toContain("피드백 O");
    const desktopAttendanceBadge = desktop.getByText("참석 5/6");
    const desktopFeedbackBadge = desktop.getByText("피드백 O");
    expect(desktopAttendanceBadge.compareDocumentPosition(desktopFeedbackBadge) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(desktopBadges).not.toContain("온라인");
    expect(desktopBadges).not.toContain("피드백 공개");
    expect(desktop.queryByRole("link", { name: "아카이브로" })).not.toBeInTheDocument();
    const returnLink = desktop.getByRole("link", { name: "아카이브로 돌아가기" });
    expect(returnLink).toHaveAttribute("href", "/app/archive?view=sessions");
    expect(returnLink).toHaveTextContent("← 아카이브");
    expect(returnLink.closest(".rm-session-detail-kicker")).toHaveTextContent(/^← 아카이브$/);
    expect(desktop.queryByText("아카이브 세션 · No.01 · 2025.11.26")).not.toBeInTheDocument();
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
    expect((desktopHighlightRow as HTMLElement).querySelector(".rm-avatar-chip img")).toHaveAttribute(
      "src",
      "/assets/avatars/book-club/cloud-green-book.webp",
    );
    expect((desktopHighlightRow as HTMLElement).querySelector(".rm-avatar-chip")).toHaveClass("rm-avatar-chip--artwork");
    expect((desktopHighlightRow as HTMLElement).querySelector(".rm-avatar-chip")).toHaveAttribute(
      "data-avatar-size-role",
      "dense",
    );
    expect(desktop.getByRole("heading", { name: "한줄평 · 1" })).toBeInTheDocument();
    expect(
      desktop.getByText("낙관이 아니라 정확함의 문제였다.").closest("article")?.querySelector(".rm-avatar-chip"),
    ).toHaveAttribute("data-avatar-size-role", "dense");
    expect(desktop.getByRole("heading", { name: "함께 남긴 질문" })).toBeInTheDocument();
    expect(desktop.getByText("Q1 · 이멤버5")).toHaveStyle({ color: "var(--text-3)" });
    expect(desktop.queryByText("함께 남긴 질문 Q1 · 이멤버5")).not.toBeInTheDocument();
    expect(desktop.getAllByText("2026.04.20 등록").length).toBeGreaterThan(0);
    expect(mobile.getByText("팩트풀니스")).toBeInTheDocument();
    expect(mobile.getByText(/한스 로슬링/)).toBeInTheDocument();
    expect(mobile.queryByText("No.01 · 2025.11.26")).not.toBeInTheDocument();
    const mobileDateBadge = mobile.getByText("2025.11.26");
    const mobileAttendanceBadge = mobile.getByText("참석 5/6");
    const mobileFeedbackBadge = mobile.getByText("피드백 O");
    expect(mobileDateBadge.compareDocumentPosition(mobileAttendanceBadge) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(mobileAttendanceBadge.compareDocumentPosition(mobileFeedbackBadge) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const mobileBadges = badgeTexts(container.querySelector(".mobile-only") as HTMLElement);
    expect(mobileBadges).toContain("2025.11.26");
    expect(mobileBadges).toContain("참석 5/6");
    expect(mobileBadges).toContain("피드백 O");
    expect(mobileBadges).not.toContain("피드백 공개");
    expect(mobile.getByRole("group", { name: "No.01 · 비공개" })).toBeInTheDocument();
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
    const mobileHighlightHeading = mobile.getByRole("heading", { name: "회차 하이라이트 · 1" });
    expect(mobileHighlightHeading).toHaveClass("h4");
    expect(mobileHighlightHeading).not.toHaveClass("small", "mono");
    const mobileHighlightRow = mobile
      .getByText("세계는 생각보다 나아지고 있지만, 우리의 감각은 느리게 따라온다.")
      .closest(".rm-session-highlight-row");
    expect(mobileHighlightRow).not.toBeNull();
    expect(within(mobileHighlightRow as HTMLElement).getByText("안멤버1")).toBeInTheDocument();
    expect((mobileHighlightRow as HTMLElement).querySelector(".rm-avatar-chip img")).toHaveAttribute(
      "src",
      "/assets/avatars/book-club/cloud-green-book.webp",
    );
    const mobileOneLinerHeading = mobile.getByRole("heading", { name: "한줄평 · 1" });
    expect(mobileOneLinerHeading).toHaveClass("h4");
    expect(mobileOneLinerHeading).not.toHaveClass("small", "mono");
    expect(mobile.getByRole("heading", { name: "함께 남긴 질문" })).toBeInTheDocument();
    expect(mobile.getByText("Q1 · 이멤버5")).toHaveStyle({ color: "var(--text-3)" });
    expect(mobile.queryByText("함께 남긴 질문 Q1 · 이멤버5")).not.toBeInTheDocument();
    expect(mobile.getByText("2026.04.20 등록")).toBeInTheDocument();
    for (const scope of [desktop, mobile]) {
      const summary = scope.getByText("데이터로 세상을 더 정확하게 보는 태도를 이야기했습니다.");
      const highlight = scope.getByText("세계는 생각보다 나아지고 있지만, 우리의 감각은 느리게 따라온다.");
      const question = scope.getByRole("heading", {
        name: "10가지 본능 중에서 본인에게 가장 강하게 작용한다고 느낀 것은 무엇인가요?",
      });
      const questionContext = scope.getByText("데이터 기반 사고가 일상 판단과 멀어지는 순간을 묻는다.");
      const oneLiner = scope.getByText("낙관이 아니라 정확함의 문제였다.");

      expect(summary).toHaveClass("body-lg");
      expect(highlight).toHaveClass("body-lg", "editorial");
      expect(question).toHaveClass("body-lg", "editorial");
      expect(questionContext).toHaveClass("body");
      expect(oneLiner).toHaveClass("body", "editorial");
      for (const readingNode of [summary, highlight, question, questionContext, oneLiner]) {
        expect(readingNode).not.toHaveClass("reading-editorial");
      }
      expect(scope.getByRole("heading", { name: "회차 기록" })).not.toHaveClass("reading-editorial");
    }
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

  it("does not label closed sessions with saved summaries as published", () => {
    const { container } = renderDetail({
      ...readableSession,
      state: "CLOSED",
      publicSummary: "멤버에게 보일 요약은 있지만 아직 공개 완료 전입니다.",
    });

    expect(getDesktop(container).getByRole("group", { name: "No.01 · 비공개" })).toBeInTheDocument();
    expect(getMobile(container).getByRole("group", { name: "No.01 · 비공개" })).toBeInTheDocument();
    expect(container).not.toHaveTextContent("공개됨");
  });

  it("labels published member sessions with saved summaries as published", () => {
    const { container } = renderDetail({
      ...readableSession,
      state: "PUBLISHED",
      publicSummary: "멤버에게 공개된 최종 기록입니다.",
    });

    expect(getDesktop(container).getByRole("group", { name: "No.01 · 공개" })).toBeInTheDocument();
    expect(getMobile(container).getByRole("group", { name: "No.01 · 공개" })).toBeInTheDocument();
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
                accountName: "멤버",
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

    const queryClient = createTestQueryClient();
    const router = createMemoryRouter(
      [
        {
          path: "/app/sessions/:sessionId",
          element: <MemberSessionDetailRoutePage />,
          loader: memberSessionDetailLoaderFactory(queryClient),
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
    const { container } = renderRouterWithQueryClient(router, queryClient);

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
                accountName: "멤버",
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

    const queryClient = createTestQueryClient();
    const router = createMemoryRouter(
      [
        {
          path: "/app/sessions/:sessionId",
          element: <MemberSessionDetailRoutePage />,
          loader: memberSessionDetailLoaderFactory(queryClient),
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
    const { container } = renderRouterWithQueryClient(router, queryClient);

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

  it("shows locked feedback copy for non-active members without feedback document links", () => {
    const { container } = renderDetail({
      ...readableSession,
      myAttendanceStatus: "ABSENT",
      feedbackDocument: {
        available: true,
        readable: false,
        lockedReason: "ACTIVE_MEMBERSHIP_REQUIRED",
        title: "독서모임 1차 피드백",
        uploadedAt: "2026-04-20T09:00:00Z",
      },
    });

    const feedbackHelpers = screen.getAllByText("피드백 문서는 active 정식 멤버에게만 열립니다.");
    expect(feedbackHelpers.length).toBeGreaterThan(0);
    feedbackHelpers.forEach((helper) => {
      expect(helper).toHaveClass("small");
      expect(helper).not.toHaveClass("tiny");
    });
    expect(screen.queryByRole("link", { name: "피드백 보기" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "PDF 저장" })).not.toBeInTheDocument();
    expect(container.querySelector('a[href="/app/feedback/00000000-0000-0000-0000-000000000301"]')).toBeNull();
    expect(container.querySelector('a[href="/app/feedback/00000000-0000-0000-0000-000000000301/print"]')).toBeNull();

    const lockedBadges = Array.from(container.querySelectorAll(".badge")).filter((badge) => badge.textContent === "피드백 잠김");
    expect(lockedBadges).toHaveLength(2);
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

    expect(screen.getAllByText("호스트가 피드백 문서를 등록하면 이 회차에서 확인할 수 있습니다.").length).toBeGreaterThan(0);
    expect(screen.queryByRole("link", { name: "피드백 보기" })).not.toBeInTheDocument();

    const readonlyBadges = Array.from(container.querySelectorAll(".badge")).filter((badge) => badge.textContent === "피드백 없음");
    expect(readonlyBadges.length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText("피드백 X")).not.toBeInTheDocument();
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
          avatarKey: "cloud-green-book",
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
          avatarKey: "cloud-green-book",
          text: "낙관이 아니라 정확함의 문제였다.",
        },
      ],
      publicOneLiners: [
        {
          authorName: "김호스트",
          authorShortName: "호스트",
          avatarKey: "cloud-green-book",
          text: "정확함의 문제였다.",
        },
      ],
    });

    expect(screen.queryByText("체크인")).not.toBeInTheDocument();
    expect(screen.getAllByText("낙관이 아니라 정확함의 문제였다.").length).toBeGreaterThan(0);
    const authorAvatars = screen.getAllByText("김호스트").map((name) => name.parentElement?.querySelector(".rm-avatar-chip img"));
    expect(authorAvatars.length).toBeGreaterThan(0);
    expect(authorAvatars.every((avatar) => avatar?.getAttribute("src") === "/assets/avatars/book-club/cloud-green-book.webp")).toBe(true);
  });

  it("shows a host edit link in the desktop rail for hosts", () => {
    const { container } = renderDetail({
      ...readableSession,
      isHost: true,
    });

    const desktop = getDesktop(container);
    expect(desktop.getByRole("link", { name: "세션 문서 편집" })).toHaveAttribute(
      "href",
      "/app/host/sessions/00000000-0000-0000-0000-000000000301/edit",
    );
  });
});
