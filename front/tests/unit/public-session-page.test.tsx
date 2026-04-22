import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import PublicSession from "@/features/public/components/public-session";
import type { PublicSessionDetailResponse } from "@/shared/api/readmates";
import PublicSessionPage from "@/src/pages/public-session";

function renderPublicSessionRoute(sessionId: string) {
  render(
    <MemoryRouter initialEntries={[`/sessions/${sessionId}`]}>
      <Routes>
        <Route path="/sessions/:sessionId" element={<PublicSessionPage />} />
      </Routes>
    </MemoryRouter>,
  );
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
    expect(screen.getByRole("link", { name: "로그인 / 초대 수락" })).toHaveAttribute("href", "/login");
    expect(screen.getByText("김호스트")).toBeInTheDocument();
    expect(screen.getByText("김")).toBeInTheDocument();
    expect(screen.queryByText("우")).not.toBeInTheDocument();
    expect(container).not.toHaveTextContent("readmates");
    expect(container).not.toHaveTextContent("meet.google.com");
  });
});
