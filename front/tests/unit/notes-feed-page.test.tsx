import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import NotesFeedPage from "@/features/archive/components/notes-feed-page";
import { resolveSelectedSession } from "@/features/archive/components/notes-session-filter-utils";
import type { NoteFeedItem, NoteSessionItem } from "@/shared/api/readmates";

afterEach(cleanup);

const noteSessions: NoteSessionItem[] = [
  {
    sessionId: "session-9",
    sessionNumber: 9,
    bookTitle: "다정한 것이 살아남는다",
    date: "2026-07-15",
    questionCount: 2,
    oneLinerCount: 2,
    highlightCount: 1,
    checkinCount: 4,
    totalCount: 9,
  },
  {
    sessionId: "session-8",
    sessionNumber: 8,
    bookTitle: "도둑맞은 집중력",
    date: "2026-06-17",
    questionCount: 1,
    oneLinerCount: 1,
    highlightCount: 1,
    checkinCount: 4,
    totalCount: 7,
  },
  {
    sessionId: "session-7",
    sessionNumber: 7,
    bookTitle: "물고기는 존재하지 않는다",
    date: "2026-05-20",
    questionCount: 0,
    oneLinerCount: 0,
    highlightCount: 0,
    checkinCount: 0,
    totalCount: 0,
  },
  {
    sessionId: "session-6",
    sessionNumber: 6,
    bookTitle: "가난한 찰리의 연감",
    date: "2026-04-15",
    questionCount: 4,
    oneLinerCount: 5,
    highlightCount: 3,
    checkinCount: 5,
    totalCount: 17,
  },
  {
    sessionId: "session-5",
    sessionNumber: 5,
    bookTitle: "불안",
    date: "2026-03-18",
    questionCount: 1,
    oneLinerCount: 1,
    highlightCount: 0,
    checkinCount: 3,
    totalCount: 5,
  },
  {
    sessionId: "session-4",
    sessionNumber: 4,
    bookTitle: "물질문명과 자본주의",
    date: "2026-02-18",
    questionCount: 2,
    oneLinerCount: 1,
    highlightCount: 2,
    checkinCount: 3,
    totalCount: 8,
  },
  {
    sessionId: "session-3",
    sessionNumber: 3,
    bookTitle: "스토너",
    date: "2026-01-21",
    questionCount: 1,
    oneLinerCount: 2,
    highlightCount: 2,
    checkinCount: 3,
    totalCount: 8,
  },
  {
    sessionId: "session-2",
    sessionNumber: 2,
    bookTitle: "월든",
    date: "2025-12-17",
    questionCount: 1,
    oneLinerCount: 1,
    highlightCount: 1,
    checkinCount: 3,
    totalCount: 6,
  },
  {
    sessionId: "session-1",
    sessionNumber: 1,
    bookTitle: "팩트풀니스",
    date: "2025-11-26",
    questionCount: 1,
    oneLinerCount: 0,
    highlightCount: 0,
    checkinCount: 0,
    totalCount: 1,
  },
];

const selectedSession = noteSessions[3];

const selectedItems: NoteFeedItem[] = [
  {
    sessionId: "session-6",
    sessionNumber: 6,
    bookTitle: "가난한 찰리의 연감",
    date: "2026-04-15",
    authorName: "김호스트",
    authorShortName: "우",
    kind: "QUESTION",
    text: "실패를 피하는 방식으로 의사결정을 점검한다면 무엇이 달라질까요?",
  },
  {
    sessionId: "session-6",
    sessionNumber: 6,
    bookTitle: "가난한 찰리의 연감",
    date: "2026-04-15",
    authorName: "이멤버5",
    authorShortName: "수",
    kind: "ONE_LINE_REVIEW",
    text: "실패할 곳을 피하는 방식으로 삶을 보는 질문이 좋았다.",
  },
  {
    sessionId: "session-6",
    sessionNumber: 6,
    bookTitle: "가난한 찰리의 연감",
    date: "2026-04-15",
    authorName: "읽는사이",
    authorShortName: "읽",
    kind: "HIGHLIGHT",
    text: "다학문적 사고는 더 안전한 판단을 만들기도 하지만 실행을 늦추는 부담이 되기도 했다.",
  },
  {
    sessionId: "session-6",
    sessionNumber: 6,
    bookTitle: "가난한 찰리의 연감",
    date: "2026-04-15",
    authorName: "박민준",
    authorShortName: "민",
    kind: "CHECKIN",
    text: "완독. 8장 마지막 문단이 오래 남습니다.",
  },
];

const otherSessionItem: NoteFeedItem = {
  sessionId: "session-1",
  sessionNumber: 1,
  bookTitle: "팩트풀니스",
  date: "2025-11-26",
  authorName: "한지우",
  authorShortName: "지",
  kind: "QUESTION",
  text: "팩트풀니스 질문은 선택된 세션 밖의 기록입니다.",
};

