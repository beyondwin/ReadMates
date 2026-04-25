import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import PublicRecordsPage from "@/src/pages/public-records";
import { publicClubLoader } from "@/features/public/route/public-route-data";
import { PublicRouteError } from "@/features/public/route/public-route-state";

const PUBLIC_RECORDS_SCROLL_KEY = "readmates:public-records-scroll";

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

function renderRecordsRoute() {
  installRouterRequestShim();
  const router = createMemoryRouter(
    [
      {
        path: "/records",
        element: <PublicRecordsPage />,
        loader: publicClubLoader,
        errorElement: <PublicRouteError />,
        hydrateFallbackElement: <div>공개 기록을 불러오는 중</div>,
      },
      { path: "/sessions/:sessionId", element: <LocationStateEcho /> },
      { path: "/about", element: <main>about target</main> },
    ],
    { initialEntries: ["/records"] },
  );

  render(<RouterProvider router={router} />);
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.sessionStorage.clear();
  Object.defineProperty(window, "scrollY", { configurable: true, value: 0 });
});

describe("PublicRecordsPage", () => {
  it("renders a browsable public record index before detail navigation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            clubName: "읽는사이",
            tagline: "함께 읽고 남기는 공개 기록",
            about: "한 달에 한 권을 읽고 서로의 생각 사이에 머무르는 독서 모임입니다.",
            stats: {
              sessions: 8,
              books: 8,
              members: 6,
            },
            recentSessions: [
              {
                sessionId: "session-6",
                sessionNumber: 6,
                bookTitle: "가난한 찰리의 연감",
                bookAuthor: "찰리 멍거",
                bookImageUrl: "https://image.example.com/charlie.jpg",
                date: "2026-04-15",
                summary: "찰리 멍거의 투자 원칙과 다학문적 사고를 함께 다뤘습니다.",
                highlightCount: 3,
                oneLinerCount: 5,
              },
            ],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      ),
    );

    renderRecordsRoute();

    expect(await screen.findByRole("heading", { name: "공개 기록" })).toBeInTheDocument();
    expect(screen.getByText("기록 모음")).toBeInTheDocument();
    expect(screen.queryByText("읽는사이")).not.toBeInTheDocument();
    expect(screen.queryByText("읽는사이 · 공개 기록")).not.toBeInTheDocument();
    expect(screen.getByText("최근 발행한 책과 대화의 흔적을 모았습니다.")).toBeInTheDocument();
    expect(screen.getByText("공개 기록은 누구나 읽을 수 있고, 모임 참여는 초대받은 멤버에게만 열려 있습니다.")).toBeInTheDocument();
    expect(screen.queryByText("session target")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "발행된 기록" })).toBeInTheDocument();
    expect(screen.getByText("총 8개")).toBeInTheDocument();
    expect(screen.queryByText("최근 1개 공개 기록")).not.toBeInTheDocument();
    expect(screen.queryByText("전체 공개 모임 8회 중 공개된 최근 기록")).not.toBeInTheDocument();
    expect(screen.queryByText("총 1개의 공개 기록")).not.toBeInTheDocument();
    const recordLink = screen.getByRole("link", { name: /가난한 찰리의 연감/ });
    expect(recordLink).toHaveAttribute("href", "/sessions/session-6");
    expect(screen.getByText("하이라이트 3")).toBeInTheDocument();
    expect(screen.getByText("한줄평 5")).toBeInTheDocument();
    expect(recordLink.textContent).toMatch(/No\.6·2026\.04\.15하이라이트 3·한줄평 5/);
    expect(recordLink.textContent).toMatch(/찰리 멍거\s*찰리 멍거의 투자 원칙/);
  });

  it("passes a public records return target and does not preserve list scroll before opening detail", async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, "scrollY", { configurable: true, value: 480 });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            clubName: "읽는사이",
            tagline: "함께 읽고 남기는 공개 기록",
            about: "한 달에 한 권을 읽습니다.",
            stats: { sessions: 1, books: 1, members: 6 },
            recentSessions: [
              {
                sessionId: "session 6/slash",
                sessionNumber: 6,
                bookTitle: "가난한 찰리의 연감",
                bookAuthor: "찰리 멍거",
                bookImageUrl: null,
                date: "2026-04-15",
                summary: "공개 요약",
                highlightCount: 3,
                oneLinerCount: 5,
              },
            ],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      ),
    );

    renderRecordsRoute();

    const link = await screen.findByRole("link", { name: /가난한 찰리의 연감/ });
    expect(link).toHaveAttribute("href", "/sessions/session%206%2Fslash");

    await user.click(link);

    expect(screen.getByTestId("return-to")).toHaveTextContent("/records");
    expect(screen.getByTestId("return-label")).toHaveTextContent("공개 기록");
    expect(window.sessionStorage.getItem(PUBLIC_RECORDS_SCROLL_KEY)).toBeNull();
  });

  it("renders an intentional empty public archive state when there are no published sessions", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({
          clubName: "읽는사이",
          tagline: "공개 기록",
          about: " ",
          stats: {
            sessions: 0,
            books: 0,
            members: 0,
          },
          recentSessions: [],
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    renderRecordsRoute();

    expect(await screen.findByText("아직 발행된 공개 기록이 없습니다")).toBeInTheDocument();
    expect(screen.queryByText("about target")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "클럽 소개 보기" })).toHaveAttribute("href", "/about");
  });
});
