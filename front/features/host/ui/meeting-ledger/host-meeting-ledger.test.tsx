import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { HostMeetingLedger } from "./host-meeting-ledger";
import type { MeetingListItem } from "@/features/host/model/host-meeting-ledger-model";
import type { UpcomingBookListItem } from "@/features/host/model/upcoming-book-list-model";

function TestLink({
  to,
  children,
}: {
  to: string | { pathname?: string };
  children: ReactNode;
}) {
  return <a href={typeof to === "string" ? to : ""}>{children}</a>;
}

function renderLedger(items: MeetingListItem[]) {
  return render(
    <MemoryRouter>
      <HostMeetingLedger items={items} LinkComponent={TestLink} />
    </MemoryRouter>,
  );
}

describe("HostMeetingLedger", () => {
  it("asks the host to create the first meeting when none exist", () => {
    render(
      <MemoryRouter>
        <HostMeetingLedger
          items={[]}
          LinkComponent={({ to, children }) => <a href={typeof to === "string" ? to : ""}>{children}</a>}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: "아직 열린 모임이 없습니다" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "첫 모임 만들기" })).toHaveAttribute("href", "/app/host/sessions/new");
  });

  it("marks 진행 중 as the current phase for an open meeting", () => {
    renderLedger([
      { sessionId: "open-1", state: "OPEN", date: "2026-04-15" },
    ]);

    expect(screen.getByRole("listitem", { name: "진행 중" })).toHaveAttribute("aria-current", "step");
    expect(screen.getByRole("listitem", { name: "모임 전" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("listitem", { name: "모임 후" })).not.toHaveAttribute("aria-current");
  });

  it("links to the previous meeting when a closed incomplete record remains and the active meeting is a draft", () => {
    renderLedger([
      { sessionId: "draft-1", state: "DRAFT", date: "2026-06-11" },
      { sessionId: "closed-1", state: "CLOSED", date: "2026-04-15", recordStatus: "NOT_STARTED" },
    ]);

    expect(screen.getByRole("listitem", { name: "모임 전" })).toHaveAttribute("aria-current", "step");
    expect(screen.getByRole("link", { name: "이전 모임 기록 남음" })).toHaveAttribute(
      "href",
      "/app/host/sessions/closed-1",
    );
  });

  it("keeps 모임 후 when the viewed meeting is the closed record, not the later draft", () => {
    render(
      <MemoryRouter>
        <HostMeetingLedger
          items={[
            { sessionId: "draft-1", state: "DRAFT", date: "2026-06-11" },
            { sessionId: "closed-1", state: "CLOSED", date: "2026-04-15", recordStatus: "NOT_STARTED" },
          ]}
          sessionId="closed-1"
          LinkComponent={TestLink}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole("listitem", { name: "모임 후" })).toHaveAttribute("aria-current", "step");
    expect(screen.queryByRole("link", { name: "이전 모임 기록 남음" })).not.toBeInTheDocument();
  });

  it("shows the upcoming book list during and after the meeting", () => {
    const upcomingItems: UpcomingBookListItem[] = [
      { sessionId: "draft-1", state: "DRAFT", date: "2026-06-11", bookTitle: "다음 책", accessScope: "HOST_ONLY" },
    ];

    const { rerender } = render(
      <MemoryRouter>
        <HostMeetingLedger
          items={[{ sessionId: "open-1", state: "OPEN", date: "2026-04-15" }]}
          upcomingItems={upcomingItems}
          onSaveUpcomingAccessScope={vi.fn()}
          onCreateUpcomingSession={vi.fn()}
          LinkComponent={TestLink}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: "다음에 읽을 책" })).toBeInTheDocument();
    expect(screen.getByText("다음 책")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "모임 하나 더" })).toBeInTheDocument();

    rerender(
      <MemoryRouter>
        <HostMeetingLedger
          items={[{ sessionId: "closed-1", state: "CLOSED", date: "2026-04-15" }]}
          sessionId="closed-1"
          upcomingItems={upcomingItems}
          onSaveUpcomingAccessScope={vi.fn()}
          onCreateUpcomingSession={vi.fn()}
          LinkComponent={TestLink}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: "다음에 읽을 책" })).toBeInTheDocument();
  });

  it("lays out this-meeting wrap-up beside next books after the meeting", () => {
    render(
      <MemoryRouter>
        <HostMeetingLedger
          items={[{ sessionId: "closed-1", state: "CLOSED", date: "2026-04-15" }]}
          sessionId="closed-1"
          upcomingItems={[
            { sessionId: "draft-1", state: "DRAFT", date: "2026-06-11", bookTitle: "다음 책", accessScope: "HOST_ONLY" },
          ]}
          onSaveUpcomingAccessScope={vi.fn()}
          onCreateUpcomingSession={vi.fn()}
          LinkComponent={TestLink}
        >
          <p>이번 모임 정리</p>
        </HostMeetingLedger>
      </MemoryRouter>,
    );

    const stage = document.querySelector(".rm-meeting-ledger__stage--after");
    expect(stage).toBeTruthy();
    expect(stage).not.toHaveClass("rm-meeting-ledger__stage--no-next");
    expect(screen.getByText("이번 모임 정리")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "다음에 읽을 책" })).toBeInTheDocument();
    expect(document.querySelector(".rm-upcoming-book-list")).toHaveClass("rm-upcoming-book-list--compact");
  });

  it("puts 모임 하나 더 above wrap-up on the empty-next after-phase layout", () => {
    render(
      <MemoryRouter>
        <HostMeetingLedger
          items={[{ sessionId: "closed-1", state: "CLOSED", date: "2026-04-15" }]}
          sessionId="closed-1"
          upcomingItems={[]}
          onSaveUpcomingAccessScope={vi.fn()}
          onCreateUpcomingSession={vi.fn()}
          LinkComponent={TestLink}
        >
          <p>이번 모임 정리</p>
        </HostMeetingLedger>
      </MemoryRouter>,
    );

    expect(document.querySelector(".rm-meeting-ledger__stage--after")).toHaveClass(
      "rm-meeting-ledger__stage--no-next",
    );
    expect(screen.getByRole("button", { name: "모임 하나 더" })).toBeInTheDocument();
    expect(document.querySelector(".rm-upcoming-book-list")).not.toHaveClass("rm-upcoming-book-list--compact");
  });

  it("hides the upcoming book list before the meeting", () => {
    render(
      <MemoryRouter>
        <HostMeetingLedger
          items={[{ sessionId: "draft-1", state: "DRAFT", date: "2026-06-11" }]}
          upcomingItems={[
            { sessionId: "draft-1", state: "DRAFT", date: "2026-06-11", bookTitle: "준비 중", accessScope: "HOST_ONLY" },
          ]}
          onSaveUpcomingAccessScope={vi.fn()}
          onCreateUpcomingSession={vi.fn()}
          LinkComponent={TestLink}
        />
      </MemoryRouter>,
    );

    expect(screen.queryByRole("heading", { name: "다음에 읽을 책" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "모임 하나 더" })).not.toBeInTheDocument();
  });
});
