import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { appendUniqueSessionHistory } from "./session-history-model";
import { SessionHistoryPanel } from "./session-history-panel";

describe("SessionHistoryPanel", () => {
  it("restores a revision into a draft only after confirmation", async () => {
    const user = userEvent.setup();
    const onRestore = vi.fn().mockResolvedValue(undefined);
    render(
      <SessionHistoryPanel
        activeMobileSection="history"
        items={[{
          id: "history-1",
          type: "RECORD_REVISION_APPLIED",
          createdAt: "2026-07-23T10:00:00+09:00",
          actorMembershipId: "membership-host",
          changedFields: ["publicationSummary"],
          attendanceTransitions: [],
          revisionId: "revision-2",
          revisionVersion: 2,
          revisionSource: "MANUAL",
          restoredFromRevisionId: null,
          notificationEventId: null,
        }]}
        expectedDraftRevision={4}
        restoring={false}
        onRestore={onRestore}
      />,
    );

    await user.click(screen.getByRole("button", { name: "revision 2 복원" }));
    expect(onRestore).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "revision 2를 새 초안으로 복원" })).toBeInTheDocument();
    expect(screen.getByText(/live 기록은 변경되지 않습니다/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "새 초안으로 복원" }));
    expect(onRestore).toHaveBeenCalledWith({
      revisionId: "revision-2",
      expectedDraftRevision: 4,
    });
  });

  it("traps restore focus, closes on Escape, and restores the trigger", async () => {
    const user = userEvent.setup();
    render(
      <SessionHistoryPanel
        activeMobileSection="history"
        items={[historyItem()]}
        expectedDraftRevision={4}
        restoring={false}
        onRestore={vi.fn()}
      />,
    );
    const trigger = screen.getByRole("button", { name: "revision 2 복원" });
    await user.click(trigger);
    const cancel = screen.getByRole("button", { name: "복원 취소" });
    const confirm = screen.getByRole("button", { name: "새 초안으로 복원" });
    expect(cancel).toHaveFocus();

    confirm.focus();
    await user.tab();
    expect(cancel).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("keeps the restore dialog open with an inline error", async () => {
    const user = userEvent.setup();
    render(
      <SessionHistoryPanel
        activeMobileSection="history"
        items={[historyItem()]}
        expectedDraftRevision={4}
        restoring={false}
        onRestore={vi.fn().mockRejectedValue(new Error("stale"))}
      />,
    );
    await user.click(screen.getByRole("button", { name: "revision 2 복원" }));
    await user.click(screen.getByRole("button", { name: "새 초안으로 복원" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("복원하지 못했습니다");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("loads the next history cursor and preserves rows when loading fails", async () => {
    const user = userEvent.setup();
    const onLoadMore = vi.fn().mockRejectedValue(new Error("offline"));
    render(
      <SessionHistoryPanel
        activeMobileSection="history"
        items={[historyItem()]}
        expectedDraftRevision={4}
        restoring={false}
        nextCursor="cursor-2"
        loadingMore={false}
        onLoadMore={onLoadMore}
        onRestore={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "변경 이력 더 보기" }));
    await waitFor(() => expect(onLoadMore).toHaveBeenCalledWith("cursor-2"));
    expect(await screen.findByRole("alert")).toHaveTextContent("변경 이력을 더 불러오지 못했습니다");
    expect(screen.getByText("공개 기록 반영")).toBeVisible();
  });

  it("appends a cursor page without duplicating an overlapping history item", () => {
    const current = [historyItem()];
    const next = [
      historyItem(),
      { ...historyItem(), id: "history-2", revisionId: "revision-1", revisionVersion: 1 },
    ];

    expect(appendUniqueSessionHistory(current, next).map((item) => item.id))
      .toEqual(["history-1", "history-2"]);
  });
});

function historyItem() {
  return {
    id: "history-1",
    type: "RECORD_REVISION_APPLIED" as const,
    createdAt: "2026-07-23T10:00:00+09:00",
    actorMembershipId: "membership-host",
    changedFields: ["publicationSummary"],
    attendanceTransitions: [],
    revisionId: "revision-2",
    revisionVersion: 2,
    revisionSource: "MANUAL" as const,
    restoredFromRevisionId: null,
    notificationEventId: null,
  };
}
