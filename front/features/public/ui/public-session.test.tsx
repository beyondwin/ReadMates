import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import PublicSession from "./public-session";

describe("PublicSession showcase", () => {
  it("renders showcase labels without private surfaces", () => {
    render(
      <PublicSession
        session={{
          sessionId: "s1",
          sessionNumber: 7,
          bookTitle: "E2E 책",
          bookAuthor: "저자",
          bookImageUrl: null,
          date: "2026-06-18",
          summary: "공개 요약",
          highlights: [{ text: "문장", sortOrder: 1, authorName: "독자A", authorShortName: "A" }],
          oneLiners: [{ authorName: "독자B", authorShortName: "B", text: "한줄평" }],
        }}
      />,
    );

    expect(screen.getByText("기록 준비됨")).toBeVisible();
    expect(screen.getByText("하이라이트 1 · 한줄평 1")).toBeVisible();
    expect(screen.queryByText(/피드백 문서/)).toBeNull();
    expect(screen.queryByText("ADMIN_ROUTE")).toBeNull();
  });
});
