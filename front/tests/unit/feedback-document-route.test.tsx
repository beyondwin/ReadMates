import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import FeedbackDocumentRoutePage from "@/src/pages/feedback-document";
import FeedbackDocumentPrintRoutePage from "@/src/pages/feedback-print";
import { feedbackDocumentLoader } from "@/features/feedback/route/feedback-document-data";
import { FeedbackRouteError } from "@/features/feedback/route/feedback-route-state";

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

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const activeAuth = {
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
};

function setupBffStatus(status: number) {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = input.toString();

      if (url === "/api/bff/api/auth/me") {
        return Promise.resolve(
          new Response(JSON.stringify(activeAuth), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }

      return Promise.resolve(new Response("", { status }));
    }),
  );
}

function setupBffJson(body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = input.toString();

      return Promise.resolve(
        new Response(JSON.stringify(url === "/api/bff/api/auth/me" ? activeAuth : body), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }),
  );
}

function setupBffAuth(body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = input.toString();

      if (url === "/api/bff/api/auth/me") {
        return Promise.resolve(
          new Response(JSON.stringify(body), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }

      return Promise.resolve(new Response(JSON.stringify({ message: "unexpected request" }), { status: 404 }));
    }),
  );
}

function renderFeedbackRoute(
  path: string | { pathname: string; state?: unknown },
  printMode = false,
) {
  installRouterRequestShim();
  const router = createMemoryRouter(
    [
      {
        path: "/app/feedback/:sessionId",
        element: printMode ? <FeedbackDocumentPrintRoutePage /> : <FeedbackDocumentRoutePage />,
        loader: feedbackDocumentLoader,
        errorElement: <FeedbackRouteError />,
        hydrateFallbackElement: <div>피드백 문서를 불러오는 중</div>,
      },
      {
        path: "/app/feedback/:sessionId/print",
        element: <FeedbackDocumentPrintRoutePage />,
        loader: feedbackDocumentLoader,
        errorElement: <FeedbackRouteError />,
        hydrateFallbackElement: <div>피드백 문서를 불러오는 중</div>,
      },
      { path: "/login", element: <main><h1>읽는사이 함께하기</h1></main> },
    ],
    { initialEntries: [path] },
  );

  render(<RouterProvider router={router} />);
}

function LocationStateEcho() {
  const location = useLocation();
  const state = location.state as { readmatesReturnTo?: string; readmatesReturnLabel?: string } | null;

  return (
    <main>
      <div data-testid="return-to">{state?.readmatesReturnTo ?? ""}</div>
      <div data-testid="return-label">{state?.readmatesReturnLabel ?? ""}</div>
    </main>
  );
}

function renderFeedbackReturnFlow(path: string | { pathname: string; state?: unknown }) {
  installRouterRequestShim();
  const router = createMemoryRouter(
    [
      {
        path: "/app/feedback/:sessionId",
        element: <FeedbackDocumentRoutePage />,
        loader: feedbackDocumentLoader,
        errorElement: <FeedbackRouteError />,
        hydrateFallbackElement: <div>피드백 문서를 불러오는 중</div>,
      },
      { path: "/app/sessions/:sessionId", element: <LocationStateEcho /> },
    ],
    { initialEntries: [path] },
  );

  render(<RouterProvider router={router} />);
}

