import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import PublicHome from "@/features/public/ui/public-home";
import type { PublicClubResponse } from "@/features/public/api/public-contracts";

afterEach(cleanup);

const publicClubFixture: PublicClubResponse = {
  clubName: "읽는사이",
  tagline: "함께 읽고 각자의 언어로 남기는 독서모임",
  about: "초대받은 멤버들이 매달 한 권의 책을 읽고, 질문과 감상과 대화를 조용히 쌓아갑니다.",
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
    expect(screen.getByText("작게 읽고 깊게 나누는 모임")).toBeInTheDocument();
    expect(container).toHaveTextContent("읽는사이");
    expect(screen.getByText("함께 읽고 각자의 언어로 남기는 독서모임")).toBeInTheDocument();
    expect(container).toHaveTextContent("초대받은 멤버들이 매달 한 권의 책을 읽고, 질문과 감상과 대화를 조용히 쌓아갑니다.");
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
    expect(container.querySelectorAll('a[href="/sessions/00000000-0000-0000-0000-000000000306"]')).toHaveLength(3);
    expect(screen.getByText("공개한 모임 기록을 모았습니다")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "공개 기록 보기" })).toHaveAttribute("href", "/records");
    const noteList = container.querySelector(".public-note-list") as HTMLElement;
    expect(noteList).toHaveTextContent("가난한 찰리의 연감");
    expect(noteList).toHaveTextContent("지대넓얕 무한");
    expect(noteList).not.toHaveTextContent("No.6");
    expect(noteList.querySelectorAll(".public-note-row__cover img")).toHaveLength(2);
    expect(container.querySelector(".public-record-list")).toHaveTextContent("가난한 찰리의 연감");
    expect(container.querySelector(".public-record-list")).not.toHaveTextContent("No.6");
    expect(container.querySelectorAll(".public-record-list .public-archive-row__cover img")).toHaveLength(2);
    expect(container.querySelector(".public-record-list")).toHaveTextContent("지대넓얕 무한");
    expect(screen.getAllByText("공개 요약").length).toBeGreaterThan(0);
    expect(screen.getAllByText("하이라이트 3").length).toBeGreaterThan(0);
    expect(screen.getAllByText("한줄평 5").length).toBeGreaterThan(0);
    expect(screen.getByText("함께 읽는 자리")).toBeInTheDocument();
    expect(screen.getByText("공개 기록은 누구나 읽고, 함께 읽는 자리는 초대받은 멤버와 이어갑니다")).toBeInTheDocument();
    expect(screen.getByText("함께 읽기")).toBeInTheDocument();
    expect(screen.getByText("기록은 누구나 읽고, 참여는 초대받은 멤버가 합니다")).toBeInTheDocument();
    expect(screen.getByText("읽는사이는 초대 기반 모임입니다. 기록은 누구나 읽을 수 있고, 참여 권한은 초대 수락 또는 호스트 승인 뒤 열립니다.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "시작하기" })).toHaveAttribute("href", "/login");
    expect(screen.queryByRole("button", { name: /초대 수락하기/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /초대 수락하기/ })).not.toBeInTheDocument();
    expect(container.querySelector('a[href="/login"]')).toHaveTextContent("시작하기");
    expect(container.querySelector('a[href="/login"]')).not.toHaveTextContent("초대 수락하기");
    expect(screen.getByText("기록 모음")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "공개 기록", level: 2 })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "전체 보기" })).toHaveAttribute(
      "href",
      "/records",
    );
    expect(container.innerHTML).not.toContain("물고기는 존재하지 않는다");
    expect(container.innerHTML).not.toContain("session-13");
  });

  it("limits the home public note and record lists to the latest three sessions", () => {
    const sessions = [6, 5, 4, 3].map((sessionNumber) => ({
      ...publicClubFixture.recentSessions[0],
      sessionId: `session-${sessionNumber}`,
      sessionNumber,
      bookTitle: `Book ${sessionNumber}`,
      bookImageUrl: `https://example.com/book-${sessionNumber}.jpg`,
    }));

    const { container } = render(<PublicHome data={{ ...publicClubFixture, recentSessions: sessions }} />);

    const recordList = container.querySelector(".public-record-list") as HTMLElement;
    const noteList = container.querySelector(".public-note-list") as HTMLElement;
    const recordScope = within(recordList);
    const noteScope = within(noteList);

    expect(recordScope.getAllByRole("link")).toHaveLength(3);
    expect(recordScope.getByText("Book 6")).toBeInTheDocument();
    expect(recordScope.getByText("Book 5")).toBeInTheDocument();
    expect(recordScope.getByText("Book 4")).toBeInTheDocument();
    expect(recordScope.queryByText("Book 3")).not.toBeInTheDocument();
    expect(recordList).not.toHaveTextContent("No.6");
    expect(recordList.querySelectorAll(".public-archive-row__cover img")).toHaveLength(3);
    expect(noteScope.getAllByRole("link")).toHaveLength(3);
    expect(noteScope.getByText("Book 6 · 찰리 멍거")).toBeInTheDocument();
    expect(noteScope.getByText("Book 5 · 찰리 멍거")).toBeInTheDocument();
    expect(noteScope.getByText("Book 4 · 찰리 멍거")).toBeInTheDocument();
    expect(noteScope.queryByText("Book 3 · 찰리 멍거")).not.toBeInTheDocument();
    expect(noteList).not.toHaveTextContent("No.6");
    expect(noteList.querySelectorAll(".public-note-row__cover img")).toHaveLength(3);
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
