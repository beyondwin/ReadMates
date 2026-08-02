import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import MemberSessionRoutePage from "./member-session";

const query = vi.hoisted(() => ({
  useQuery: vi.fn(),
  guestArchiveDetailQuery: vi.fn((clubSlug: string, sessionId: string) => ({
    queryKey: ["guest-browse", clubSlug, "archive-detail", sessionId],
  })),
}));
const route = vi.hoisted(() => ({ MemberSessionDetailRoute: vi.fn(() => null) }));

vi.mock("@tanstack/react-query", () => ({ useQuery: query.useQuery }));
vi.mock("react-router-dom", () => ({
  useParams: () => ({ clubSlug: "reader-club", sessionId: "closed-session" }),
}));
vi.mock("@/features/guest-browse/queries/guest-browse-queries", () => ({
  guestArchiveDetailQuery: query.guestArchiveDetailQuery,
}));
vi.mock("@/features/archive/route/member-session-detail-route", () => route);

describe("MemberSessionRoutePage", () => {
  it("composes every CLOSED guest-readable public long review into the protected detail route", () => {
    query.useQuery.mockReturnValue({
      data: {
        sessionId: "closed-session",
        sessionNumber: 7,
        title: "지난 모임",
        bookTitle: "기록 책",
        bookAuthor: "기록 작가",
        bookImageUrl: null,
        date: "2026-07-01",
        attendance: 4,
        total: 5,
        state: "CLOSED",
        summary: "공개 요약",
        highlights: [],
        questions: [],
        oneLiners: [],
        longReviews: Array.from({ length: 61 }, (_, index) => ({
          title: `공개 서평 ${index + 1}`,
          content: `페이지 없는 공개 서평 ${index + 1}`,
          authorName: `공개 작성자 ${index + 1}`,
          authorShortName: `작성자 ${index + 1}`,
          avatarKey: "book",
        })),
      },
    });

    render(<MemberSessionRoutePage />);

    expect(query.guestArchiveDetailQuery).toHaveBeenCalledWith("reader-club", "closed-session");
    const publicLongReviews = route.MemberSessionDetailRoute.mock.calls.at(-1)?.[0]?.publicLongReviews;
    expect(publicLongReviews).toHaveLength(61);
    expect(publicLongReviews.at(-1)).toMatchObject({ body: "페이지 없는 공개 서평 61" });
  });
});
