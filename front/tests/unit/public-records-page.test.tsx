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

    expect(await screen.findByRole("heading", { name: "최근 공개 기록 색인" })).toBeInTheDocument();
    expect(screen.queryByText("session target")).not.toBeInTheDocument();
    expect(screen.getByText("최근 1개 공개 기록")).toBeInTheDocument();
    expect(screen.getByText("전체 공개 모임 8회 중 공개된 최근 기록")).toBeInTheDocument();
    expect(screen.queryByText("총 1개의 공개 기록")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /가난한 찰리의 연감/ })).toHaveAttribute("href", "/sessions/session-6");
    expect(screen.getByText("하이라이트 3")).toBeInTheDocument();
    expect(screen.getByText("한줄평 5")).toBeInTheDocument();
  });

  it("passes a public records return target and remembers list scroll before opening detail", async () => {
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
    expect(screen.getByTestId("return-label")).toHaveTextContent("공개 기록 색인");
    expect(JSON.parse(window.sessionStorage.getItem(PUBLIC_RECORDS_SCROLL_KEY) ?? "{}")).toEqual({
      pathname: "/records",
      search: "",
      scrollY: 480,
    });
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
