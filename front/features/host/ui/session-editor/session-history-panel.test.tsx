import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
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
});
