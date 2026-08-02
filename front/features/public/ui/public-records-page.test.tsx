import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import PublicRecordsPage from "./public-records-page";

describe("PublicRecordsPage showcase", () => {
  it("renders record density labels without private surfaces", () => {
    const { container } = render(
      <PublicRecordsPage
        routePathname="/records"
        routeSearch=""
        data={{
          clubName: "읽는사이",
          tagline: "함께 읽기",
          about: "공개 소개",
          stats: { sessions: 1, books: 1, members: 3 },
          recentSessions: [
            {
              sessionId: "s1",
              sessionNumber: 7,
              bookTitle: "E2E 책",
              bookAuthor: "저자",
              bookImageUrl: null,
              date: "2026-06-18",
              summary: "공개 요약",
              highlightCount: 3,
              oneLinerCount: 2,
            },
          ],
        }}
      />,
    );

    expect(screen.queryByText("기록 준비됨")).toBeNull();
    expect(screen.queryByText("요약 중심 기록")).toBeNull();
    expect(screen.getByText("하이라이트 3 · 한줄평 2")).toBeVisible();
    expect(container.querySelector(".public-record-index-row__title")).toHaveClass("editorial");
    expect(container.querySelector(".public-record-index-row__title")).not.toHaveClass("reading-editorial");
    expect(container.querySelector(".public-record-index-row__summary")).toHaveClass("body");
    expect(container.querySelector(".public-record-index-row__summary")).not.toHaveClass("reading-editorial");
    expect(screen.getByRole("heading", { name: "공개 기록" })).not.toHaveClass("reading-editorial");
    expect(screen.getByRole("heading", { name: "발행된 기록" })).not.toHaveClass("reading-editorial");
    expect(screen.queryByText(/피드백 문서/)).toBeNull();
    expect(screen.queryByText("ADMIN_ROUTE")).toBeNull();
  });

  it("offers scoped guest browsing and explicit member start", () => {
    render(
      <PublicRecordsPage
        data={{ clubName: "읽는사이", tagline: "", about: "", stats: { sessions: 0, books: 0, members: 0 }, recentSessions: [] }}
        publicBasePath="/clubs/reading-sai"
        routePathname="/clubs/reading-sai/records"
        routeSearch=""
      />,
    );

    expect(screen.getByRole("link", { name: "둘러보기" })).toHaveAttribute("href", "/clubs/reading-sai/app");
    expect(screen.getByRole("link", { name: "멤버로 시작" })).toHaveAttribute(
      "href",
      "/login?returnTo=%2Fclubs%2Freading-sai%2Fapp",
    );
  });
});
