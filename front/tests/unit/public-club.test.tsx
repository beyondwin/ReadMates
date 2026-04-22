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
  tagline: "읽고 돌아와 서로의 생각을 듣는 독서모임",
  about: "읽는사이는 매달 한 권의 책을 읽고 질문, 감상, 대화를 조용히 쌓아가는 독서모임입니다.",
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

    expect(container).toHaveTextContent("읽는사이 · 읽고 돌아와 서로의 생각을 듣는 독서모임");
    expect(container).toHaveTextContent(
      "읽는사이는 매달 한 권의 책을 읽고 질문, 감상, 대화를 조용히 쌓아가는 독서모임입니다.",
    );
    expect(container).not.toHaveTextContent(
      "한 권의 책이 사람을 완전히 바꾼다고 믿지 않습니다. 그러나 책을 통해 지나가는 생각의 결이 천천히 변화를 만든다고 믿습니다.",
    );
    expect(container).not.toHaveTextContent("공개 소개가 아직 준비되지 않았습니다.");

    const overview = screen.getByLabelText("클럽 운영 정보");
    expect(within(overview).getByText("시작")).toBeInTheDocument();
    expect(within(overview).getByText("2024.03")).toBeInTheDocument();
    expect(within(overview).getByText("운영 리듬")).toBeInTheDocument();
    expect(within(overview).getByText("호스트가 공지하는 날 · 20:00 – 22:00")).toBeInTheDocument();
    expect(within(overview).getByText("멤버 정원")).toBeInTheDocument();
    expect(within(overview).getByText("9명 소규모 초대제")).toBeInTheDocument();
    expect(within(overview).getByText("호스트")).toBeInTheDocument();
    expect(within(overview).getByText("김호스트 · 2025.11~")).toBeInTheDocument();
    expect(within(overview).getByText("기록 방식")).toBeInTheDocument();
    expect(within(overview).getByText("음성만 · 자동 정리 참고용")).toBeInTheDocument();

    expect(screen.getByRole("heading", { name: "작게 읽고, 분명하게 남깁니다" })).toBeInTheDocument();
    expect(screen.getByText("참여, 피드백 문서, 개인 노트는 정식 멤버 공간에만 남깁니다.")).toBeInTheDocument();
    expect(screen.getByText("호스트 안내")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "호스트의 글" })).toBeInTheDocument();
    expect(screen.getByText("김호스트")).toBeInTheDocument();
    expect(screen.getByLabelText("김호스트")).toBeInTheDocument();
    expect(screen.getByText("호스트 · 2025.11~")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "기존 멤버 로그인" })).toHaveAttribute("href", "/login");
    const inviteCta = screen.getByRole("button", { name: /초대 수락하기/ });
    expect(inviteCta).toBeDisabled();
    expect(inviteCta).toHaveAttribute("aria-disabled", "true");
    expect(inviteCta).toHaveTextContent("초대 메일의 개인 링크에서만 열립니다.");
    expect(screen.queryByRole("link", { name: /초대 수락하기/ })).not.toBeInTheDocument();
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
      expect(screen.queryByRole("link", { name: "기존 멤버 로그인" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /초대 수락하기/ })).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: /초대 수락하기/ })).not.toBeInTheDocument();
    });
    expect(screen.getByRole("link", { name: /최근 공개 기록/ })).toHaveAttribute(
      "href",
      "/sessions/00000000-0000-0000-0000-000000000306",
    );
  });
});
