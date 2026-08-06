import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { RecentReadingListItem } from "./recent-reading-list";
import { RecentReadingList } from "./recent-reading-list";
import { RecentReadingRow } from "./recent-reading-row";

function recentItem(
  overrides: Partial<RecentReadingListItem> = {},
): RecentReadingListItem {
  return {
    sessionId: "session-9",
    sessionNumberLabel: "No.09",
    dateLabel: "2026.07.22",
    bookTitle: "샘플 도서",
    bookAuthor: "샘플 저자",
    bookImageUrl: null,
    coverFallbackLabel: "샘",
    activityLabels: [],
    feedbackStatus: null,
    href: "/app/sessions/session-9",
    ...overrides,
  };
}

describe("RecentReadingList", () => {
  it("renders a three-row semantic list with one session anchor per row", () => {
    render(
      <RecentReadingList
        archiveSessionsHref="/app/archive?view=sessions"
        items={[
          recentItem({
            sessionId: "session-12",
            href: "/app/sessions/session-12",
            activityLabels: ["질문 2", "서평 1"],
            feedbackStatus: "피드백 O",
          }),
          recentItem({
            sessionId: "session-11",
            href: "/app/sessions/session-11",
            bookTitle: "두 번째 도서",
            feedbackStatus: "피드백 제한",
          }),
          recentItem({
            sessionId: "session-10",
            href: "/app/sessions/session-10",
            bookTitle: "세 번째 도서",
            feedbackStatus: "피드백 준비중",
          }),
        ]}
      />,
    );

    expect(screen.getByRole("heading", {
      level: 2,
      name: "최근 독서 기록",
    })).toBeVisible();
    expect(screen.getByRole("list", {
      name: "최근 독서 기록",
    }).querySelectorAll("li")).toHaveLength(3);
    expect(screen.getByRole("link", {
      name: "샘플 도서 회차 기록",
    })).toHaveAttribute("href", "/app/sessions/session-12");
    expect(screen.getAllByRole("link").filter((link) =>
      link.getAttribute("href")?.includes("/app/sessions/"),
    )).toHaveLength(3);
    expect(screen.getByRole("link", {
      name: "전체 보기",
    })).toHaveAttribute("href", "/app/archive?view=sessions");
    expect(screen.getAllByRole("link").some((link) =>
      link.getAttribute("href")?.endsWith("/app/me/records"),
    )).toBe(false);
    const readableRow = screen.getByRole("link", {
      name: "샘플 도서 회차 기록",
    });
    expect(readableRow).toHaveClass(
      "rm-recent-reading-row",
      "rm-recent-reading-row--archive-aligned",
    );
    expect(readableRow.querySelector(
      ".rm-recent-reading-row__cover-frame",
    )).toBeInTheDocument();
    expect(within(readableRow).getByText("질문 2")).toHaveClass("badge");
    expect(within(readableRow).getByText("서평 1")).toHaveClass("badge");
    expect(within(readableRow).getByText("피드백 O")).toHaveClass(
      "badge",
      "badge-ok",
      "badge-dot",
    );
    expect(within(readableRow).queryByText(/참석/)).toBeNull();
    expect(within(readableRow).queryByText("비공개")).toBeNull();
    expect(screen.getByText("피드백 제한")).toBeVisible();
    expect(screen.getByText("피드백 준비중")).toHaveClass(
      "badge",
      "badge-readonly",
      "badge-dot",
    );
  });

  it("keeps covers decorative and replaces a failed remote cover locally", () => {
    const { container } = render(
      <RecentReadingRow
        item={recentItem({
          bookImageUrl: "https://example.com/public-safe-cover.jpg",
          coverFallbackLabel: "샘",
        })}
      />,
    );

    const cover = container.querySelector("img");
    expect(cover).toHaveAttribute("alt", "");
    fireEvent.error(cover!);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("[aria-hidden='true']")).toHaveTextContent("샘");
  });

  it("places the book heading in a flow-content container", () => {
    render(<RecentReadingRow item={recentItem({
      activityLabels: ["질문 2"],
      feedbackStatus: "피드백 O",
    })} />);

    const heading = screen.getByRole("heading", {
      level: 3,
      name: "샘플 도서",
    });

    expect(heading.parentElement).toHaveClass("rm-recent-reading-row__book");
    expect(heading.parentElement?.tagName).toBe("DIV");
    const activity = screen.getByText("질문 2").parentElement;
    expect(activity).toHaveClass("rm-recent-reading-row__activity");
    expect(activity?.parentElement).toHaveClass("rm-recent-reading-row");
    expect(activity).not.toBe(heading.parentElement);
  });

  it("matches the public records text link while keeping row navigation chevrons", () => {
    const { container } = render(
      <RecentReadingList
        items={[recentItem()]}
        archiveSessionsHref="/app/archive?view=sessions"
      />,
    );

    const chevrons = container.querySelectorAll(
      "svg.rm-recent-reading-chevron",
    );

    expect(chevrons).toHaveLength(1);
    chevrons.forEach((chevron) => {
      expect(chevron).toHaveAttribute("aria-hidden", "true");
      expect(chevron).toHaveAttribute("focusable", "false");
    });
    expect(container).not.toHaveTextContent("→");
    const allRecordsLink = screen.getByRole("link", {
      name: "전체 보기",
    });
    expect(allRecordsLink).toBeVisible();
    expect(allRecordsLink).toHaveClass("public-records-link");
    expect(allRecordsLink.querySelector("svg")).toBeNull();
    expect(screen.getByRole("link", {
      name: "샘플 도서 회차 기록",
    })).toBeVisible();
  });

  it("renders a quiet empty state without a records action", () => {
    render(
      <RecentReadingList
        items={[]}
        archiveSessionsHref="/app/archive?view=sessions"
      />,
    );

    expect(screen.getByText(
      "첫 모임 이후 이곳에 읽은 기록이 이어집니다.",
    )).toBeVisible();
    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.queryByRole("link", {
      name: "전체 보기",
    })).toBeNull();
  });
});
