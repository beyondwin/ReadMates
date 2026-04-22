import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import PublicHome from "@/features/public/components/public-home";
import type { PublicClubResponse } from "@/shared/api/readmates";

afterEach(cleanup);

const publicClubFixture: PublicClubResponse = {
  clubName: "읽는사이",
  tagline: "함께 읽고 남기는 공개 기록",
  about: "한 달에 한 권을 읽고 서로의 생각 사이에 머무르는 독서 모임입니다.",
  stats: {
    sessions: 6,
    books: 6,
    members: 6,
  },
  recentSessions: [
    {
      sessionId: "00000000-0000-0000-0000-000000000306",
      sessionNumber: 6,
      bookTitle: "가난한 찰리의 연감",
      bookAuthor: "찰리 멍거",
      bookImageUrl: "https://image.aladin.co.kr/product/35068/81/cover500/8934911387_1.jpg",
      date: "2026-04-15",
      summary: "찰리 멍거의 투자 원칙과 다학문적 사고를 함께 다뤘습니다.",
      highlightCount: 3,
      oneLinerCount: 5,
    },
    {
      sessionId: "00000000-0000-0000-0000-000000000305",
      sessionNumber: 5,
      bookTitle: "지대넓얕 무한",
      bookAuthor: "채사장",
      bookImageUrl: "https://image.aladin.co.kr/product/35301/70/cover500/k692035972_1.jpg",
      date: "2026-03-18",
      summary: "의식, 신념, 선택, 후회처럼 추상적인 주제를 각자의 언어로 붙잡아 보았습니다.",
      highlightCount: 2,
      oneLinerCount: 4,
    },
  ],
};

describe("PublicHome", () => {
  it("renders public club API data without design sample session links", () => {
    const { container } = render(<PublicHome data={publicClubFixture} />);

    expect(screen.getByText("책을 읽고,")).toBeInTheDocument();
    expect(container).toHaveTextContent("읽는사이");
    expect(screen.getAllByText("읽는사이 · 함께 읽고 남기는 공개 기록").length).toBeGreaterThanOrEqual(2);
    expect(container).toHaveTextContent("한 달에 한 권을 읽고 서로의 생각 사이에 머무르는 독서 모임입니다.");
    expect(container).not.toHaveTextContent("읽는사이 · 공개 기록");
    expect(container).not.toHaveTextContent("공개 소개가 아직 준비되지 않았습니다.");
    expect(screen.getAllByText("가난한 찰리의 연감").length).toBeGreaterThan(0);
    const latestCoverImages = screen.getAllByRole("img", { name: "가난한 찰리의 연감 표지" });
    expect(latestCoverImages.length).toBeGreaterThanOrEqual(2);
    expect(latestCoverImages[0]).toHaveAttribute(
      "src",
      "https://image.aladin.co.kr/product/35068/81/cover500/8934911387_1.jpg",
    );
    expect(latestCoverImages[1]).toHaveAttribute(
      "src",
      "https://image.aladin.co.kr/product/35068/81/cover500/8934911387_1.jpg",
    );
    expect(container.querySelector('a[href="/sessions/00000000-0000-0000-0000-000000000306"]')).toBeTruthy();
    expect(screen.getAllByText("공개 요약").length).toBeGreaterThan(0);
    expect(screen.getAllByText("하이라이트 3").length).toBeGreaterThan(0);
    expect(screen.getAllByText("한줄평 5").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "전체 공개 기록" })).toHaveAttribute(
      "href",
      "/sessions/00000000-0000-0000-0000-000000000306",
    );
    expect(screen.getByText("→")).toBeInTheDocument();
    expect(container.innerHTML).not.toContain("물고기는 존재하지 않는다");
    expect(container.innerHTML).not.toContain("session-13");
  });

  it("renders an empty public record state without design sample records", () => {
    const emptyPublicClub: PublicClubResponse = {
      ...publicClubFixture,
      stats: {
        sessions: 0,
        books: 0,
        members: 0,
      },
      about: " ",
      recentSessions: [],
    };

    const { container } = render(<PublicHome data={emptyPublicClub} />);

    expect(screen.getAllByText(/아직 공개된 기록이 없습니다/).length).toBeGreaterThanOrEqual(1);
    expect(container).toHaveTextContent("공개 소개가 아직 준비되지 않았습니다.");
    expect(container).toHaveTextContent("0 기록");
    expect(container.querySelector('a[href="/about"]')).toHaveTextContent("클럽 소개 보기");
    expect(container.innerHTML).not.toContain("물고기는 존재하지 않는다");
    expect(container.innerHTML).not.toContain("session-13");
  });
});
