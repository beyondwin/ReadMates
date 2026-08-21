import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { HostMeetingLedger } from "./host-meeting-ledger";
import type { MeetingListItem } from "@/features/host/model/host-meeting-ledger-model";
import type { HostSessionLedgerItem } from "@/features/host/model/host-session-ledger-model";
import type { UpcomingBookListItem } from "@/features/host/model/upcoming-book-list-model";

function attentionItem(overrides: Partial<HostSessionLedgerItem> = {}): HostSessionLedgerItem {
  return {
    sessionId: "closed-1",
    sessionNumber: 12,
    title: "12회차",
    bookTitle: "닫힌 책",
    bookAuthor: "저자",
    bookImageUrl: null,
    date: "2026-04-15",
    startTime: "20:00",
    endTime: "22:00",
    locationLabel: "온라인",
    state: "CLOSED",
    visibility: "MEMBER",
    recordStatus: "INCOMPLETE",
    needsAttention: true,
    hasDraft: false,
    liveRevision: 1,
    draftRevision: null,
    lastModifiedAt: "2026-04-16T00:00:00Z",
    ...overrides,
  };
}

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

  it("shows the home attention total and only the top item with 모두 보기", () => {
    render(
      <MemoryRouter>
        <HostMeetingLedger
          items={[]}
          attentionPage={{
            items: [
              attentionItem({ sessionId: "published-1", bookTitle: "공개된 책", state: "PUBLISHED" }),
              attentionItem({ sessionId: "closed-2", bookTitle: "두 번째 책" }),
            ],
            summary: {
              needsAttentionCount: 4,
              incompletePublishedCount: 1,
              draftCount: 0,
            },
          }}
          LinkComponent={TestLink}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText("확인 필요 4건")).toBeInTheDocument();
    expect(screen.getByText("공개된 책")).toBeInTheDocument();
    expect(screen.queryByText("두 번째 책")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "모두 보기" })).toHaveAttribute(
      "href",
      "/app/host/operations",
    );
  });

  it("shows only alerts that belong to the viewed meeting", () => {
    render(
      <MemoryRouter>
        <HostMeetingLedger
          items={[{ sessionId: "open-1", state: "OPEN", date: "2026-04-15" }]}
          sessionId="open-1"
          sessionAttention={{
            items: [attentionItem({ sessionId: "open-1", bookTitle: "이 모임", state: "OPEN" })],
            summary: {
              needsAttentionCount: 1,
              incompletePublishedCount: 0,
              draftCount: 0,
            },
          }}
          LinkComponent={TestLink}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText("이 모임")).toBeInTheDocument();
    expect(screen.queryByText("다른 모임")).not.toBeInTheDocument();
    expect(screen.queryByText("확인 필요 2건")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "모두 보기" })).not.toBeInTheDocument();
  });

  it("shows the viewed session alert even when the club-wide attention page omitted it", () => {
    render(
      <MemoryRouter>
        <HostMeetingLedger
          items={[{ sessionId: "deep-1", state: "PUBLISHED", date: "2026-01-11" }]}
          sessionId="deep-1"
          attentionPage={{
            items: [
              attentionItem({ sessionId: "top-1", bookTitle: "상위 1", sessionNumber: 20 }),
              attentionItem({ sessionId: "top-2", bookTitle: "상위 2", sessionNumber: 19 }),
              attentionItem({ sessionId: "top-3", bookTitle: "상위 3", sessionNumber: 18 }),
            ],
            summary: {
              needsAttentionCount: 8,
              incompletePublishedCount: 4,
              draftCount: 0,
            },
          }}
          sessionAttention={{
            items: [attentionItem({
              sessionId: "deep-1",
              sessionNumber: 2,
              bookTitle: "깊은 기록",
              state: "PUBLISHED",
            })],
            summary: {
              needsAttentionCount: 1,
              incompletePublishedCount: 1,
              draftCount: 0,
            },
          }}
          LinkComponent={TestLink}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText("깊은 기록")).toBeInTheDocument();
    expect(screen.queryByText("상위 1")).not.toBeInTheDocument();
    expect(screen.queryByText("상위 2")).not.toBeInTheDocument();
    expect(screen.queryByText("상위 3")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "모두 보기" })).not.toBeInTheDocument();
  });

  it("shows a recoverable attention error on empty home", async () => {
    const onRetryAttention = vi.fn();
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <HostMeetingLedger
          items={[]}
          attentionError
          onRetryAttention={onRetryAttention}
          LinkComponent={TestLink}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "아직 열린 모임이 없습니다" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("확인 필요 목록을 불러오지 못했습니다.");
    expect(screen.queryByText("확인 필요한 세션 기록이 없습니다.")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(onRetryAttention).toHaveBeenCalled();
  });
});
