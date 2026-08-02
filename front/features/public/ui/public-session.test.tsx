import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import PublicSession from "./public-session";

describe("PublicSession showcase", () => {
  it("renders showcase labels without private surfaces", () => {
    const { container } = render(
      <PublicSession
        session={{
          sessionId: "s1",
          sessionNumber: 7,
          bookTitle: "E2E 책",
          bookAuthor: "저자",
          bookImageUrl: null,
          date: "2026-06-18",
          summary: "공개 요약",
          highlights: [
            { text: "문장", sortOrder: 1, authorName: "김독자", authorShortName: "김", avatarKey: "banana-green-book" },
          ],
          oneLiners: [
            { authorName: "김회원", authorShortName: "김", avatarKey: "cloud-green-book", text: "한줄평" },
            { authorName: "김기록", authorShortName: "김", avatarKey: "cloud-green-book", text: "또 다른 한줄평" },
          ],
        }}
      />,
    );

    expect(screen.getByText("기록 준비됨")).toBeVisible();
    expect(screen.getByText("하이라이트 1 · 한줄평 2")).toBeVisible();
    expect(container.querySelector(".public-session-record__identity h1")).toHaveClass("editorial");
    expect(container.querySelector(".public-session-record__identity h1")).not.toHaveClass("reading-editorial");
    expect(container.querySelector(".public-session-summary-text")).toHaveClass("editorial");
    expect(container.querySelector(".public-session-summary-text")).not.toHaveClass("reading-editorial");
    expect(container.querySelector(".public-note-highlight-row__quote")).toHaveClass("editorial");
    expect(container.querySelector(".public-note-highlight-row__quote")).not.toHaveClass("reading-editorial");
    expect(container.querySelector(".public-note-oneliner-card__quote")).toHaveClass("editorial");
    expect(container.querySelector(".public-note-oneliner-card__quote")).not.toHaveClass("reading-editorial");
    expect(screen.getByRole("heading", { name: "회차 기록" })).not.toHaveClass("reading-editorial");
    expect(screen.queryByText(/피드백 문서/)).toBeNull();
    expect(screen.queryByText("ADMIN_ROUTE")).toBeNull();
  });

  it("distinguishes same-surname public authors with their stored avatar keys", () => {
    const { container } = render(
      <PublicSession
        session={{
          sessionId: "s1",
          sessionNumber: 7,
          bookTitle: "E2E 책",
          bookAuthor: "저자",
          bookImageUrl: null,
          date: "2026-06-18",
          summary: "공개 요약",
          highlights: [
            { text: "문장", sortOrder: 1, authorName: "김독자", authorShortName: "김", avatarKey: "banana-green-book" },
          ],
          oneLiners: [
            { authorName: "김회원", authorShortName: "김", avatarKey: "cloud-green-book", text: "한줄평" },
            { authorName: "김기록", authorShortName: "김", avatarKey: "cloud-green-book", text: "또 다른 한줄평" },
          ],
        }}
      />,
    );

    expect(screen.getByText("김독자")).toBeVisible();
    expect(screen.getByText("김회원")).toBeVisible();
    expect(screen.getByText("김기록")).toBeVisible();
    expect([...container.querySelectorAll(".rm-avatar-chip img")].map((image) => image.getAttribute("src"))).toEqual([
      "/assets/avatars/book-club/banana-green-book.webp",
      "/assets/avatars/book-club/cloud-green-book.webp",
      "/assets/avatars/book-club/cloud-green-book.webp",
    ]);
  });
});
