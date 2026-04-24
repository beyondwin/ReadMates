import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { saveCheckin } from "@/features/current-session/actions/save-checkin";
import { saveQuestions } from "@/features/current-session/actions/save-question";
import { saveLongReview, saveOneLineReview } from "@/features/current-session/actions/save-review";
import { updateRsvp } from "@/features/current-session/actions/update-rsvp";
import { CurrentSessionPage, type CurrentSessionSaveActions } from "@/features/current-session/ui/current-session-page";
import type {
  CurrentSessionAuth,
  CurrentSessionInternalLinkProps,
  CurrentSessionPageData,
} from "@/features/current-session/ui/current-session-types";
import { CurrentSessionRoute, currentSessionLoader } from "@/features/current-session";
import type { CurrentSessionResponse } from "@/features/current-session/api/current-session-contracts";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";
import { currentSessionContractFixture } from "./api-contract-fixtures";

afterEach(cleanup);
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const currentSessionData: CurrentSessionResponse = {
  currentSession: currentSessionContractFixture.currentSession
    ? {
        ...currentSessionContractFixture.currentSession,
        attendees: [
          ...currentSessionContractFixture.currentSession.attendees,
          {
            membershipId: "member-removed",
            displayName: "제외",
            accountName: "제외",
            role: "MEMBER",
            rsvpStatus: "GOING",
            attendanceStatus: "UNKNOWN",
            participationStatus: "REMOVED",
          },
        ],
      }
    : null,
};

const activeMemberAuthFixture = {
  membershipStatus: "ACTIVE",
  approvalState: "ACTIVE",
} satisfies CurrentSessionAuth;

const viewerAuthFixture = {
  ...activeMemberAuthFixture,
  membershipStatus: "VIEWER",
  approvalState: "VIEWER",
} satisfies CurrentSessionAuth;

const routeAuthFixture = {
  authenticated: true,
  userId: "user-active-member",
  membershipId: "membership-active-member",
  clubId: "club-id",
  email: "member@example.com",
  displayName: "멤버",
  accountName: "이멤버5",
  role: "MEMBER",
  membershipStatus: "ACTIVE",
  approvalState: "ACTIVE",
} satisfies AuthMeResponse;

async function requireSuccessfulTestSave(responsePromise: Promise<Response>) {
  const response = await responsePromise;

  if (!response.ok) {
    throw new Error("Current session save failed.");
  }
}

const currentSessionTestActions = {
  updateRsvp: (status) => requireSuccessfulTestSave(updateRsvp(status)),
  saveCheckin: (readingProgress) => requireSuccessfulTestSave(saveCheckin(readingProgress)),
  saveQuestions: (questions) => requireSuccessfulTestSave(saveQuestions(questions)),
  saveLongReview: (body) => requireSuccessfulTestSave(saveLongReview(body)),
  saveOneLineReview: (text) => requireSuccessfulTestSave(saveOneLineReview(text)),
} satisfies CurrentSessionSaveActions;

function TestInternalLink({ href, children, ...props }: CurrentSessionInternalLinkProps) {
  return (
    <a {...props} href={href}>
      {children}
    </a>
  );
}

function CurrentSession({ auth, data }: { auth?: CurrentSessionAuth; data: CurrentSessionPageData }) {
  return (
    <CurrentSessionPage
      auth={auth}
      data={data}
      actions={currentSessionTestActions}
      internalLinkComponent={TestInternalLink}
      onSaveSuccess={() => window.dispatchEvent(new Event("readmates:route-refresh"))}
    />
  );
}

