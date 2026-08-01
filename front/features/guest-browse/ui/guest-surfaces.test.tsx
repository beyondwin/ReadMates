import { render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it } from "vitest";
import { GuestCurrentSession, GuestHome } from "./guest-surfaces";

const guestSessionFixture = {
  sessionId: "session-open",
  sessionNumber: 12,
  title: "여름의 독서",
  bookTitle: "파도",
  bookAuthor: "작가",
  bookImageUrl: null,
  date: "2026-08-09",
  startTime: "19:00",
  endTime: "21:00",
  questionDeadlineAt: "2026-08-08T23:59:00",
  attendees: [
    { displayName: "읽는이", avatarKey: "book", rsvpStatus: "GOING", attendanceStatus: "UNKNOWN" },
  ],
  board: {
    questions: [
      {
        priority: 1,
        text: "다가오는 질문",
        draftThought: "초안 생각",
        authorName: "읽는이",
        authorShortName: "읽는",
        avatarKey: "book",
      },
    ],
    longReviews: [
      { title: "서평", content: "공개 서평", authorName: "읽는이", authorShortName: "읽는", avatarKey: "book" },
    ],
  },
  capabilities: { canWrite: false },
} as const;

describe("guest browse surfaces", () => {
  it("shows real guest session data but no participation controls", () => {
    render(<GuestCurrentSession data={{ currentSession: guestSessionFixture }} />);

    expect(screen.getByText("다가오는 질문")).toBeVisible();
    expect(screen.getByText("초안 생각")).toBeVisible();
    expect(screen.getByText("여름의 독서")).toBeVisible();
    expect(screen.getAllByText("읽는이")).toHaveLength(3);
    expect(screen.getByText((_, element) => element?.textContent === "RSVP · 참석출석 · 미확인")).toBeVisible();
    expect(screen.getByText("참석 현황")).toBeVisible();
    expect(screen.queryByRole("button", { name: /RSVP|저장|질문 추가/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/접속 링크|비밀번호|정확한 장소/)).not.toBeInTheDocument();
  });

  it("renders public archive one-liners with full author and avatar semantics", async () => {
    const { GuestArchiveDetail } = await import("./guest-surfaces");
    render(
      <GuestArchiveDetail
        data={{
          sessionId: "closed-1", sessionNumber: 1, title: "지난 모임", bookTitle: "기록 책", bookAuthor: "작가", bookImageUrl: null,
          date: "2026-07-01", attendance: 4, total: 5, state: "CLOSED", summary: null, highlights: [], questions: [],
          oneLiners: [{ text: "한 줄 감상", authorName: "전체 이름", authorShortName: "전체", avatarKey: "book" }], longReviews: [],
          capabilities: { canWrite: false },
        }}
      />,
    );

    expect(screen.getByRole("heading", { name: "한줄평" })).toBeVisible();
    expect(screen.getByText("한 줄 감상")).toBeVisible();
    expect(screen.getByText("전체 이름")).toBeVisible();
    expect(screen.getByTitle("전체 이름")).toBeVisible();
  });

  it("shows upcoming sessions on guest home without placing them on public home", () => {
    render(
      <GuestHome
        data={{
          current: { currentSession: guestSessionFixture },
          upcoming: {
            items: [
              {
                sessionId: "session-upcoming",
                sessionNumber: 13,
                title: "다음 읽기",
                bookTitle: "다음 책",
                bookAuthor: "다음 작가",
                bookImageUrl: null,
                date: "2026-09-13",
                startTime: "19:00",
                endTime: "21:00",
                questionDeadlineAt: "2026-09-12T23:59:00",
                state: "OPEN",
              },
            ],
            nextCursor: null,
          },
          recentNotes: { items: [], nextCursor: null },
        }}
      />,
    );

    expect(screen.getByRole("heading", { name: "다가오는 세션" })).toBeVisible();
    expect(screen.getByText("다음 책")).toBeVisible();
  });

  it("uses the injected SPA link and preserves the complete conversion return path", () => {
    const RoutedLink = ({ to, children, ...props }: ComponentProps<"a"> & { to: string }) => <a {...props} data-router-link="true" href={to}>{children}</a>;
    render(<GuestHome data={{ current: { currentSession: null }, upcoming: { items: [], nextCursor: null }, recentNotes: { items: [], nextCursor: null } }} appBasePath="/clubs/alpha/app" returnTo="/clubs/alpha/app?tab=notes#recent" LinkComponent={RoutedLink} />);

    expect(screen.getByRole("link", { name: "멤버로 시작" })).toHaveAttribute("href", "/login?returnTo=%2Fclubs%2Falpha%2Fapp%3Ftab%3Dnotes%23recent");
    expect(screen.getByRole("link", { name: "노트 더 보기" })).toHaveAttribute("data-router-link", "true");
  });
});
