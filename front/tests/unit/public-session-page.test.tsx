import { cleanup, render, screen, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import PublicSession from "@/features/public/ui/public-session";
import type { PublicSessionDetailResponse } from "@/features/public/api/public-contracts";
import PublicSessionPage from "@/src/pages/public-session";
import { publicSessionLoader } from "@/features/public/route/public-route-data";
import { PublicRouteError } from "@/features/public/route/public-route-state";

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

function renderPublicSessionRoute(sessionId: string, state?: Record<string, string>) {
  installRouterRequestShim();
  const router = createMemoryRouter(
    [
      {
        path: "/sessions/:sessionId",
        element: <PublicSessionPage />,
        loader: publicSessionLoader,
        errorElement: <PublicRouteError />,
        hydrateFallbackElement: <div>공개 세션 기록을 불러오는 중</div>,
      },
    ],
    { initialEntries: [state ? { pathname: `/sessions/${sessionId}`, state } : `/sessions/${sessionId}`] },
  );

  render(<RouterProvider router={router} />);
}

describe("PublicSessionPage", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("loads public session detail through the browser BFF", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            sessionId: "00000000-0000-0000-0000-000000000301",
            sessionNumber: 1,
            bookTitle: "팩트풀니스",
            bookAuthor: "한스 로슬링",
            bookImageUrl: "https://image.example.com/factfulness.jpg",
            date: "2025-11-26",
            summary: "데이터로 세상을 더 정확하게 보는 태도를 이야기했습니다.",
            highlights: [],
            oneLiners: [],
          } satisfies PublicSessionDetailResponse),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          },
        ),
      ),
    );

    renderPublicSessionRoute("00000000-0000-0000-0000-000000000301");

    expect(await screen.findByRole("img", { name: "팩트풀니스 표지" })).toBeInTheDocument();
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/bff/api/public/sessions/00000000-0000-0000-0000-000000000301",
      expect.any(Object),
    );
  });

  it("uses public records as the direct-link return target and accepts source route state", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            sessionId: "session-1",
            sessionNumber: 1,
            bookTitle: "팩트풀니스",
            bookAuthor: "한스 로슬링",
            bookImageUrl: null,
            date: "2025-11-26",
            summary: "데이터로 세상을 더 정확하게 보는 태도를 이야기했습니다.",
            highlights: [],
            oneLiners: [],
          } satisfies PublicSessionDetailResponse),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      ),
    );

    renderPublicSessionRoute("session-1", {
      readmatesReturnTo: "/records",
      readmatesReturnLabel: "공개 기록",
    });

    expect(await screen.findByRole("link", { name: "← 공개 기록" })).toHaveAttribute("href", "/records");
    expect(screen.getByRole("link", { name: "공개 기록 →" })).toHaveAttribute("href", "/records");
  });

  it("renders a missing state for missing public sessions", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 404 })));

    renderPublicSessionRoute("missing-session");

    expect(await screen.findByRole("heading", { name: "공개 기록을 찾을 수 없습니다." })).toBeInTheDocument();
  });

  it("renders the shared error state for non-404 public session API errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("upstream unavailable", { status: 503 })));

    renderPublicSessionRoute("service-error");

    expect(await screen.findByRole("heading", { name: "페이지를 불러오지 못했습니다." })).toBeInTheDocument();
  });
});

describe("PublicSession", () => {
  it("renders the registered book cover image without private meeting details", () => {
    const session: PublicSessionDetailResponse = {
      sessionId: "00000000-0000-0000-0000-000000000301",
      sessionNumber: 1,
      bookTitle: "팩트풀니스",
      bookAuthor: "한스 로슬링",
      bookImageUrl: "https://image.aladin.co.kr/product/34538/43/cover500/8934933879_1.jpg",
      date: "2025-11-26",
      summary: "데이터로 세상을 더 정확하게 보는 태도를 이야기했습니다.",
      highlights: ["세계를 오해하게 만드는 본능을 점검했습니다."],
      oneLiners: [
        {
          authorName: "김호스트",
          authorShortName: "우",
          text: "낙관이 아니라 정확함의 문제였다.",
        },
      ],
    };

    const { container } = render(<PublicSession session={session} />);

    expect(screen.getByRole("img", { name: "팩트풀니스 표지" })).toHaveAttribute(
      "src",
      "https://image.aladin.co.kr/product/34538/43/cover500/8934933879_1.jpg",
    );
    expect(screen.getByText("함께 읽기")).toBeInTheDocument();
    expect(screen.getByText("요약")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "회차 기록" })).toBeInTheDocument();
    expect(screen.getByText("회차 하이라이트")).toBeInTheDocument();
    expect(screen.getByText("함께 남긴 한줄평")).toBeInTheDocument();
    expect(screen.getByText("회차 하이라이트 · 1")).toBeInTheDocument();
    expect(screen.getByText("함께 남긴 한줄평 · 1")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "모임에서 남은 문장" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "짧게 남긴 감상" })).toBeInTheDocument();
    expect(container.querySelector(".public-note-highlight-row")).not.toBeNull();
    const highlightRow = screen.getByText("세계를 오해하게 만드는 본능을 점검했습니다.").closest(".public-note-highlight-row");
    expect(highlightRow).not.toBeNull();
    expect(within(highlightRow as HTMLElement).getByText("읽는사이")).toBeInTheDocument();
    expect(within(highlightRow as HTMLElement).getByLabelText("읽는사이")).toHaveTextContent("읽");
    expect(container.querySelector(".public-note-oneliner-card")).not.toBeNull();
    expect(container).not.toHaveTextContent("H01");
    expect(container).not.toHaveTextContent("R01");
    expect(container).not.toHaveTextContent("발행 요약");
    expect(container).not.toHaveTextContent("공개된 세션 기록");
    expect(screen.getByRole("link", { name: "기존 멤버 로그인" })).toHaveAttribute("href", "/login");
    const inviteCta = screen.getByRole("button", { name: /초대 수락하기/ });
    expect(inviteCta).toBeDisabled();
    expect(inviteCta).toHaveAttribute("aria-disabled", "true");
    expect(inviteCta).toHaveTextContent("초대 메일의 개인 링크에서만 열립니다.");
    expect(screen.queryByRole("link", { name: /초대 수락하기/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "공개 기록 →" })).toHaveAttribute("href", "/records");
    expect(screen.getByText("김호스트")).toBeInTheDocument();
    expect(screen.getByText("김")).toBeInTheDocument();
    expect(screen.queryByText("우")).not.toBeInTheDocument();
    expect(container).not.toHaveTextContent("readmates");
    expect(container).not.toHaveTextContent("meet.google.com");
  });
});