function getDesktop(container: HTMLElement) {
  const desktop = container.querySelector(".rm-current-session-desktop");

  if (!(desktop instanceof HTMLElement)) {
    throw new Error("Desktop current session board not found");
  }

  return desktop;
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function removedLabel(...parts: string[]) {
  return parts.join("");
}

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

describe("CurrentSession", () => {
  it("loads auth and current session data through the route loader", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = input.toString();

      if (url === "/api/bff/api/auth/me") {
        return Promise.resolve(jsonResponse(routeAuthFixture));
      }

      if (url === "/api/bff/api/sessions/current") {
        return Promise.resolve(jsonResponse(currentSessionData));
      }

      return Promise.resolve(jsonResponse({ message: "unexpected request" }, 404));
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(currentSessionLoader()).resolves.toEqual({
      auth: routeAuthFixture,
      current: currentSessionData,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/bff/api/auth/me",
      expect.objectContaining({ cache: "no-store" }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/bff/api/sessions/current",
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("renders the current session route from loader data", async () => {
    installRouterRequestShim();
    const router = createMemoryRouter(
      [
        {
          path: "/",
          element: <CurrentSessionRoute />,
          loader: () => ({ auth: routeAuthFixture, current: currentSessionData }),
          hydrateFallbackElement: <div>세션을 불러오는 중</div>,
        },
      ],
      { initialEntries: ["/"] },
    );

    render(<RouterProvider router={router} />);

    expect((await screen.findAllByText("테스트 책")).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "참석" }).length).toBeGreaterThan(0);
  });

  it("keeps current session content visible when a route refresh fails", async () => {
    installRouterRequestShim();
    let currentSessionRequests = 0;
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = input.toString();

      if (url === "/api/bff/api/auth/me") {
        return Promise.resolve(jsonResponse(routeAuthFixture));
      }

      if (url === "/api/bff/api/sessions/current") {
        currentSessionRequests += 1;

        if (currentSessionRequests === 1) {
          return Promise.resolve(jsonResponse(currentSessionData));
        }

        return Promise.resolve(jsonResponse({ message: "current session unavailable" }, 500));
      }

      return Promise.resolve(jsonResponse({ message: "unexpected request" }, 404));
    });
    vi.stubGlobal("fetch", fetchMock);
    const router = createMemoryRouter(
      [
        {
          path: "/",
          element: <CurrentSessionRoute />,
          loader: currentSessionLoader,
          errorElement: <div>route error</div>,
          hydrateFallbackElement: <div>세션을 불러오는 중</div>,
        },
      ],
      { initialEntries: ["/"] },
    );

    render(<RouterProvider router={router} />);

    expect((await screen.findAllByText("테스트 책")).length).toBeGreaterThan(0);

    window.dispatchEvent(new Event("readmates:route-refresh"));

    await waitFor(() => {
      expect(currentSessionRequests).toBe(2);
    });
    expect(screen.queryByText("route error")).not.toBeInTheDocument();
    expect(screen.getAllByText("테스트 책").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "참석" }).length).toBeGreaterThan(0);
  });

  it("shows the empty state when there is no current session", () => {
    render(<CurrentSession data={{ currentSession: null }} />);

    expect(screen.getByText("아직 열린 세션이 없습니다")).toBeInTheDocument();
    expect(
      screen.getByText("새 세션이 등록되면 참석 여부, 읽기 진행률, 질문 작성이 열립니다."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/6회차는 종료되었습니다/)).not.toBeInTheDocument();
  });

  it("shows the no-session create action only for hosts", () => {
    const { rerender } = render(<CurrentSession auth={activeMemberAuthFixture} data={{ currentSession: null }} />);

    expect(screen.queryByRole("link", { name: "새 세션 만들기" })).not.toBeInTheDocument();

    rerender(<CurrentSession auth={{ ...activeMemberAuthFixture, role: "HOST" }} data={{ currentSession: null }} />);

    expect(screen.getByRole("link", { name: "새 세션 만들기" })).toHaveAttribute("href", "/app/host/sessions/new");
  });

  it("shows RSVP, check-in, and question sections", () => {
    const { container } = render(<CurrentSession data={currentSessionData} />);
    const desktop = getDesktop(container);

    expect(within(desktop).getAllByText("RSVP").length).toBeGreaterThan(0);
    expect(within(desktop).getByText("참석 여부")).toBeInTheDocument();
    expect(within(desktop).queryByText("읽기 기록")).not.toBeInTheDocument();
    expect(within(desktop).getAllByText("읽기 진행률").length).toBeGreaterThan(0);
    expect(within(desktop).getByText("토론 질문")).toBeInTheDocument();
    expect(within(desktop).getByText("질문 작성")).toBeInTheDocument();
    expect(within(desktop).queryByText("피드백 문서 접근")).not.toBeInTheDocument();
    expect(within(desktop).queryByText("Question")).not.toBeInTheDocument();
    expect(within(desktop).getByText("테스트 책")).toBeInTheDocument();
    expect(within(desktop).getByText(/테스트 저자/)).toBeInTheDocument();
    expect(within(desktop).getByRole("img", { name: "테스트 책 표지" })).toHaveAttribute(
      "src",
      "https://example.com/covers/test-book.jpg",
    );
    expect(within(desktop).getByRole("link", { name: "미팅 입장" })).toHaveAttribute(
      "href",
      "https://meet.google.com/readmates-current",
    );
    expect(within(desktop).getByText("Passcode currentpass")).toBeInTheDocument();
    expect(within(desktop).getByText("참석자 · 1/2")).toBeInTheDocument();
    expect(within(desktop).getAllByText("우").length).toBeGreaterThan(0);
    expect(within(desktop).getAllByText("수").length).toBeGreaterThan(0);
    expect(within(desktop).queryByText("제외")).not.toBeInTheDocument();
    expect(within(desktop).getByDisplayValue("72")).toBeInTheDocument();
    expect(within(desktop).queryByLabelText(removedLabel("체크", "인 메모"))).not.toBeInTheDocument();
    expect(within(desktop).getByRole("textbox", { name: "질문 1 내용" })).toHaveValue("API에서 온 내 질문");
    expect(within(desktop).getByRole("textbox", { name: "질문 2 내용" })).toHaveValue("API에서 온 내 질문 2");
    expect(within(desktop).queryByRole("textbox", { name: "새 질문 내용" })).not.toBeInTheDocument();
    expect(within(desktop).queryByText("초안 생각 · 선택")).not.toBeInTheDocument();
    expect(within(desktop).getByDisplayValue("API에서 온 장문 서평")).toBeInTheDocument();
    expect(within(desktop).queryByRole("textbox", { name: "한줄평 내용" })).not.toBeInTheDocument();
    expect(within(desktop).queryByRole("button", { name: "한줄평 저장" })).not.toBeInTheDocument();
  });

  it("disables personal save actions for suspended members", () => {
    const { container } = render(
      <CurrentSession
        auth={{ membershipStatus: "SUSPENDED", approvalState: "SUSPENDED" }}
        data={currentSessionData}
      />,
    );
    const desktopScope = within(getDesktop(container));

    expect(desktopScope.getByText("멤버십이 일시 정지되어 새 기록을 남길 수 없습니다.")).toBeInTheDocument();
    expect(desktopScope.getByRole("button", { name: "진행률 저장" })).toBeDisabled();
    expect(desktopScope.getByRole("button", { name: "질문 저장" })).toBeDisabled();
    expect(desktopScope.getByRole("button", { name: "서평 저장" })).toBeDisabled();
  });

  it("renders viewer members as read-only on current session", () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    const { container } = render(<CurrentSession auth={viewerAuthFixture} data={currentSessionData} />);
    const desktopScope = within(getDesktop(container));

    expect(desktopScope.getByText("둘러보기 멤버")).toBeVisible();
    expect(desktopScope.getByText("기록은 읽을 수 있고, 새 참여 기록은 정식 멤버만 남길 수 있습니다")).toBeVisible();
    expect(
      desktopScope.getByText(
        "둘러보기 멤버는 RSVP, 읽기 진행률, 질문, 서평을 저장할 수 없습니다. 기존 기록과 공동 보드, 피드백 문서 접근 상태는 읽기 전용으로 확인할 수 있어요.",
      ),
    ).toBeVisible();
    expect(desktopScope.getAllByText("읽기 진행률").length).toBeGreaterThan(0);
    expect(desktopScope.getByText("보존된 질문")).toBeVisible();
    expect(desktopScope.getAllByText("보존된 서평").length).toBeGreaterThan(0);
    expect(desktopScope.getAllByText("피드백 문서 접근").length).toBeGreaterThan(0);
    expect(desktopScope.getAllByText("72%").length).toBeGreaterThan(0);
    expect(desktopScope.getByText("API에서 온 내 질문")).toBeVisible();
    expect(desktopScope.getByText("API에서 온 장문 서평")).toBeVisible();
    expect(desktopScope.queryByRole("button", { name: "참석" })).not.toBeInTheDocument();
    expect(desktopScope.queryByRole("button", { name: "진행률 저장" })).not.toBeInTheDocument();
    expect(desktopScope.queryByRole("button", { name: "질문 저장" })).not.toBeInTheDocument();
    expect(desktopScope.queryByRole("button", { name: "한줄평 저장" })).not.toBeInTheDocument();
    expect(desktopScope.queryByRole("button", { name: "서평 저장" })).not.toBeInTheDocument();
    expect(desktopScope.queryByRole("textbox")).not.toBeInTheDocument();
    expect(desktopScope.queryByRole("slider")).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps host member prep controls without the desktop host context shortcut", () => {
    const { container } = render(
      <CurrentSession auth={{ ...activeMemberAuthFixture, role: "HOST" }} data={currentSessionData} />,
    );
    const desktopScope = within(getDesktop(container));

    expect(desktopScope.getByRole("button", { name: "참석" })).toBeInTheDocument();
    expect(desktopScope.getByRole("button", { name: "진행률 저장" })).toBeInTheDocument();
    expect(desktopScope.queryByText("호스트 맥락")).not.toBeInTheDocument();
    expect(desktopScope.queryByRole("link", { name: "세션 운영으로" })).not.toBeInTheDocument();
  });

  it("mirrors viewer read-only controls on mobile current session", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    render(<CurrentSession auth={viewerAuthFixture} data={currentSessionData} />);

    const mobileScope = within(await screen.findByTestId("current-session-mobile"));

    expect(mobileScope.getByText("둘러보기 멤버")).toBeVisible();
    expect(
      mobileScope.getByText("세션 기록은 읽을 수 있어요. RSVP, 진행률, 질문, 서평 작성은 정식 멤버에게 열립니다."),
    ).toBeVisible();
    expect(mobileScope.getByText("기록은 읽을 수 있고, 새 참여 기록은 정식 멤버만 남길 수 있습니다")).toBeVisible();
    expect(mobileScope.getAllByText("읽기 진행률").length).toBeGreaterThan(0);
    expect(mobileScope.getAllByText("72%").length).toBeGreaterThan(0);
    expect(mobileScope.queryByRole("button", { name: "참석" })).not.toBeInTheDocument();
    expect(mobileScope.queryByRole("button", { name: "진행률 저장" })).not.toBeInTheDocument();
    expect(mobileScope.queryByRole("button", { name: "질문 저장" })).not.toBeInTheDocument();
    expect(mobileScope.queryByRole("textbox")).not.toBeInTheDocument();
    expect(mobileScope.queryByRole("slider")).not.toBeInTheDocument();

    await user.click(mobileScope.getByRole("button", { name: "내 기록" }));

    expect(mobileScope.getByText("내 기록은 읽기 전용입니다")).toBeVisible();
    expect(mobileScope.getByText("API에서 온 한줄평")).toBeVisible();
    expect(mobileScope.getByText("API에서 온 장문 서평")).toBeVisible();
    expect(mobileScope.queryByRole("button", { name: "한줄평 저장" })).not.toBeInTheDocument();
    expect(mobileScope.queryByRole("button", { name: "서평 저장" })).not.toBeInTheDocument();
    expect(mobileScope.queryByRole("textbox")).not.toBeInTheDocument();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("renders mobile session structure on the first render", () => {
    const { container } = render(<CurrentSession data={currentSessionData} />);

    const mobile = screen.getByTestId("current-session-mobile");

    expect(mobile).toBeInTheDocument();
    expect(container.querySelector(".rm-current-session-desktop")).toBeInTheDocument();
    expect(
      within(within(mobile).getByRole("group", { name: "세션 보기" }))
        .getAllByRole("button")
        .map((tab) => tab.textContent),
    ).toEqual(["내 준비", "내 기록", "공동 보드"]);
    expect(within(mobile).getByRole("button", { name: "내 준비" })).toHaveAttribute("aria-pressed", "true");
    expect(within(mobile).getByRole("button", { name: "공동 보드" })).toHaveAttribute("aria-pressed", "false");
    expect(within(mobile).getByRole("button", { name: "내 기록" })).toHaveAttribute("aria-pressed", "false");
    for (const label of ["참석", "아직 미정", "불참"]) {
      expect(within(mobile).getByRole("button", { name: label })).toHaveStyle({
        minHeight: "32px",
        height: "32px",
        padding: "0 14px",
        fontSize: "13px",
        borderColor: "var(--line)",
        background: "transparent",
        color: "var(--text-2)",
      });
    }
    expect(within(mobile).getByRole("textbox", { name: "질문 1 내용" })).toHaveValue("API에서 온 내 질문");
    expect(within(mobile).getByText("참석자 · 1/2")).toBeInTheDocument();
    expect(within(mobile).queryByText("제외")).not.toBeInTheDocument();

    const ids = Array.from(container.querySelectorAll("[id]"), (element) => element.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("matches the standalone current-session design details", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 20, 0, 0, 0));

    const designedData: CurrentSessionResponse = {
      currentSession: {
        ...currentSessionData.currentSession!,
        sessionNumber: 14,
        date: "2026-04-23",
        meetingUrl: "https://meet.google.com/readmates-test",
        meetingPasscode: "currentpass",
      },
    };

    const { container } = render(<CurrentSession data={designedData} />);
    const desktopScope = within(getDesktop(container));

    expect(desktopScope.getByText("No.14 · D-3")).toBeInTheDocument();
    expect(desktopScope.queryByText(/This session/i)).not.toBeInTheDocument();
    expect(desktopScope.getByText("이번 모임에 참석하시나요?")).toHaveClass("h4", "editorial");
    expect(desktopScope.getByText("어디까지 읽으셨어요?")).toHaveClass("h4", "editorial");
    expect(desktopScope.getByText("질문 작성")).toBeInTheDocument();
    expect(desktopScope.queryByText("Question")).not.toBeInTheDocument();
    expect(desktopScope.getByText("이번 달 내 질문")).toHaveClass("h4", "editorial");
    expect(desktopScope.queryByRole("button", { name: /질문 우선순위/ })).not.toBeInTheDocument();
    expect(desktopScope.getByRole("textbox", { name: "질문 1 내용" })).toBeInTheDocument();
    expect(desktopScope.getByRole("link", { name: "미팅 입장" })).toHaveAttribute(
      "href",
      "https://meet.google.com/readmates-test",
    );
    expect(desktopScope.getByText("Passcode currentpass")).toBeInTheDocument();
    expect(desktopScope.getByText("녹음을 원하지 않으면 모임 중 언제든 알려 주세요.")).toBeInTheDocument();
    expect(desktopScope.getByText("음성만 · 자동 정리 참고용")).toBeInTheDocument();
    expect(desktopScope.getAllByTitle("우")[0]).toHaveTextContent("우");
    expect(desktopScope.getAllByTitle("수")[0]).toHaveTextContent("수");
  });

  it("omits the meeting action when no meeting details are registered", () => {
    render(
      <CurrentSession
        data={{
          currentSession: {
            ...currentSessionData.currentSession!,
            meetingUrl: null,
            meetingPasscode: null,
          },
        }}
      />,
    );

    expect(screen.queryByRole("link", { name: "미팅 입장" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Passcode/)).not.toBeInTheDocument();
  });

  it("updates personal form state when a different current session is rendered", () => {
    const nextSessionData: CurrentSessionResponse = {
      currentSession: {
        ...currentSessionData.currentSession!,
        sessionId: "session-8",
        sessionNumber: 8,
        title: "8회차 모임 · 다음 테스트 책",
        bookTitle: "다음 테스트 책",
        myCheckin: {
          readingProgress: 21,
        },
        myQuestions: [
          {
            priority: 1,
            text: "새 세션 질문",
            draftThought: "새 세션 초안",
            authorName: "이멤버5",
            authorShortName: "수",
          },
        ],
        myOneLineReview: {
          text: "새 세션 한줄평",
        },
        myLongReview: {
          body: "새 세션 장문 서평",
        },
      },
    };
    const { container, rerender } = render(<CurrentSession data={currentSessionData} />);
    const desktopScope = () => within(getDesktop(container));

    expect(desktopScope().queryByLabelText(removedLabel("체크", "인 메모"))).not.toBeInTheDocument();

    rerender(<CurrentSession data={nextSessionData} />);

    expect(desktopScope().getByText("다음 테스트 책")).toBeInTheDocument();
    expect(desktopScope().getByDisplayValue("21")).toBeInTheDocument();
    expect(desktopScope().queryByLabelText(removedLabel("체크", "인 메모"))).not.toBeInTheDocument();
    expect(desktopScope().getByText("새 세션 질문")).toBeInTheDocument();
    expect(desktopScope().queryByDisplayValue("새 세션 초안")).not.toBeInTheDocument();
    expect(desktopScope().queryByRole("button", { name: "질문 2 삭제" })).not.toBeInTheDocument();
    expect(desktopScope().getByRole("textbox", { name: "질문 1 내용" })).toHaveValue("새 세션 질문");
    expect(desktopScope().getByRole("textbox", { name: "질문 2 내용" })).toHaveValue("");
    expect(desktopScope().getByDisplayValue("새 세션 장문 서평")).toBeInTheDocument();
    expect(desktopScope().queryByDisplayValue("새 세션 한줄평")).not.toBeInTheDocument();
  });

  it("shows post-session prep, roster, and shared board layers", async () => {
    const user = userEvent.setup();

    const { container } = render(<CurrentSession data={currentSessionData} />);
    const desktopScope = within(getDesktop(container));

    const longReviewHeading = desktopScope.getByText("이 책에 남기고 싶은 글");
    expect(desktopScope.getByText("서평 작성")).toBeInTheDocument();
    expect(desktopScope.queryByText("이 책을 한 문장으로")).not.toBeInTheDocument();
    expect(longReviewHeading).toBeInTheDocument();
    expect(desktopScope.getByText("참석자 · 1/2")).toBeInTheDocument();
    expect(desktopScope.getByText("단계 02")).toBeInTheDocument();
    expect(desktopScope.getByText("공동 보드 · 다른 멤버의 기록")).toBeInTheDocument();
    expect(desktopScope.getByRole("button", { name: /질문 · 1/ })).toBeInTheDocument();
    expect(desktopScope.queryByText(removedLabel("읽기 ", "흔적"))).not.toBeInTheDocument();
    expect(desktopScope.getByRole("button", { name: /서평 · 1/ })).toBeInTheDocument();
    expect(desktopScope.queryByRole("button", { name: /한줄평/ })).not.toBeInTheDocument();
    expect(desktopScope.queryByRole("button", { name: /하이라이트/ })).not.toBeInTheDocument();
    expect(desktopScope.getByText("API에서 온 질문")).toBeInTheDocument();
    expect(desktopScope.queryByText(/분류는 세계를 이해하기 위한 도구일까요/)).not.toBeInTheDocument();

    await user.click(desktopScope.getByRole("button", { name: /서평 · 1/ }));
    expect(desktopScope.getByText("API에서 온 공동 서평")).toBeInTheDocument();
  });

  it("moves the shared board tabs with keyboard arrow keys", async () => {
    const user = userEvent.setup();
    const { container } = render(<CurrentSession data={currentSessionData} />);
    const desktopScope = within(getDesktop(container));

    const questionTab = desktopScope.getByRole("button", { name: /질문 · 1/ });
    questionTab.focus();
    expect(questionTab).toHaveFocus();

    await user.keyboard("{ArrowRight}");

    expect(desktopScope.getByRole("button", { name: /서평 · 1/ })).toHaveAttribute("aria-pressed", "true");
    expect(desktopScope.getByRole("button", { name: /서평 · 1/ })).toHaveFocus();
    expect(desktopScope.getByText("API에서 온 공동 서평")).toBeInTheDocument();

    await user.keyboard("{End}");

    expect(desktopScope.getByRole("button", { name: /서평 · 1/ })).toHaveAttribute("aria-pressed", "true");
    expect(desktopScope.getByText("API에서 온 공동 서평")).toBeInTheDocument();
  });

  it("splits the mobile member session into prep, shared board, and records segments", async () => {
    const user = userEvent.setup();

    render(<CurrentSession data={currentSessionData} />);

    const mobile = await screen.findByTestId("current-session-mobile");
    const mobileScope = within(mobile);

    expect(mobileScope.getByRole("button", { name: "내 준비" })).toHaveAttribute("aria-pressed", "true");
    expect(mobileScope.getByRole("button", { name: "공동 보드" })).toHaveAttribute("aria-pressed", "false");
    expect(mobileScope.getByRole("button", { name: "내 기록" })).toHaveAttribute("aria-pressed", "false");
    expect(mobileScope.getByRole("button", { name: "진행률 저장" })).toBeInTheDocument();
    expect(mobileScope.queryByLabelText(removedLabel("체크", "인 메모"))).not.toBeInTheDocument();
    expect(mobileScope.getByRole("button", { name: "질문 저장" })).toBeInTheDocument();
    expect(mobileScope.queryByRole("textbox", { name: "서평 내용" })).not.toBeInTheDocument();

    await user.click(mobileScope.getByRole("button", { name: "공동 보드" }));

    expect(mobileScope.getByRole("button", { name: "공동 보드" })).toHaveAttribute("aria-pressed", "true");
    expect(mobileScope.getAllByText("1개")).toHaveLength(2);
    expect(mobileScope.getByText("API에서 온 질문")).toBeInTheDocument();
    expect(mobileScope.queryByText(removedLabel("읽기 ", "흔적"))).not.toBeInTheDocument();
    expect(mobileScope.getByText("API에서 온 공동 서평")).toBeVisible();
    expect(mobileScope.queryByText("API에서 온 공동 한줄평")).not.toBeInTheDocument();
    expect(mobileScope.queryByText("API에서 온 하이라이트")).not.toBeInTheDocument();
    expect(mobileScope.queryByRole("button", { name: "질문 저장" })).not.toBeInTheDocument();

    await user.click(mobileScope.getByRole("button", { name: "내 기록" }));

    expect(mobileScope.getByRole("button", { name: "내 기록" })).toHaveAttribute("aria-pressed", "true");
    expect(mobileScope.getByRole("textbox", { name: "서평 내용" })).toHaveValue("API에서 온 장문 서평");
    expect(mobileScope.queryByRole("textbox", { name: "한줄평 내용" })).not.toBeInTheDocument();
    expect(mobileScope.queryByRole("button", { name: "한줄평 저장" })).not.toBeInTheDocument();
    expect(mobileScope.queryByText("API에서 온 공동 한줄평")).not.toBeInTheDocument();
  });

  it("moves the mobile session segments with keyboard arrow keys", async () => {
    const user = userEvent.setup();

    render(<CurrentSession data={currentSessionData} />);

    const mobileScope = within(await screen.findByTestId("current-session-mobile"));
    const prepTab = mobileScope.getByRole("button", { name: "내 준비" });

    prepTab.focus();
    expect(prepTab).toHaveFocus();

    await user.keyboard("{ArrowRight}");

    expect(mobileScope.getByRole("button", { name: "내 기록" })).toHaveAttribute("aria-pressed", "true");
    expect(mobileScope.getByRole("button", { name: "내 기록" })).toHaveFocus();
    expect(mobileScope.getByRole("textbox", { name: "서평 내용" })).toHaveValue("API에서 온 장문 서평");

    await user.keyboard("{End}");

    expect(mobileScope.getByRole("button", { name: "공동 보드" })).toHaveAttribute("aria-pressed", "true");
    expect(mobileScope.getByText("API에서 온 질문")).toBeInTheDocument();
  });

  it("preserves mobile save actions and feedback across session segments", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    render(<CurrentSession data={currentSessionData} />);

    const mobileScope = within(await screen.findByTestId("current-session-mobile"));

    await user.click(mobileScope.getByRole("button", { name: "진행률 저장" }));
    expect(await mobileScope.findByText("진행률 저장됨")).toBeInTheDocument();

    await user.click(mobileScope.getByRole("button", { name: "질문 저장" }));
    expect(await mobileScope.findByText("질문 저장됨")).toBeInTheDocument();

    await user.click(mobileScope.getByRole("button", { name: "내 기록" }));
    await user.click(mobileScope.getByRole("button", { name: "서평 저장" }));
    expect(await mobileScope.findByText("서평 저장됨")).toBeInTheDocument();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/bff/api/sessions/current/checkin",
      expect.objectContaining({
        body: JSON.stringify({ readingProgress: 72 }),
        method: "PUT",
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/bff/api/sessions/current/questions",
      expect.objectContaining({
        body: JSON.stringify({
          questions: [
            { priority: 1, text: "API에서 온 내 질문" },
            { priority: 2, text: "API에서 온 내 질문 2" },
          ],
        }),
        method: "PUT",
      }),
    );
  });

  it("shows an empty state for empty shared board tabs", async () => {
    const user = userEvent.setup();
    const emptyBoardData: CurrentSessionResponse = {
      currentSession: {
        ...currentSessionData.currentSession!,
        board: {
          questions: [],
          longReviews: [],
        },
      },
    };

    render(<CurrentSession data={emptyBoardData} />);

    expect(screen.getByRole("button", { name: /질문 · 0/ })).toBeInTheDocument();
    expect(screen.getByText("아직 공유된 기록이 없습니다.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /서평 · 0/ }));
    expect(screen.getByText("아직 공유된 기록이 없습니다.")).toBeInTheDocument();
  });

  it("does not request a route refresh for pure shared board tab changes", async () => {
    const user = userEvent.setup();
    const refreshMock = vi.fn();
    window.addEventListener("readmates:route-refresh", refreshMock);

    const { container } = render(<CurrentSession data={currentSessionData} />);
    const desktopScope = within(getDesktop(container));
    const mobileScope = within(await screen.findByTestId("current-session-mobile"));

    await user.click(desktopScope.getByRole("button", { name: /서평 · 1/ }));
    await user.click(mobileScope.getByRole("button", { name: "공동 보드" }));

    expect(refreshMock).not.toHaveBeenCalled();
    window.removeEventListener("readmates:route-refresh", refreshMock);
  });

  it("provides distinct accessible names for personal prep controls", () => {
    const { container } = render(<CurrentSession data={currentSessionData} />);
    const desktopScope = within(getDesktop(container));

    expect(desktopScope.getByRole("slider", { name: "읽기 진행률" })).toBeInTheDocument();
    expect(desktopScope.queryByRole("textbox", { name: removedLabel("체크", "인 메모") })).not.toBeInTheDocument();
    expect(desktopScope.getByRole("textbox", { name: "질문 1 내용" })).toBeInTheDocument();
    expect(desktopScope.getByRole("textbox", { name: "질문 2 내용" })).toBeInTheDocument();
    expect(desktopScope.queryByRole("textbox", { name: /초안 생각/ })).not.toBeInTheDocument();
    expect(desktopScope.getByRole("textbox", { name: "서평 내용" })).toBeInTheDocument();
    expect(desktopScope.queryByRole("textbox", { name: "한줄평 내용" })).not.toBeInTheDocument();
    expect(desktopScope.getByRole("button", { name: "진행률 저장" })).toBeInTheDocument();
    expect(desktopScope.getByRole("button", { name: "질문 저장" })).toBeInTheDocument();
    expect(desktopScope.getByRole("button", { name: "서평 저장" })).toBeInTheDocument();
    expect(desktopScope.queryByRole("button", { name: "한줄평 저장" })).not.toBeInTheDocument();
  });

  it("edits question rows inline and adds blank rows", async () => {
    const user = userEvent.setup();
    const dataWithMultipleQuestions: CurrentSessionResponse = {
      currentSession: {
        ...currentSessionData.currentSession!,
        myQuestions: [
          {
            priority: 1,
            text: "Q1 저장 질문",
            draftThought: "Q1 저장 초안",
            authorName: "이멤버5",
            authorShortName: "수",
          },
          {
            priority: 2,
            text: "Q2 저장 질문",
            draftThought: "Q2 저장 초안",
            authorName: "이멤버5",
            authorShortName: "수",
          },
        ],
      },
    };

    const { container } = render(<CurrentSession data={dataWithMultipleQuestions} />);
    const desktopScope = within(getDesktop(container));

    expect(desktopScope.getByRole("textbox", { name: "질문 1 내용" })).toHaveValue("Q1 저장 질문");
    expect(desktopScope.getByRole("textbox", { name: "질문 2 내용" })).toHaveValue("Q2 저장 질문");
    expect(desktopScope.queryByRole("textbox", { name: /초안 생각/ })).not.toBeInTheDocument();

    await user.click(desktopScope.getByRole("button", { name: /질문 추가/ }));

    expect(desktopScope.getByRole("textbox", { name: "질문 3 내용" })).toHaveValue("");
    expect(desktopScope.getByRole("button", { name: "질문 3 삭제" })).toBeInTheDocument();

    await user.type(desktopScope.getByRole("textbox", { name: "질문 3 내용" }), "Q3 새 질문");
    await user.clear(desktopScope.getByRole("textbox", { name: "질문 1 내용" }));
    await user.type(desktopScope.getByRole("textbox", { name: "질문 1 내용" }), "Q1 수정 질문");

    expect(desktopScope.getByRole("textbox", { name: "질문 1 내용" })).toHaveValue("Q1 수정 질문");
    expect(desktopScope.getByRole("textbox", { name: "질문 3 내용" })).toHaveValue("Q3 새 질문");

    await user.click(desktopScope.getByRole("button", { name: "질문 3 삭제" }));

    expect(desktopScope.queryByRole("textbox", { name: "질문 3 내용" })).not.toBeInTheDocument();
    expect(desktopScope.getByRole("textbox", { name: "질문 1 내용" })).toHaveValue("Q1 수정 질문");
    expect(desktopScope.getByRole("textbox", { name: "질문 2 내용" })).toHaveValue("Q2 저장 질문");
  });

  it("limits question inputs to five", async () => {
    const user = userEvent.setup();
    const { container } = render(<CurrentSession data={currentSessionData} />);
    const desktopScope = within(getDesktop(container));

    for (const questionNumber of [3, 4, 5]) {
      await user.click(desktopScope.getByRole("button", { name: /질문 추가/ }));
      await user.type(desktopScope.getByRole("textbox", { name: `질문 ${questionNumber} 내용` }), `추가 질문 ${questionNumber}`);
    }

    expect(desktopScope.getByRole("textbox", { name: "질문 5 내용" })).toHaveValue("추가 질문 5");
    expect(desktopScope.queryByRole("button", { name: /질문 추가/ })).not.toBeInTheDocument();
    expect(desktopScope.getByText("최대 5개까지 작성했어요")).toBeInTheDocument();
  });

  it("saves question edits with one or zero non-empty questions", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const { container } = render(<CurrentSession data={currentSessionData} />);
    const desktopScope = within(getDesktop(container));

    await user.clear(desktopScope.getByRole("textbox", { name: "질문 2 내용" }));
    await user.click(desktopScope.getByRole("button", { name: "질문 저장" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/bff/api/sessions/current/questions",
        expect.objectContaining({
          body: JSON.stringify({ questions: [{ priority: 1, text: "API에서 온 내 질문" }] }),
          method: "PUT",
        }),
      );
    });

    await user.clear(desktopScope.getByRole("textbox", { name: "질문 1 내용" }));
    await user.click(desktopScope.getByRole("button", { name: "질문 저장" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/bff/api/sessions/current/questions",
        expect.objectContaining({
          body: JSON.stringify({ questions: [] }),
          method: "PUT",
        }),
      );
    });
  });

  it("keeps a question in the second slot when only question two is filled", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const { container } = render(<CurrentSession data={currentSessionData} />);
    const desktopScope = within(getDesktop(container));

    await user.clear(desktopScope.getByRole("textbox", { name: "질문 1 내용" }));
    await user.click(desktopScope.getByRole("button", { name: "질문 저장" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/bff/api/sessions/current/questions",
        expect.objectContaining({
          body: JSON.stringify({ questions: [{ priority: 2, text: "API에서 온 내 질문 2" }] }),
          method: "PUT",
        }),
      );
    });
  });

  it("shows inline save feedback for checkin, question, and reviews", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    const { container } = render(<CurrentSession data={currentSessionData} />);
    const desktopScope = within(getDesktop(container));

    await user.click(desktopScope.getByRole("button", { name: "참석" }));
    expect(await desktopScope.findByText("RSVP 저장됨")).toBeInTheDocument();

    await user.click(desktopScope.getByRole("button", { name: "진행률 저장" }));
    expect(await desktopScope.findByText("진행률 저장됨")).toBeInTheDocument();

    await user.click(desktopScope.getByRole("button", { name: "질문 저장" }));
    expect(await desktopScope.findByText("질문 저장됨")).toBeInTheDocument();

    await user.click(desktopScope.getByRole("button", { name: "서평 저장" }));
    expect(await desktopScope.findByText("서평 저장됨")).toBeInTheDocument();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/bff/api/sessions/current/rsvp",
      expect.objectContaining({
        body: JSON.stringify({ status: "GOING" }),
        method: "PATCH",
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/bff/api/sessions/current/reviews",
      expect.objectContaining({
        body: JSON.stringify({ body: "API에서 온 장문 서평" }),
        method: "POST",
      }),
    );
  });

  it("saves an empty long review", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    const { container } = render(<CurrentSession data={currentSessionData} />);
    const desktopScope = within(getDesktop(container));

    await user.clear(desktopScope.getByRole("textbox", { name: "서평 내용" }));
    await user.click(desktopScope.getByRole("button", { name: "서평 저장" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/bff/api/sessions/current/reviews",
        expect.objectContaining({
          body: JSON.stringify({ body: "" }),
          method: "POST",
        }),
      );
    });
    expect(await desktopScope.findByText("서평 저장됨")).toBeInTheDocument();
  });

  it("uses specific pending feedback while saving prep changes", async () => {
    const user = userEvent.setup();
    const checkinSave = deferred<Response>();
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(checkinSave.promise));

    const { container } = render(<CurrentSession data={currentSessionData} />);
    const desktopScope = within(getDesktop(container));

    await user.click(desktopScope.getByRole("button", { name: "진행률 저장" }));

    expect(await desktopScope.findByText("진행률 변경사항을 저장하는 중")).toBeInTheDocument();
    expect(desktopScope.getByRole("button", { name: "진행률 저장" })).toBeDisabled();

    checkinSave.resolve(new Response(null, { status: 204 }));

    expect(await desktopScope.findByText("진행률 저장됨")).toBeInTheDocument();
  });

  it("restores the previous RSVP state when saving RSVP fails", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({ ok: false });
    const refreshMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    window.addEventListener("readmates:route-refresh", refreshMock);

    const { container } = render(<CurrentSession data={currentSessionData} />);
    const desktopScope = within(getDesktop(container));

    expect(desktopScope.getByText("현재 상태: 미응답")).toBeInTheDocument();

    await user.click(desktopScope.getByRole("button", { name: "참석" }));

    expect(await desktopScope.findByText("RSVP 저장 실패 · 다시 시도해 주세요")).toBeInTheDocument();
    expect(desktopScope.getByText("현재 상태: 미응답")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/bff/api/sessions/current/rsvp",
      expect.objectContaining({
        body: JSON.stringify({ status: "GOING" }),
        method: "PATCH",
      }),
    );
    expect(refreshMock).not.toHaveBeenCalled();
    window.removeEventListener("readmates:route-refresh", refreshMock);
  });

  it("refreshes the shared board data after saving prep items", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    const refreshMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    window.addEventListener("readmates:route-refresh", refreshMock);

    const { container } = render(<CurrentSession data={currentSessionData} />);
    const desktopScope = within(getDesktop(container));

    await user.click(desktopScope.getByRole("button", { name: "진행률 저장" }));
    await desktopScope.findByText("진행률 저장됨");

    await user.click(desktopScope.getByRole("button", { name: "질문 저장" }));
    await desktopScope.findByText("질문 저장됨");

    expect(refreshMock).toHaveBeenCalledTimes(2);
    window.removeEventListener("readmates:route-refresh", refreshMock);
  });
});
