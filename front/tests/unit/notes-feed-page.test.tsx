import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { MemoryRouter, useLocation, useSearchParams } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { NoteFeedItem, NoteSessionItem } from "@/features/archive/api/archive-contracts";
import {
  feedFilterFromSearchParam,
  resolveSelectedSession,
  type FeedFilter,
} from "@/features/archive/model/notes-feed-model";
import NotesFeedPage from "@/features/archive/ui/notes-feed-page";
import type { PagedResponse } from "@/shared/model/paging";

function pageOf<T>(items: T[], nextCursor: string | null = null): PagedResponse<T> {
  return { items, nextCursor };
}

afterEach(cleanup);

const noteSessions: NoteSessionItem[] = [
  {
    sessionId: "session-9",
    sessionNumber: 9,
    bookTitle: "다정한 것이 살아남는다",
    date: "2026-07-15",
    questionCount: 2,
    oneLinerCount: 2,
    longReviewCount: 0,
    highlightCount: 1,
    totalCount: 5,
  },
  {
    sessionId: "session-8",
    sessionNumber: 8,
    bookTitle: "도둑맞은 집중력",
    date: "2026-06-17",
    questionCount: 1,
    oneLinerCount: 1,
    longReviewCount: 0,
    highlightCount: 1,
    totalCount: 3,
  },
  {
    sessionId: "session-7",
    sessionNumber: 7,
    bookTitle: "물고기는 존재하지 않는다",
    date: "2026-05-20",
    questionCount: 0,
    oneLinerCount: 0,
    longReviewCount: 0,
    highlightCount: 0,
    totalCount: 0,
  },
  {
    sessionId: "session-6",
    sessionNumber: 6,
    bookTitle: "가난한 찰리의 연감",
    date: "2026-04-15",
    questionCount: 4,
    oneLinerCount: 5,
    longReviewCount: 1,
    highlightCount: 3,
    totalCount: 13,
  },
  {
    sessionId: "session-5",
    sessionNumber: 5,
    bookTitle: "불안",
    date: "2026-03-18",
    questionCount: 1,
    oneLinerCount: 1,
    longReviewCount: 0,
    highlightCount: 0,
    totalCount: 2,
  },
  {
    sessionId: "session-4",
    sessionNumber: 4,
    bookTitle: "물질문명과 자본주의",
    date: "2026-02-18",
    questionCount: 2,
    oneLinerCount: 1,
    longReviewCount: 0,
    highlightCount: 2,
    totalCount: 5,
  },
  {
    sessionId: "session-3",
    sessionNumber: 3,
    bookTitle: "스토너",
    date: "2026-01-21",
    questionCount: 1,
    oneLinerCount: 2,
    longReviewCount: 0,
    highlightCount: 2,
    totalCount: 5,
  },
  {
    sessionId: "session-2",
    sessionNumber: 2,
    bookTitle: "월든",
    date: "2025-12-17",
    questionCount: 1,
    oneLinerCount: 1,
    longReviewCount: 0,
    highlightCount: 1,
    totalCount: 3,
  },
  {
    sessionId: "session-1",
    sessionNumber: 1,
    bookTitle: "팩트풀니스",
    date: "2025-11-26",
    questionCount: 1,
    oneLinerCount: 0,
    longReviewCount: 0,
    highlightCount: 0,
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
    authorName: "정멤버3",
    authorShortName: "정",
    kind: "LONG_REVIEW",
    text: "문장마다 판단의 습관을 되묻게 만드는 장문 기록을 남겼다.",
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

type NotesFeedPageRenderOptions = {
  renderItems?: NoteFeedItem[];
  renderNoteSessions?: NoteSessionItem[];
  renderItemsPage?: PagedResponse<NoteFeedItem>;
  renderNoteSessionsPage?: PagedResponse<NoteSessionItem>;
  selectedSessionId?: string | null;
  renderSelectedSession?: NoteSessionItem | null;
  initialFilter?: FeedFilter;
  onFilterChange?: (filter: FeedFilter) => void;
  onLoadMoreItems?: () => Promise<void>;
  onLoadMoreNoteSessions?: () => Promise<void>;
};

function notesFeedPageElement({
  renderItems = selectedItems,
  renderNoteSessions = noteSessions,
  renderItemsPage = pageOf(renderItems),
  renderNoteSessionsPage = pageOf(renderNoteSessions),
  selectedSessionId = selectedSession.sessionId,
  renderSelectedSession = selectedSession,
  initialFilter,
  onFilterChange,
  onLoadMoreItems,
  onLoadMoreNoteSessions,
}: NotesFeedPageRenderOptions = {}) {
  return (
    <NotesFeedPage
      items={renderItemsPage}
      noteSessions={renderNoteSessionsPage}
      selectedSessionId={selectedSessionId}
      selectedSession={renderSelectedSession}
      initialFilter={initialFilter}
      onFilterChange={onFilterChange}
      onLoadMoreItems={onLoadMoreItems}
      onLoadMoreNoteSessions={onLoadMoreNoteSessions}
    />
  );
}

function renderNotesFeedPage(options: NotesFeedPageRenderOptions = {}) {
  return render(notesFeedPageElement(options));
}

function LocationProbe() {
  const location = useLocation();

  return <output aria-label="current route">{`${location.pathname}${location.search}`}</output>;
}

function NotesFilterUrlHarness() {
  const [searchParams, setSearchParams] = useSearchParams();
  const filter = feedFilterFromSearchParam(searchParams.get("filter"));
  const handleFilterChange = (nextFilter: FeedFilter) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);

      if (nextFilter === "all") {
        next.delete("filter");
      } else {
        next.set("filter", nextFilter);
      }

      return next;
    }, { replace: true });
  };

  return (
    <>
      <LocationProbe />
      {notesFeedPageElement({ initialFilter: filter, onFilterChange: handleFilterChange })}
    </>
  );
}