describe("Feedback document routes", () => {
  it("redirects anonymous users before fetching feedback document data", async () => {
    setupBffAuth({
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
    });

    renderFeedbackRoute("/app/feedback/session-1");

    expect(await screen.findByRole("heading", { name: "읽는사이 함께하기" })).toBeInTheDocument();
    expect(globalThis.fetch).not.toHaveBeenCalledWith(
      "/api/bff/api/sessions/session-1/feedback-document",
      expect.anything(),
    );
  });

  it("renders access denied for inactive users before fetching feedback document data", async () => {
    setupBffAuth({
      authenticated: true,
      userId: "inactive-user",
      membershipId: "inactive-membership",
      clubId: "club-id",
      email: "inactive@example.com",
      displayName: "비활성 멤버",
      accountName: "비활성",
      role: "MEMBER",
      membershipStatus: "INACTIVE",
      approvalState: "INACTIVE",
    });

    renderFeedbackRoute("/app/feedback/session-1");

    expect(
      await screen.findByRole("heading", { name: "피드백 문서는 정식 멤버와 참석자에게만 열립니다." }),
    ).toBeInTheDocument();
    expect(globalThis.fetch).not.toHaveBeenCalledWith(
      "/api/bff/api/sessions/session-1/feedback-document",
      expect.anything(),
    );
  });

  it("renders access denied when the BFF rejects feedback document access", async () => {
    setupBffStatus(403);

    renderFeedbackRoute("/app/feedback/00000000-0000-0000-0000-000000000301");

    expect(
      await screen.findByRole("heading", { name: "피드백 문서는 정식 멤버와 참석자에게만 열립니다." }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("둘러보기 멤버는 세션 기록을 읽을 수 있지만, 회차 피드백 문서는 볼 수 없습니다."),
    ).toBeInTheDocument();
  });

  it("renders a quiet unavailable state when the feedback document is missing", async () => {
    setupBffStatus(404);

    renderFeedbackRoute("/app/feedback/missing-session");

    expect(await screen.findByRole("heading", { name: "아직 열람 가능한 피드백 문서가 없습니다." })).toBeInTheDocument();
    expect(screen.getByText("호스트가 피드백 문서를 등록하면 이 화면에서 확인할 수 있습니다.")).toBeInTheDocument();
  });

  it("renders the shared error state for unexpected BFF errors", async () => {
    setupBffStatus(500);

    renderFeedbackRoute("/app/feedback/service-error");

    expect(await screen.findByRole("heading", { name: "페이지를 불러오지 못했습니다." })).toBeInTheDocument();
  });

  it("renders print-route access errors without calling print", async () => {
    const printMock = vi.fn();
    setupBffStatus(403);
    vi.stubGlobal("print", printMock);

    renderFeedbackRoute("/app/feedback/00000000-0000-0000-0000-000000000301/print");

    expect(
      await screen.findByRole("heading", { name: "피드백 문서는 정식 멤버와 참석자에게만 열립니다." }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("둘러보기 멤버는 세션 기록을 읽을 수 있지만, 회차 피드백 문서는 볼 수 없습니다."),
    ).toBeInTheDocument();
    expect(printMock).not.toHaveBeenCalled();
  });

  it("does not open the browser print dialog while document downloads are disabled", async () => {
    const printMock = vi.fn();
    setupBffJson({
      sessionId: "session-1",
      sessionNumber: 1,
      title: "독서모임 1차 피드백",
      subtitle: "팩트풀니스 · 2025.11.26",
      bookTitle: "팩트풀니스",
      date: "2025-11-26",
      fileName: "251126 1차.md",
      uploadedAt: "2026-04-20T09:00:00Z",
      metadata: [],
      observerNotes: [],
      participants: [],
    });
    vi.stubGlobal("print", printMock);

    renderFeedbackRoute("/app/feedback/session-1/print");

    expect(await screen.findByRole("heading", { name: "독서모임 1차 피드백" })).toBeInTheDocument();
    expect(printMock).not.toHaveBeenCalled();
  });

  it("omits the my page return copy on the feedback document route", async () => {
    setupBffJson({
      sessionId: "session-1",
      sessionNumber: 1,
      title: "독서모임 1차 피드백",
      subtitle: "팩트풀니스 · 2025.11.26",
      bookTitle: "팩트풀니스",
      date: "2025-11-26",
      fileName: "251126 1차.md",
      uploadedAt: "2026-04-20T09:00:00Z",
      metadata: [],
      observerNotes: [],
      participants: [],
    });

    renderFeedbackRoute({
      pathname: "/app/feedback/session-1",
      state: {
        readmatesReturnTo: "/app/me",
        readmatesReturnLabel: "내 공간으로 돌아가기",
      },
    });

    expect(await screen.findByRole("heading", { name: "독서모임 1차 피드백" })).toBeInTheDocument();
    expect(screen.queryByText("내 공간으로 돌아가기")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "PDF로 저장" })).not.toBeInTheDocument();
  });

  it("returns to session detail with the session detail archive return state intact", async () => {
    const user = userEvent.setup();
    setupBffJson({
      sessionId: "session-1",
      sessionNumber: 1,
      title: "독서모임 1차 피드백",
      subtitle: "팩트풀니스 · 2025.11.26",
      bookTitle: "팩트풀니스",
      date: "2025-11-26",
      fileName: "251126 1차.md",
      uploadedAt: "2026-04-20T09:00:00Z",
      metadata: [],
      observerNotes: [],
      participants: [],
    });

    renderFeedbackReturnFlow({
      pathname: "/app/feedback/session-1",
      state: {
        readmatesReturnTo: "/app/sessions/session-1#feedback",
        readmatesReturnLabel: "세션으로 돌아가기",
        readmatesReturnState: {
          readmatesReturnTo: "/app/archive?view=reviews",
          readmatesReturnLabel: "아카이브로",
        },
      },
    });

    expect(await screen.findByRole("heading", { name: "독서모임 1차 피드백" })).toBeInTheDocument();
    const returnLink = screen.getByRole("link", { name: "세션으로 돌아가기" });
    expect(returnLink).toHaveAttribute("href", "/app/sessions/session-1#feedback");
    expect(returnLink).toHaveTextContent("← 세션");

    await user.click(returnLink);

    expect(screen.getByTestId("return-to")).toHaveTextContent("/app/archive?view=reviews");
    expect(screen.getByTestId("return-label")).toHaveTextContent("아카이브로");
  });
});
