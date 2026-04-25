import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import PublicClub from "@/features/public/ui/public-club";
import type { PublicClubResponse } from "@/features/public/api/public-contracts";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const publicClubFixture: PublicClubResponse = {
  clubName: "읽는사이",
  tagline: "함께 읽고 각자의 언어로 남기는 독서모임",
  about: "초대받은 멤버들이 매달 한 권의 책을 읽고, 질문과 감상과 대화를 조용히 쌓아갑니다.",
  stats: {
    sessions: 6,
    books: 6,
    members: 9,
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
  ],
};

describe("PublicClub", () => {
  it("renders API about and tagline, dynamic member count, and static operational introduction", () => {
    const { container } = render(<PublicClub data={publicClubFixture} />);

    expect(screen.getByText("작게 읽고 깊게 나누는 모임")).toBeInTheDocument();
    expect(screen.getByText("함께 읽고 각자의 언어로 남기는 독서모임")).toBeInTheDocument();
    expect(container).toHaveTextContent("초대받은 멤버들이 매달 한 권의 책을 읽고, 질문과 감상과 대화를 조용히 쌓아갑니다.");
    expect(container).not.toHaveTextContent("읽는사이 · 함께 읽고 각자의 언어로 남기는 독서모임");
    expect(container).not.toHaveTextContent(
      "한 권의 책이 사람을 완전히 바꾼다고 믿지 않습니다. 그러나 책을 통해 지나가는 생각의 결이 천천히 변화를 만든다고 믿습니다.",
    );
    expect(container).not.toHaveTextContent("공개 소개가 아직 준비되지 않았습니다.");

    const overview = screen.getByLabelText("클럽 운영 정보");
    expect(within(overview).getByText("시작")).toBeInTheDocument();
    expect(within(overview).getByText("2024.11")).toBeInTheDocument();
    expect(within(overview).getByText("운영 리듬")).toBeInTheDocument();
    expect(within(overview).getByText("호스트가 공지하는 날 · 20:00 – 22:00")).toBeInTheDocument();
    expect(within(overview).getByText("현재 멤버")).toBeInTheDocument();
    expect(within(overview).getByText("9명 · 초대 기반")).toBeInTheDocument();
    expect(within(overview).getByText("호스트")).toBeInTheDocument();
    expect(within(overview).getByText("김호스트 · 2025.11~")).toBeInTheDocument();
    expect(within(overview).getByText("기록 방식")).toBeInTheDocument();
    expect(within(overview).getByText("음성 기록 · AI 피드백 참고용")).toBeInTheDocument();

    expect(screen.getByRole("heading", { name: "함께 읽고, 선명하게 기록합니다" })).toBeInTheDocument();
    expect(screen.getByText("모임의 약속")).toBeInTheDocument();
    expect(screen.getByText("참여, 피드백 문서, 개인 노트는 정식 멤버 공간에만 남깁니다.")).toBeInTheDocument();
    expect(screen.getByText("호스트 안내")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "우리가 대화를 여는 방식" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "읽는사이는 각자의 질문에서 대화를 시작하는 모임입니다. 함께 나누고 싶은 질문을 2개 이상 남겨 주세요. 우리는 각자가 남긴 질문을 꺼내 놓고, 서로의 해석이 어디서 달라지는지 천천히 살핍니다. 하나의 결론에 서둘러 닿기보다, 읽고 난 뒤의 생각이 서로에게 이어지는 시간을 중요하게 여깁니다.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("김호스트")).toBeInTheDocument();
    expect(screen.getByLabelText("김호스트")).toBeInTheDocument();
    expect(screen.getByText("호스트 · 2025.11~")).toBeInTheDocument();
    expect(screen.getByText("함께 읽기")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "기록은 누구나 읽고, 참여는 초대받은 멤버가 합니다" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "시작하기" })).toHaveAttribute("href", "/login");
    expect(screen.getByRole("link", { name: "전체 보기" })).toHaveAttribute("href", "/records");
    expect(screen.queryByText("멤버십")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "정식 멤버만 참여할 수 있습니다" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /초대 수락하기/ })).not.toBeInTheDocument();
    expect(screen.queryByText("초대받은 독자는 호스트가 보낸 초대 링크에서 수락 절차를 시작합니다.")).not.toBeInTheDocument();
    expect(container).not.toHaveTextContent("Sessions");
    expect(container).not.toHaveTextContent("Books");
    expect(container).not.toHaveTextContent("Latest");
  });

  it("encodes public club session links containing spaces and slashes", () => {
    render(
      <PublicClub
        data={{
          ...publicClubFixture,
          recentSessions: [
            {
              ...publicClubFixture.recentSessions[0],
              sessionId: "session 6/slash",
            },
          ],
        }}
      />,
    );

    expect(screen.getAllByRole("link", { name: /가난한 찰리의 연감/ }).at(-1)).toHaveAttribute(
      "href",
      "/sessions/session%206%2Fslash",
    );
  });

  it("shows only the latest three public records with book thumbnails in the about list", () => {
    const sessions = [6, 5, 4, 3].map((sessionNumber) => ({
      ...publicClubFixture.recentSessions[0],
      sessionId: `session-${sessionNumber}`,
      sessionNumber,
      bookTitle: `Book ${sessionNumber}`,
      bookImageUrl: `https://example.com/book-${sessionNumber}.jpg`,
    }));

    render(<PublicClub data={{ ...publicClubFixture, recentSessions: sessions }} />);

    const recordList = document.querySelector(".public-record-list") as HTMLElement;
    const scoped = within(recordList);

    expect(scoped.getAllByRole("link")).toHaveLength(3);
    expect(scoped.getByText("Book 6")).toBeInTheDocument();
    expect(scoped.getByText("Book 5")).toBeInTheDocument();
    expect(scoped.getByText("Book 4")).toBeInTheDocument();
    expect(scoped.queryByText("Book 3")).not.toBeInTheDocument();
    expect(recordList).not.toHaveTextContent("No.6");
    expect(recordList.querySelectorAll(".public-archive-row__cover img")).toHaveLength(3);
  });

  it("renders a neutral public introduction fallback when API about is blank", () => {
    const { container } = render(<PublicClub data={{ ...publicClubFixture, about: "   " }} />);

    expect(container).toHaveTextContent("공개 소개가 아직 준비되지 않았습니다.");
    expect(container).not.toHaveTextContent(
      "한 권의 책이 사람을 완전히 바꾼다고 믿지 않습니다. 그러나 책을 통해 지나가는 생각의 결이 천천히 변화를 만든다고 믿습니다.",
    );
  });

  it("hides the login invitation action for authenticated members", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ authenticated: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        ),
      ),
    );

    render(<PublicClub data={publicClubFixture} />);

    await waitFor(() => {
      expect(screen.queryByRole("link", { name: "로그인" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /초대 수락하기/ })).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: /초대 수락하기/ })).not.toBeInTheDocument();
    });
    expect(screen.getByRole("link", { name: /가난한 찰리의 연감/ })).toHaveAttribute(
      "href",
      "/sessions/00000000-0000-0000-0000-000000000306",
    );
  });
});