function renderNotesFeedPageInRouter({
  initialEntry = "/app/notes?sessionId=session-6",
  ...options
}: NotesFeedPageRenderOptions & { initialEntry?: string } = {}) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <LocationProbe />
      {notesFeedPageElement(options)}
    </MemoryRouter>,
  );
}

function renderNotesFilterUrlHarness(initialEntry = "/app/notes?sessionId=session-6") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <NotesFilterUrlHarness />
    </MemoryRouter>,
  );
}

function removedLabel(...parts: string[]) {
  return parts.join("");
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
    const selectedHeaderMeta = screen.getByLabelText("No.06 · 2026.04.15");
    expect(selectedHeaderMeta).toBeInTheDocument();
    expect(within(selectedHeaderMeta).getByText("No.06")).toHaveClass("rm-session-identity__number");
    expect(screen.getByText("세션을 먼저 고르고, 하이라이트·한줄평·질문을 작성자와 함께 훑는 클럽 기록장입니다.")).toBeInTheDocument();
    expect(screen.getByText("질문 4")).toBeInTheDocument();
    expect(screen.getByText("한줄평 5")).toBeInTheDocument();
    expect(screen.getByText("하이라이트 3")).toBeInTheDocument();
    expect(screen.queryByLabelText("선택한 세션 기록 수")).not.toBeInTheDocument();
    expect(within(screen.getByLabelText("클럽 노트 필터")).getAllByRole("button").map((button) => button.textContent)).toEqual([
      "전체 12",
      "하이라이트 3",
      "한줄평 5",
      "질문 4",
    ]);
    expect(screen.queryByRole("button", { name: removedLabel("읽기 ", "흔적") })).not.toBeInTheDocument();
    expect(screen.queryByText(removedLabel("읽기 ", "흔적 5"))).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "하이라이트 · 1" })).toBeInTheDocument();
    expect(screen.getByText("남은 문장들")).toBeInTheDocument();
    expect(screen.queryByText("AI-assisted")).not.toBeInTheDocument();
    const highlightRow = screen
      .getByText("다학문적 사고는 더 안전한 판단을 만들기도 하지만 실행을 늦추는 부담이 되기도 했다.")
      .closest(".rm-notes-highlight-row");

    expect(highlightRow).not.toBeNull();
    expect(within(highlightRow as HTMLElement).getByText("읽는사이")).toBeInTheDocument();
    expect(within(highlightRow as HTMLElement).queryByText("No.06 · 가난한 찰리의 연감")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "내 한줄평 · 1" })).toBeInTheDocument();
    expect(screen.getByText("짧게 남긴 감상")).toBeInTheDocument();
    const oneLinerCard = screen
      .getByText("실패할 곳을 피하는 방식으로 삶을 보는 질문이 좋았다.")
      .closest(".rm-notes-oneliner-card");

    expect(oneLinerCard).not.toBeNull();
    expect(within(oneLinerCard as HTMLElement).getByText("이멤버5")).toBeInTheDocument();
    expect(within(oneLinerCard as HTMLElement).queryByText("No.06 · 2026.04.15")).not.toBeInTheDocument();
    expect(screen.queryByText("문장마다 판단의 습관을 되묻게 만드는 장문 기록을 남겼다.")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "내 질문 · 1" })).toBeInTheDocument();
    expect(screen.getByText("읽으며 붙든 질문")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "이번 달의 질문들" })).not.toBeInTheDocument();
    const rail = desktopRail();

    expect(within(rail).getByText("세션별")).toBeInTheDocument();
    expect(within(rail).getByText("최근순")).toBeInTheDocument();

    const selectedLink = within(rail).getByRole("link", { name: "No.06 가난한 찰리의 연감 세션 보기" });

    expect(selectedLink).toHaveAttribute("href", "/app/notes?sessionId=session-6");
    expect(selectedLink).toHaveAttribute("aria-current", "page");
    expect(selectedLink).toHaveTextContent("선택됨");
    expect(selectedLink).toHaveTextContent("2026.04.15 · 기록 12");
  });

  it("appends selected-session feed items when 더 보기 is clicked", async () => {
    const user = userEvent.setup();
    const nextItem: NoteFeedItem = {
      sessionId: "session-6",
      sessionNumber: 6,
      bookTitle: "가난한 찰리의 연감",
      date: "2026-04-15",
      authorName: "한멤버",
      authorShortName: "한",
      kind: "QUESTION",
      text: "추가로 남긴 질문이 기존 기록 뒤에 이어집니다.",
    };

    function NotesLoadMoreHarness() {
      const [itemsPage, setItemsPage] = useState<PagedResponse<NoteFeedItem>>(
        pageOf([selectedItems[0]], "cursor-next"),
      );

      return notesFeedPageElement({
        renderItemsPage: itemsPage,
        onLoadMoreItems: async () => {
          setItemsPage((current) => ({
            items: [...current.items, nextItem],
            nextCursor: null,
          }));
        },
      });
    }

    render(<NotesLoadMoreHarness />);

    expect(screen.getByText("실패를 피하는 방식으로 의사결정을 점검한다면 무엇이 달라질까요?")).toBeInTheDocument();
    expect(screen.queryByText("추가로 남긴 질문이 기존 기록 뒤에 이어집니다.")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "더 보기" }));

    expect(screen.getByText("실패를 피하는 방식으로 의사결정을 점검한다면 무엇이 달라질까요?")).toBeInTheDocument();
    expect(screen.getByText("추가로 남긴 질문이 기존 기록 뒤에 이어집니다.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "더 보기" })).not.toBeInTheDocument();
  });

  it("renders missing note counts as zero", () => {
    const legacySession = {
      sessionId: "legacy-session",
      sessionNumber: 10,
      bookTitle: "이전 응답 모양",
      date: "2026-08-19",
    } as unknown as NoteSessionItem;

    renderNotesFeedPage({
      renderItems: [],
      renderNoteSessions: [legacySession],
      selectedSessionId: legacySession.sessionId,
      renderSelectedSession: legacySession,
    });

    expect(within(screen.getByLabelText("클럽 노트 필터")).getAllByRole("button").map((button) => button.textContent)).toEqual([
      "전체 0",
      "하이라이트 0",
      "한줄평 0",
      "질문 0",
    ]);
    expect(within(desktopRail()).getByRole("link", { name: "No.10 이전 응답 모양 세션 보기" })).toHaveTextContent("기록 0");
  });

  it("omits empty note sections from the all filter", () => {
    renderNotesFeedPage({ renderItems: [selectedItems[0]] });

    expect(screen.queryByRole("heading", { name: "하이라이트 · 0" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "내 한줄평 · 0" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "내 질문 · 1" })).toBeInTheDocument();
    expect(screen.getByText("실패를 피하는 방식으로 의사결정을 점검한다면 무엇이 달라질까요?")).toBeInTheDocument();
  });

  it("shows the matching-record empty state when all visible note sections are empty", () => {
    renderNotesFeedPage({
      renderItems: [],
      selectedSessionId: noteSessions[2].sessionId,
      renderSelectedSession: noteSessions[2],
    });

    expect(screen.getByRole("heading", { name: "물고기는 존재하지 않는다" })).toBeInTheDocument();
    expect(screen.getByText("이 세션에는 해당 기록이 없습니다.")).toBeInTheDocument();
    expect(screen.queryByText("이 세션에는 아직 공개된 기록이 없습니다.")).not.toBeInTheDocument();
  });

  it("uses router navigation for desktop and mobile session filter links", async () => {
    const user = userEvent.setup();
    const { container } = renderNotesFeedPageInRouter();

    expect(screen.getByLabelText("current route")).toHaveTextContent("/app/notes?sessionId=session-6");

    await user.click(within(desktopRail()).getByRole("link", { name: "No.09 다정한 것이 살아남는다 세션 보기" }));

    expect(screen.getByLabelText("current route")).toHaveTextContent("/app/notes?sessionId=session-9");

    const picker = container.querySelector('[aria-label="최근 세션"]');

    expect(picker).not.toBeNull();

    await user.click(within(picker as HTMLElement).getByRole("link", { name: "No.08 도둑맞은 집중력 세션 보기" }));

    expect(screen.getByLabelText("current route")).toHaveTextContent("/app/notes?sessionId=session-8");
  });

  it("keeps the active note filter in the URL and session-picker links", async () => {
    const user = userEvent.setup();
    const { container } = renderNotesFilterUrlHarness();

    await user.click(screen.getByRole("button", { name: "하이라이트 3" }));

    expect(screen.getByLabelText("current route")).toHaveTextContent("/app/notes?sessionId=session-6&filter=highlights");
    expect(screen.queryByText("AI-assisted")).not.toBeInTheDocument();
    expect(within(desktopRail()).getByRole("link", { name: "No.09 다정한 것이 살아남는다 세션 보기" })).toHaveAttribute(
      "href",
      "/app/notes?sessionId=session-9&filter=highlights",
    );

    const picker = container.querySelector('[aria-label="최근 세션"]');
    expect(picker).not.toBeNull();
    expect(within(picker as HTMLElement).getByRole("link", { name: "No.08 도둑맞은 집중력 세션 보기" })).toHaveAttribute(
      "href",
      "/app/notes?sessionId=session-8&filter=highlights",
    );

    await user.click(screen.getByRole("button", { name: "질문 4" }));

    expect(screen.getByLabelText("current route")).toHaveTextContent("/app/notes?sessionId=session-6&filter=questions");
    expect(screen.queryByText("AI-assisted")).not.toBeInTheDocument();
  });

  it("shows the oneliner detail label on oneliner note filter views", () => {
    renderNotesFilterUrlHarness("/app/notes?sessionId=session-6&filter=oneliners");

    expect(screen.queryByText("AI-assisted")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "내 한줄평 · 1" })).toBeInTheDocument();
    expect(screen.getByText("짧게 남긴 감상")).toBeInTheDocument();
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

    await user.click(screen.getByRole("button", { name: "전체 보기" }));

    const dialog = screen.getByRole("dialog", { name: "세션 목록" });

    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "세션 목록 닫기" })).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: "No.01 팩트풀니스 세션 보기" })).toHaveAttribute(
      "href",
      "/app/notes?sessionId=session-1",
    );

    const sheetSearch = within(dialog).getByLabelText("세션 목록 검색");

    await user.type(sheetSearch, "No.01");

    expect(within(dialog).getByRole("link", { name: "No.01 팩트풀니스 세션 보기" })).toBeInTheDocument();
    expect(within(dialog).queryByRole("link", { name: "No.06 가난한 찰리의 연감 세션 보기" })).not.toBeInTheDocument();

    await user.clear(sheetSearch);
    await user.type(sheetSearch, "없는책");

    expect(within(dialog).getByText("일치하는 세션이 없습니다.")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "세션 목록 닫기" }));

    expect(screen.queryByRole("dialog", { name: "세션 목록" })).not.toBeInTheDocument();
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

  it("left-aligns the selected session in the mobile recent picker", async () => {
    const originalScrollIntoView = Element.prototype.scrollIntoView;
    const scrollIntoView = vi.fn();

    Element.prototype.scrollIntoView = scrollIntoView;

    try {
      const { container, rerender } = renderNotesFeedPage();

      await waitFor(() =>
        expect(scrollIntoView).toHaveBeenCalledWith({
          block: "nearest",
          inline: "start",
        }),
      );

      scrollIntoView.mockClear();

      rerender(
        notesFeedPageElement({
          renderItems: [otherSessionItem],
          selectedSessionId: "session-1",
          renderSelectedSession: noteSessions[8],
        }),
      );

      const picker = container.querySelector('[aria-label="최근 세션"]');

      expect(picker).not.toBeNull();

      const selectedLink = within(picker as HTMLElement).getByRole("link", { name: "No.01 팩트풀니스 세션 보기" });

      await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(1));
      expect(scrollIntoView.mock.contexts[0]).toBe(selectedLink);
      expect(scrollIntoView).toHaveBeenCalledWith({
        block: "nearest",
        inline: "start",
      });
    } finally {
      if (originalScrollIntoView) {
        Element.prototype.scrollIntoView = originalScrollIntoView;
      } else {
        delete (Element.prototype as Partial<Element>).scrollIntoView;
      }
    }
  });

  it("traps keyboard focus in the mobile session sheet, closes on Escape, and restores the opener", async () => {
    const user = userEvent.setup();

    renderNotesFeedPage();

    const opener = screen.getByRole("button", { name: "전체 보기" });
    await user.click(opener);

    const dialog = screen.getByRole("dialog", { name: "세션 목록" });
    const search = within(dialog).getByLabelText("세션 목록 검색");
    const closeButton = within(dialog).getByRole("button", { name: "세션 목록 닫기" });
    const lastSessionLink = within(dialog).getByRole("link", { name: "No.01 팩트풀니스 세션 보기" });

    await waitFor(() => expect(search).toHaveFocus());

    await user.tab({ shift: true });
    expect(closeButton).toHaveFocus();

    await user.tab({ shift: true });
    expect(lastSessionLink).toHaveFocus();

    await user.tab();
    expect(closeButton).toHaveFocus();

    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "세션 목록" })).not.toBeInTheDocument());
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
    expect(screen.getByText("이 세션에는 해당 기록이 없습니다.")).toBeInTheDocument();
  });

  it("shows the filter empty state when the selected session has records but not for the active filter", async () => {
    const user = userEvent.setup();

    renderNotesFeedPage({ renderItems: [selectedItems[0]] });

    expect(screen.getByText("실패를 피하는 방식으로 의사결정을 점검한다면 무엇이 달라질까요?")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "하이라이트 3" }));

    expect(screen.getByText("이 세션에는 해당 기록이 없습니다.")).toBeInTheDocument();
    expect(screen.queryByText("이 세션에는 아직 공개된 기록이 없습니다.")).not.toBeInTheDocument();
  });

  it("keeps feed filters scoped to the selected session items", async () => {
    const user = userEvent.setup();

    renderNotesFeedPage({ renderItems: [selectedItems[0], selectedItems[1], selectedItems[2], otherSessionItem] });

    expect(screen.getByText("실패를 피하는 방식으로 의사결정을 점검한다면 무엇이 달라질까요?")).toBeInTheDocument();
    expect(screen.getByText("실패할 곳을 피하는 방식으로 삶을 보는 질문이 좋았다.")).toBeInTheDocument();
    expect(screen.queryByText("문장마다 판단의 습관을 되묻게 만드는 장문 기록을 남겼다.")).not.toBeInTheDocument();
    expect(screen.queryByText("팩트풀니스 질문은 선택된 세션 밖의 기록입니다.")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "질문 4" }));

    expect(screen.getByText("실패를 피하는 방식으로 의사결정을 점검한다면 무엇이 달라질까요?")).toBeInTheDocument();
    expect(screen.queryByText("실패할 곳을 피하는 방식으로 삶을 보는 질문이 좋았다.")).not.toBeInTheDocument();
    expect(screen.queryByText("문장마다 판단의 습관을 되묻게 만드는 장문 기록을 남겼다.")).not.toBeInTheDocument();
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
