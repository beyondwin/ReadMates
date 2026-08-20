import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { UpcomingBookListItem } from "@/features/host/model/upcoming-book-list-model";
import { UpcomingBookList } from "./upcoming-book-list";

const drafts: UpcomingBookListItem[] = [
  { sessionId: "b", state: "DRAFT", date: "2026-07-09", bookTitle: "B", accessScope: "HOST_ONLY" },
  { sessionId: "a", state: "DRAFT", date: "2026-06-11", bookTitle: "A", accessScope: "GUEST_READABLE" },
  { sessionId: "open", state: "OPEN", date: "2026-04-15", bookTitle: "Now", accessScope: "GUEST_READABLE" },
];

describe("UpcomingBookList", () => {
  it("lists drafts by date with member visibility switches", () => {
    render(
      <UpcomingBookList
        items={drafts}
        onSaveAccessScope={vi.fn()}
        onCreateSession={vi.fn()}
      />,
    );

    const list = screen.getByRole("list", { name: "다음에 읽을 책" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining("A"),
      expect.stringContaining("B"),
    ]);
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.getByText("B")).toBeInTheDocument();
    expect(screen.queryByText("Now")).not.toBeInTheDocument();
    expect(screen.getByText("2026.06.11")).toBeInTheDocument();
    expect(screen.getByText("2026.07.09")).toBeInTheDocument();

    expect(screen.getByRole("switch", { name: "A 멤버에게 보이기" })).toBeChecked();
    expect(screen.getByRole("switch", { name: "B 멤버에게 보이기" })).not.toBeChecked();
    expect(screen.queryByText("GUEST_READABLE")).not.toBeInTheDocument();
    expect(screen.queryByText("HOST_ONLY")).not.toBeInTheDocument();
  });

  it("saves GUEST_READABLE when 멤버에게 보이기 is turned on", async () => {
    const user = userEvent.setup();
    const onSaveAccessScope = vi.fn();
    render(
      <UpcomingBookList
        items={drafts}
        onSaveAccessScope={onSaveAccessScope}
        onCreateSession={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("switch", { name: "B 멤버에게 보이기" }));

    expect(onSaveAccessScope).toHaveBeenCalledWith({
      sessionId: "b",
      accessScope: "GUEST_READABLE",
    });
  });

  it("saves HOST_ONLY when 멤버에게 보이기 is turned off", async () => {
    const user = userEvent.setup();
    const onSaveAccessScope = vi.fn();
    render(
      <UpcomingBookList
        items={drafts}
        onSaveAccessScope={onSaveAccessScope}
        onCreateSession={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("switch", { name: "A 멤버에게 보이기" }));

    expect(onSaveAccessScope).toHaveBeenCalledWith({
      sessionId: "a",
      accessScope: "HOST_ONLY",
    });
  });

  it("expands book title, author, and date from 모임 하나 더", async () => {
    const user = userEvent.setup();
    render(
      <UpcomingBookList
        items={drafts}
        onSaveAccessScope={vi.fn()}
        onCreateSession={vi.fn()}
      />,
    );

    expect(screen.queryByLabelText("책 제목")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "모임 하나 더" }));

    expect(screen.getByLabelText("책 제목")).toBeInTheDocument();
    expect(screen.getByLabelText("저자")).toBeInTheDocument();
    expect(screen.getByLabelText("모임 날짜")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "새 모임 멤버에게 보이기" })).not.toBeChecked();
  });

  it("creates a draft without opening it and defaults to 호스트만", async () => {
    const user = userEvent.setup();
    const onCreateSession = vi.fn();
    const onOpenSession = vi.fn();
    render(
      <UpcomingBookList
        items={drafts}
        onSaveAccessScope={vi.fn()}
        onCreateSession={onCreateSession}
      />,
    );

    await user.click(screen.getByRole("button", { name: "모임 하나 더" }));
    await user.type(screen.getByLabelText("책 제목"), "다음 책");
    await user.type(screen.getByLabelText("저자"), "다음 저자");
    await user.type(screen.getByLabelText("모임 날짜"), "2026-08-13");
    await user.click(screen.getByRole("button", { name: "목록에 넣기" }));

    expect(onCreateSession).toHaveBeenCalledWith({
      bookTitle: "다음 책",
      bookAuthor: "다음 저자",
      date: "2026-08-13",
      accessScope: "HOST_ONLY",
    });
    expect(onOpenSession).not.toHaveBeenCalled();
  });

  it("creates with GUEST_READABLE when the new-meeting switch is on", async () => {
    const user = userEvent.setup();
    const onCreateSession = vi.fn();
    render(
      <UpcomingBookList
        items={drafts}
        onSaveAccessScope={vi.fn()}
        onCreateSession={onCreateSession}
      />,
    );

    await user.click(screen.getByRole("button", { name: "모임 하나 더" }));
    await user.type(screen.getByLabelText("책 제목"), "다음 책");
    await user.type(screen.getByLabelText("저자"), "다음 저자");
    await user.type(screen.getByLabelText("모임 날짜"), "2026-08-13");
    await user.click(screen.getByRole("switch", { name: "새 모임 멤버에게 보이기" }));
    await user.click(screen.getByRole("button", { name: "목록에 넣기" }));

    expect(onCreateSession).toHaveBeenCalledWith({
      bookTitle: "다음 책",
      bookAuthor: "다음 저자",
      date: "2026-08-13",
      accessScope: "GUEST_READABLE",
    });
    expect(screen.queryByText("GUEST_READABLE")).not.toBeInTheDocument();
  });
});
