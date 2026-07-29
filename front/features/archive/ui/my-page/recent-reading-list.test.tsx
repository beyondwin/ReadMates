import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { RecentReadingListItem } from "./recent-reading-list";
import { RecentReadingList } from "./recent-reading-list";
import { RecentReadingRow } from "./recent-reading-row";

function recentItem(
  overrides: Partial<RecentReadingListItem> = {},
): RecentReadingListItem {
  return {
    sessionId: "session-9",
    sessionNumberLabel: "9차",
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
        recordsHref="/app/me/records"
        items={[
          recentItem({
            sessionId: "session-12",
            href: "/app/sessions/session-12",
            activityLabels: ["질문 2", "서평 1"],
            feedbackStatus: "피드백 열림",
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
            feedbackStatus: null,
          }),
        ]}
      />,
    );

    expect(screen.getByRole("heading", {
      level: 2,
      name: "최근 함께 읽은 기록",
    })).toBeVisible();
    expect(screen.getByRole("list", {
      name: "최근 함께 읽은 기록",
    }).querySelectorAll("li")).toHaveLength(3);
    expect(screen.getByRole("link", {
      name: "샘플 도서 회차 기록",
    })).toHaveAttribute("href", "/app/sessions/session-12");
    expect(screen.getAllByRole("link").filter((link) =>
      link.getAttribute("href")?.includes("/app/sessions/"),
    )).toHaveLength(3);
    expect(screen.getByRole("link", {
      name: "전체 기록 보기",
    })).toHaveAttribute("href", "/app/me/records");
    expect(screen.getByText(/질문 2/)).toBeVisible();
    expect(screen.getByText(/서평 1/)).toBeVisible();
    expect(screen.getByText(/피드백 열림/)).toBeVisible();
    expect(screen.getByText("피드백 제한")).toBeVisible();
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

  it("renders a quiet empty state without a records action", () => {
    render(<RecentReadingList items={[]} recordsHref="/app/me/records" />);

    expect(screen.getByText(
      "첫 모임 이후 이곳에 읽은 기록이 이어집니다.",
    )).toBeVisible();
    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.queryByRole("link", { name: "전체 기록 보기" })).toBeNull();
  });
});
