import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import PublicHome from "@/features/public/ui/public-home";
import type { PublicClubResponse } from "@/features/public/api/public-contracts";

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

    expect(screen.getByRole("heading", { name: "읽는사이", level: 1 })).toBeInTheDocument();
    expect(container).toHaveTextContent("읽는사이");
    expect(screen.getByText("함께 읽고 남기는 공개 기록")).toBeInTheDocument();
    expect(container).toHaveTextContent("한 달에 한 권을 읽고 서로의 생각 사이에 머무르는 독서 모임입니다.");
    expect(container).not.toHaveTextContent("읽는사이 · 공개 기록");
    expect(container).not.toHaveTextContent("공개 소개가 아직 준비되지 않았습니다.");
    expect(screen.getAllByText("가난한 찰리의 연감").length).toBeGreaterThan(0);
    const latestCoverImages = screen.getAllByRole("img", { name: "가난한 찰리의 연감 표지" });
    expect(latestCoverImages).toHaveLength(1);
    expect(latestCoverImages[0]).toHaveAttribute(
      "src",
      "https://image.aladin.co.kr/product/35068/81/cover500/8934911387_1.jpg",
    );
    expect(
      container.querySelectorAll('a.public-latest-record[href="/sessions/00000000-0000-0000-0000-000000000306"]'),
    ).toHaveLength(1);
    expect(container.querySelectorAll('a[href="/sessions/00000000-0000-0000-0000-000000000306"]')).toHaveLength(1);
    expect(screen.getByText("공개 기록은 색인으로 이어집니다")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "공개 기록 색인 보기" })).toHaveAttribute("href", "/records");
    expect(container.querySelector(".public-note-list")).not.toHaveTextContent("가난한 찰리의 연감");
    expect(container.querySelector(".public-note-list")).toHaveTextContent("지대넓얕 무한");
    expect(container.querySelector(".public-record-list")).not.toHaveTextContent("가난한 찰리의 연감");
    expect(container.querySelector(".public-record-list")).toHaveTextContent("지대넓얕 무한");
    expect(screen.getAllByText("공개 요약").length).toBeGreaterThan(0);
    expect(screen.getAllByText("하이라이트 3").length).toBeGreaterThan(0);
    expect(screen.getAllByText("한줄평 5").length).toBeGreaterThan(0);
    expect(screen.getByText("공개 기록은 열려 있고, 참여는 초대제로 운영합니다")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "기존 멤버 로그인" })).toHaveAttribute("href", "/login");
    const inviteCta = screen.getByRole("button", { name: /초대 수락하기/ });
    expect(inviteCta).toBeDisabled();
    expect(inviteCta).toHaveAttribute("aria-disabled", "true");
    expect(inviteCta).toHaveTextContent("초대 메일의 개인 링크에서만 열립니다.");
    expect(screen.queryByRole("link", { name: /초대 수락하기/ })).not.toBeInTheDocument();
    expect(container.querySelector('a[href="/login"]')).toHaveTextContent("기존 멤버 로그인");
    expect(container.querySelector('a[href="/login"]')).not.toHaveTextContent("초대 수락하기");
    expect(screen.getByRole("link", { name: "최근 공개 기록" })).toHaveAttribute(
      "href",
      "/records",
    );
    expect(container.innerHTML).not.toContain("물고기는 존재하지 않는다");
    expect(container.innerHTML).not.toContain("session-13");
  });

  it("encodes public session links containing spaces and slashes", () => {
    const { container } = render(
      <PublicHome
        data={{
          ...publicClubFixture,
          recentSessions: [
            {
              ...publicClubFixture.recentSessions[0],
              sessionId: "session 6/slash",
            },
            {
              ...publicClubFixture.recentSessions[1],
              sessionId: "session 5/slash",
            },
          ],
        }}
      />,
    );
    const hrefs = Array.from(container.querySelectorAll("a")).map((link) => link.getAttribute("href"));

    expect(screen.getByRole("link", { name: "최근 공개 기록 가난한 찰리의 연감 보기" })).toHaveAttribute(
      "href",
      "/sessions/session%206%2Fslash",
    );
    expect(hrefs).toContain("/sessions/session%205%2Fslash");
    expect(hrefs).not.toContain("/sessions/session 6/slash");
  });

  it("keeps the mobile hero peek before the latest-record feature in source order", () => {
    const { container } = render(<PublicHome data={publicClubFixture} />);

    const heroGrid = container.querySelector(".public-home-hero__grid");
    expect(heroGrid).toBeTruthy();
    expect(Array.from(heroGrid!.children).map((child) => child.className)).toEqual([
      "public-home-hero__copy",
      "public-home-hero__peek",
      "public-home-hero__latest",
    ]);
    expect(within(heroGrid as HTMLElement).getByLabelText("다음 섹션 미리보기")).toHaveTextContent(
      "최근 기록과 클럽의 읽는 방식",
    );
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

    expect(screen.getAllByText(/아직 발행된 공개 기록이 없습니다/).length).toBeGreaterThanOrEqual(1);
    expect(container).toHaveTextContent("공개 소개가 아직 준비되지 않았습니다.");
    expect(container).toHaveTextContent("0공개 모임");
    expect(screen.getByRole("link", { name: "클럽 소개 보기" })).toHaveAttribute("href", "/about");
    expect(container.innerHTML).not.toContain("물고기는 존재하지 않는다");
    expect(container.innerHTML).not.toContain("session-13");
  });
});
