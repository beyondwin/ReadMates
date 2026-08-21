import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  appendUniqueSessionHistory,
  type SessionHistoryPanelItem,
} from "./session-history-model";
import { SessionHistoryPanel } from "./session-history-panel";

describe("SessionHistoryPanel", () => {
  it("renders version history without opaque identifiers", () => {
    render(
      <SessionHistoryPanel
        items={[
          historyItem(),
          {
            ...historyItem(),
            id: "history-restore",
            type: "RECORD_REVISION_RESTORED",
            revisionId: "revision-1",
            revisionVersion: 1,
            revisionSource: "RESTORED",
          },
        ]}
        expectedDraftRevision={4}
        restoring={false}
        onRestore={vi.fn()}
        onRestoreCompleted={vi.fn()}
      />,
    );

    expect(screen.getByText("변경 기록")).toBeVisible();
    expect(screen.getByRole("heading", { name: "버전과 작업 기록" })).toBeVisible();
    expect(screen.getByText("새 버전 반영")).toBeVisible();
    expect(screen.getByText("버전 2")).toBeVisible();
    expect(screen.getByText("과거 버전으로 초안 생성")).toBeVisible();
    expect(screen.getAllByText(/직접 작성 · 2026\.07\.23 10:00|과거 버전에서 생성 · 2026\.07\.23 10:00/))
      .toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "이 버전으로 초안 만들기" })).toHaveLength(2);
    expect(screen.queryByText(/history-1|revision-2|membership-host/)).not.toBeInTheDocument();
  });

  it("creates a working draft only after confirmation and reports completion", async () => {
    const user = userEvent.setup();
    const onRestore = vi.fn().mockResolvedValue(undefined);
    const onRestoreCompleted = vi.fn();
    render(
      <SessionHistoryPanel
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
          recovery: { action: "RESTORE_RECORD_DRAFT", availability: "AVAILABLE" },
        }]}
        expectedDraftRevision={4}
        restoring={false}
        onRestore={onRestore}
        onRestoreCompleted={onRestoreCompleted}
      />,
    );

    await user.click(screen.getByRole("button", { name: "이 버전으로 초안 만들기" }));
    expect(onRestore).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "버전 2로 작업 초안을 만들까요?" })).toBeInTheDocument();
    expect(screen.getByText("현재 적용본은 바뀌지 않습니다")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "작업 초안 만들기" }));
    expect(onRestore).toHaveBeenCalledWith({
      revisionId: "revision-2",
      expectedDraftRevision: 4,
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(onRestoreCompleted).toHaveBeenCalledTimes(1);
  });

  it("traps restore focus, closes on Escape, and restores the trigger", async () => {
    const user = userEvent.setup();
    const onRestore = vi.fn();
    render(
      <SessionHistoryPanel
        items={[historyItem()]}
        expectedDraftRevision={4}
        restoring={false}
        onRestore={onRestore}
        onRestoreCompleted={vi.fn()}
      />,
    );
    const trigger = screen.getByRole("button", { name: "이 버전으로 초안 만들기" });
    await user.click(trigger);
    const cancel = screen.getByRole("button", { name: "취소" });
    const confirm = screen.getByRole("button", { name: "작업 초안 만들기" });
    expect(cancel).toHaveFocus();

    confirm.focus();
    await user.tab();
    expect(cancel).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(onRestore).not.toHaveBeenCalled();
  });

  it.each(["cancel", "backdrop"] as const)(
    "closes on %s without creating a draft and restores the trigger",
    async (dismissal) => {
      const user = userEvent.setup();
      const onRestore = vi.fn();
      render(
        <SessionHistoryPanel
            items={[historyItem()]}
          expectedDraftRevision={4}
          restoring={false}
          onRestore={onRestore}
          onRestoreCompleted={vi.fn()}
        />,
      );
      const trigger = screen.getByRole("button", { name: "이 버전으로 초안 만들기" });
      await user.click(trigger);

      if (dismissal === "cancel") {
        await user.click(screen.getByRole("button", { name: "취소" }));
      } else {
        fireEvent.mouseDown(screen.getByRole("dialog"));
      }

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      await waitFor(() => expect(trigger).toHaveFocus());
      expect(onRestore).not.toHaveBeenCalled();
    },
  );

  it("renders the approved empty history copy", () => {
    render(
      <SessionHistoryPanel
        items={[]}
        expectedDraftRevision={null}
        restoring={false}
        onRestore={vi.fn()}
        onRestoreCompleted={vi.fn()}
      />,
    );

    expect(screen.getByText("아직 변경 기록이 없습니다")).toBeVisible();
  });

  it("keeps the restore dialog open with an inline error", async () => {
    const user = userEvent.setup();
    const onRestoreCompleted = vi.fn();
    render(
      <SessionHistoryPanel
        items={[historyItem()]}
        expectedDraftRevision={4}
        restoring={false}
        onRestore={vi.fn().mockRejectedValue(new Error("stale"))}
        onRestoreCompleted={onRestoreCompleted}
      />,
    );
    await user.click(screen.getByRole("button", { name: "이 버전으로 초안 만들기" }));
    await user.click(screen.getByRole("button", { name: "작업 초안 만들기" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("복원하지 못했습니다");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("새 버전 반영")).toBeVisible();
    expect(onRestoreCompleted).not.toHaveBeenCalled();
  });

  it("loads the next history cursor and preserves rows when loading fails", async () => {
    const user = userEvent.setup();
    const onLoadMore = vi.fn().mockRejectedValue(new Error("offline"));
    render(
      <SessionHistoryPanel
        items={[historyItem()]}
        expectedDraftRevision={4}
        restoring={false}
        nextCursor="cursor-2"
        loadingMore={false}
        onLoadMore={onLoadMore}
        onRestore={vi.fn()}
        onRestoreCompleted={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "변경 기록 더 보기" }));
    await waitFor(() => expect(onLoadMore).toHaveBeenCalledWith("cursor-2"));
    expect(await screen.findByRole("alert")).toHaveTextContent("변경 기록을 더 불러오지 못했습니다");
    expect(screen.getByText("새 버전 반영")).toBeVisible();
  });

  it("appends a cursor page without duplicating an overlapping history item", () => {
    const current: SessionHistoryPanelItem[] = [historyItem()];
    const next: SessionHistoryPanelItem[] = [
      historyItem(),
      { ...historyItem(), id: "history-2", revisionId: "revision-1", revisionVersion: 1 },
    ];
    const appended: SessionHistoryPanelItem[] = appendUniqueSessionHistory(current, next);

    expect(appended.map((item) => item.id)).toEqual(["history-1", "history-2"]);
  });

  it("renders reverse lifecycle history with the approved legacy reason and a text note", () => {
    render(
      <SessionHistoryPanel
        items={[
          {
            ...historyItem(),
            id: "history-reopen",
            type: "SESSION_REOPENED",
            revisionId: null,
            revisionVersion: null,
            revisionSource: null,
            fromState: "CLOSED",
            toState: "OPEN",
            reasonCode: "LEGACY_UNSPECIFIED",
            reasonNote: "<img src=x onerror=alert(1)>keep as text",
          },
        ]}
        expectedDraftRevision={4}
        restoring={false}
        onRestore={vi.fn()}
        onRestoreCompleted={vi.fn()}
      />,
    );

    expect(screen.getByText("다시 진행 중으로")).toBeVisible();
    expect(screen.getByText("마감 → 준비 중")).toBeVisible();
    expect(screen.getByText("이전 클라이언트에서 사유 없이 변경됨")).toBeVisible();
    expect(screen.getByText("<img src=x onerror=alert(1)>keep as text")).toBeVisible();
    expect(document.querySelector("img")).toBeNull();
    expect(screen.queryByText("LEGACY_UNSPECIFIED")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "이 버전으로 초안 만들기" })).not.toBeInTheDocument();
  });

  it("restores a change from server recovery metadata after confirmation", async () => {
    const user = userEvent.setup();
    const onRestoreChange = vi.fn();
    render(
      <SessionHistoryPanel
        items={[{
          ...historyItem(),
          id: "change-1",
          type: "BASIC_INFO_UPDATED",
          revisionId: null,
          revisionVersion: null,
          revisionSource: null,
          recovery: { action: "RESTORE_CHANGE", availability: "AVAILABLE" },
        }]}
        expectedDraftRevision={4}
        restoring={false}
        onRestore={vi.fn()}
        onRestoreCompleted={vi.fn()}
        onRestoreChange={onRestoreChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: "이 변경 되돌리기" }));
    expect(onRestoreChange).toHaveBeenCalledWith("change-1");
    expect(screen.queryByRole("button", { name: "이 버전으로 초안 만들기" })).not.toBeInTheDocument();
  });

  it("opens the existing reverse lifecycle path from recovery metadata", async () => {
    const user = userEvent.setup();
    const onReverseLifecycle = vi.fn();
    render(
      <SessionHistoryPanel
        items={[{
          ...historyItem(),
          id: "history-opened",
          type: "SESSION_OPENED",
          revisionId: null,
          revisionVersion: null,
          revisionSource: null,
          fromState: "DRAFT",
          toState: "OPEN",
          recovery: { action: "REVERSE_LIFECYCLE", availability: "AVAILABLE" },
        }]}
        expectedDraftRevision={null}
        restoring={false}
        onRestore={vi.fn()}
        onRestoreCompleted={vi.fn()}
        onReverseLifecycle={onReverseLifecycle}
      />,
    );

    await user.click(screen.getByRole("button", { name: "이 상태 되돌리기" }));
    expect(onReverseLifecycle).toHaveBeenCalledTimes(1);
  });

  it("renders a disabled explanation instead of a restore button when recovery is unavailable", () => {
    render(
      <SessionHistoryPanel
        items={[{
          ...historyItem(),
          id: "history-legacy",
          type: "BASIC_INFO_UPDATED",
          revisionId: null,
          revisionVersion: null,
          revisionSource: null,
          recovery: {
            action: "RESTORE_CHANGE",
            availability: "UNAVAILABLE",
            blockedReason: "SNAPSHOT_UNAVAILABLE",
          },
        }]}
        expectedDraftRevision={null}
        restoring={false}
        onRestore={vi.fn()}
        onRestoreCompleted={vi.fn()}
        onRestoreChange={vi.fn()}
      />,
    );

    expect(screen.getByText("이 변경은 복원할 기록이 없어 바로 되돌릴 수 없습니다.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "이 변경 되돌리기" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "이 버전으로 초안 만들기" })).not.toBeInTheDocument();
  });

  it("renders a retained deleted lifecycle row in an audit-capable history list", () => {
    render(
      <SessionHistoryPanel
        items={[
          {
            ...historyItem(),
            id: "history-deleted",
            type: "SESSION_DELETED",
            revisionId: null,
            revisionVersion: null,
            revisionSource: null,
            fromState: "DRAFT",
            toState: null,
            reasonCode: "EMPTY_SESSION_DELETED",
            reasonNote: null,
          },
        ]}
        expectedDraftRevision={null}
        restoring={false}
        onRestore={vi.fn()}
        onRestoreCompleted={vi.fn()}
      />,
    );

    expect(screen.getByText("모임 삭제")).toBeVisible();
    expect(screen.getByText("예정 → 삭제")).toBeVisible();
    expect(screen.getByText("빈 모임 삭제")).toBeVisible();
    expect(screen.queryByText("EMPTY_SESSION_DELETED")).not.toBeInTheDocument();
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
    fromState: null,
    toState: null,
    reasonCode: null,
    reasonNote: null,
    recovery: {
      action: "RESTORE_RECORD_DRAFT" as const,
      availability: "AVAILABLE" as const,
    },
  };
}