function renderNotesFeedPage({
  renderItems = selectedItems,
  renderNoteSessions = noteSessions,
  selectedSessionId = selectedSession.sessionId,
  renderSelectedSession = selectedSession,
}: {
  renderItems?: NoteFeedItem[];
  renderNoteSessions?: NoteSessionItem[];
  selectedSessionId?: string | null;
  renderSelectedSession?: NoteSessionItem | null;
} = {}) {
  return render(
    <NotesFeedPage
      items={renderItems}
      noteSessions={renderNoteSessions}
      selectedSessionId={selectedSessionId}
      selectedSession={renderSelectedSession}
    />,
  );
}

function desktopRail() {
  const search = screen.getByLabelText("세션 검색");
  const rail = search.closest("div")?.parentElement;

  expect(rail).not.toBeNull();

  return rail as HTMLElement;
}

describe("NotesFeedPage", () => {
  it("resolves selected sessions without changing fallback order", () => {
    expect(resolveSelectedSession({ noteSessions, selectedSessionId: "session-1", selectedSession: noteSessions[8] })).toBe(noteSessions[8]);
    expect(resolveSelectedSession({ noteSessions, selectedSessionId: "session-8", selectedSession: null })).toBe(noteSessions[1]);
    expect(resolveSelectedSession({ noteSessions, selectedSessionId: "missing-session", selectedSession: null })).toBe(noteSessions[0]);
    expect(resolveSelectedSession({ noteSessions: [], selectedSessionId: null, selectedSession: null })).toBeNull();
  });

  it("renders the selected session header, count summary, and selected desktop rail row", () => {
    renderNotesFeedPage();

    expect(screen.getByRole("heading", { name: "가난한 찰리의 연감" })).toBeInTheDocument();
    expect(screen.getByText("No.06 · 2026.04.15")).toBeInTheDocument();
    expect(screen.getByText("질문 4")).toBeInTheDocument();
    expect(screen.getByText("한줄평 5")).toBeInTheDocument();
    expect(screen.getByText("하이라이트 3")).toBeInTheDocument();
    expect(screen.getByText("읽기 흔적 5")).toBeInTheDocument();

    const rail = desktopRail();

    expect(within(rail).getByText("세션별")).toBeInTheDocument();
    expect(within(rail).getByText("최근순")).toBeInTheDocument();

    const selectedLink = within(rail).getByRole("link", { name: "No.06 가난한 찰리의 연감 세션 보기" });

    expect(selectedLink).toHaveAttribute("href", "/app/notes?sessionId=session-6");
    expect(selectedLink).toHaveAttribute("aria-current", "page");
    expect(selectedLink).toHaveTextContent("선택됨");
    expect(selectedLink).toHaveTextContent("2026.04.15 · 기록 17");
  });

  it("filters the desktop session rail by book title and No.06-style labels", async () => {
    const user = userEvent.setup();

    renderNotesFeedPage();

    const rail = desktopRail();
    const search = within(rail).getByLabelText("세션 검색");

    await user.type(search, "팩트");

    expect(within(rail).getByRole("link", { name: "No.01 팩트풀니스 세션 보기" })).toBeInTheDocument();
    expect(within(rail).queryByRole("link", { name: "No.06 가난한 찰리의 연감 세션 보기" })).not.toBeInTheDocument();

    await user.clear(search);
    await user.type(search, "No.06");

    expect(within(rail).getByRole("link", { name: "No.06 가난한 찰리의 연감 세션 보기" })).toBeInTheDocument();
    expect(within(rail).queryByRole("link", { name: "No.01 팩트풀니스 세션 보기" })).not.toBeInTheDocument();

    await user.clear(search);
    await user.type(search, "없는책");

    expect(within(rail).getByText("일치하는 세션이 없습니다.")).toBeInTheDocument();
    expect(within(rail).queryByRole("link")).not.toBeInTheDocument();
  });

  it("renders a recent mobile picker and opens a searchable full-session bottom sheet", async () => {
    const user = userEvent.setup();
    const { container } = renderNotesFeedPage();

    const picker = container.querySelector('[aria-label="최근 세션"]');

    expect(picker).not.toBeNull();
    expect(within(picker as HTMLElement).getByRole("link", { name: "No.09 다정한 것이 살아남는다 세션 보기" })).toHaveAttribute(
      "href",
      "/app/notes?sessionId=session-9",
    );
    expect(within(picker as HTMLElement).getByRole("link", { name: "No.06 가난한 찰리의 연감 세션 보기" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(picker as HTMLElement).queryByRole("link", { name: "No.01 팩트풀니스 세션 보기" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "전체 세션" }));

    const dialog = screen.getByRole("dialog", { name: "전체 세션" });

    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "전체 세션 닫기" })).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: "No.01 팩트풀니스 세션 보기" })).toHaveAttribute(
      "href",
      "/app/notes?sessionId=session-1",
    );

    const sheetSearch = within(dialog).getByLabelText("전체 세션 검색");

    await user.type(sheetSearch, "No.01");

    expect(within(dialog).getByRole("link", { name: "No.01 팩트풀니스 세션 보기" })).toBeInTheDocument();
    expect(within(dialog).queryByRole("link", { name: "No.06 가난한 찰리의 연감 세션 보기" })).not.toBeInTheDocument();

    await user.clear(sheetSearch);
    await user.type(sheetSearch, "없는책");

    expect(within(dialog).getByText("일치하는 세션이 없습니다.")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "전체 세션 닫기" }));

    expect(screen.queryByRole("dialog", { name: "전체 세션" })).not.toBeInTheDocument();
  });

  it("keeps an older selected session visible in the capped mobile recent picker", () => {
    const { container } = renderNotesFeedPage({
      renderItems: [otherSessionItem],
      selectedSessionId: "session-1",
      renderSelectedSession: noteSessions[8],
    });

    const picker = container.querySelector('[aria-label="최근 세션"]');

    expect(picker).not.toBeNull();
    expect(within(picker as HTMLElement).getAllByRole("link")).toHaveLength(8);
    expect(within(picker as HTMLElement).getByRole("link", { name: "No.01 팩트풀니스 세션 보기" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(picker as HTMLElement).queryByRole("link", { name: "No.02 월든 세션 보기" })).not.toBeInTheDocument();
  });

  it("traps keyboard focus in the mobile session sheet, closes on Escape, and restores the opener", async () => {
    const user = userEvent.setup();

    renderNotesFeedPage();

    const opener = screen.getByRole("button", { name: "전체 세션" });
    await user.click(opener);

    const dialog = screen.getByRole("dialog", { name: "전체 세션" });
    const search = within(dialog).getByLabelText("전체 세션 검색");
    const closeButton = within(dialog).getByRole("button", { name: "전체 세션 닫기" });
    const lastSessionLink = within(dialog).getByRole("link", { name: "No.01 팩트풀니스 세션 보기" });

    await waitFor(() => expect(search).toHaveFocus());

    await user.tab({ shift: true });
    expect(closeButton).toHaveFocus();

    await user.tab({ shift: true });
    expect(lastSessionLink).toHaveFocus();

    await user.tab();
    expect(closeButton).toHaveFocus();

    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "전체 세션" })).not.toBeInTheDocument());
    expect(opener).toHaveFocus();
  });

  it("shows the no-session body and selector empty states", () => {
    renderNotesFeedPage({
      renderItems: [],
      renderNoteSessions: [],
      selectedSessionId: null,
      renderSelectedSession: null,
    });

    expect(screen.getByText("아직 발행된 세션 기록이 없습니다.")).toBeInTheDocument();
    expect(screen.getAllByText("표시할 세션 기록이 없습니다.").length).toBeGreaterThan(0);
  });

  it("shows the selected-session empty state when the selected session has no records", () => {
    renderNotesFeedPage({
      renderItems: [],
      selectedSessionId: noteSessions[2].sessionId,
      renderSelectedSession: noteSessions[2],
    });

    expect(screen.getByRole("heading", { name: "물고기는 존재하지 않는다" })).toBeInTheDocument();
    expect(screen.getByText("이 세션에는 아직 공개된 기록이 없습니다.")).toBeInTheDocument();
  });

  it("shows the filter empty state when the selected session has records but not for the active filter", async () => {
    const user = userEvent.setup();

    renderNotesFeedPage({ renderItems: [selectedItems[0]] });

    expect(screen.getByText("실패를 피하는 방식으로 의사결정을 점검한다면 무엇이 달라질까요?")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "하이라이트" }));

    expect(screen.getByText("이 세션에는 해당 기록이 없습니다.")).toBeInTheDocument();
    expect(screen.queryByText("이 세션에는 아직 공개된 기록이 없습니다.")).not.toBeInTheDocument();
  });

  it("keeps feed filters scoped to the selected session items", async () => {
    const user = userEvent.setup();

    renderNotesFeedPage({ renderItems: [selectedItems[0], selectedItems[1], otherSessionItem] });

    expect(screen.getByText("실패를 피하는 방식으로 의사결정을 점검한다면 무엇이 달라질까요?")).toBeInTheDocument();
    expect(screen.getByText("실패할 곳을 피하는 방식으로 삶을 보는 질문이 좋았다.")).toBeInTheDocument();
    expect(screen.queryByText("팩트풀니스 질문은 선택된 세션 밖의 기록입니다.")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "질문" }));

    expect(screen.getByText("실패를 피하는 방식으로 의사결정을 점검한다면 무엇이 달라질까요?")).toBeInTheDocument();
    expect(screen.queryByText("실패할 곳을 피하는 방식으로 삶을 보는 질문이 좋았다.")).not.toBeInTheDocument();
    expect(screen.queryByText("팩트풀니스 질문은 선택된 세션 밖의 기록입니다.")).not.toBeInTheDocument();
  });

  it("falls back to the first note session with records when no selected session is supplied", () => {
    renderNotesFeedPage({
      renderItems: [],
      selectedSessionId: "missing-session",
      renderSelectedSession: null,
    });

    expect(screen.getByRole("heading", { name: "다정한 것이 살아남는다" })).toBeInTheDocument();

    const rail = desktopRail();
    const selectedLink = within(rail).getByRole("link", { name: "No.09 다정한 것이 살아남는다 세션 보기" });

    expect(selectedLink).toHaveAttribute("aria-current", "page");
  });
});
