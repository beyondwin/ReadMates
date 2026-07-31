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

    expect(screen.getByText("기록 준비됨")).toBeVisible();
    expect(screen.getByText("하이라이트 3 · 한줄평 2")).toBeVisible();
    expect(container.querySelector(".public-record-index-row__title")).toHaveClass("reading-editorial");
    expect(container.querySelector(".public-record-index-row__summary")).toHaveClass("reading-editorial");
    expect(screen.getByRole("heading", { name: "공개 기록" })).not.toHaveClass("reading-editorial");
    expect(screen.getByRole("heading", { name: "발행된 기록" })).not.toHaveClass("reading-editorial");
    expect(screen.queryByText(/피드백 문서/)).toBeNull();
    expect(screen.queryByText("ADMIN_ROUTE")).toBeNull();
  });
});
