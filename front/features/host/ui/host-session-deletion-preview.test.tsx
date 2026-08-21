import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef, type MutableRefObject } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HostSessionDeletionPreviewResponse } from "@/features/host/model/host-view-types";
import { HostSessionDeletionPreviewDialog } from "./host-session-deletion-preview";

afterEach(() => {
  document.body.replaceChildren();
});

const preview: HostSessionDeletionPreviewResponse = {
  sessionId: "open-session-7",
  sessionNumber: 7,
  title: "7회차 모임 · 테스트 책",
  state: "OPEN",
  canDelete: true,
  counts: {
    participants: 6,
    rsvpResponses: 2,
    questions: 4,
    checkins: 3,
    oneLineReviews: 1,
    longReviews: 1,
    highlights: 0,
    publications: 0,
    feedbackReports: 7,
    feedbackDocuments: 8,
  },
  blockers: [],
};

describe("HostSessionDeletionPreviewDialog", () => {
  it("lists ordered blocker labels instead of the closed-or-published warning", () => {
    renderDialog({
      preview: {
        ...preview,
        canDelete: false,
        blockers: [
          { code: "RECORD_REVISION_EXISTS", count: 2 },
          { code: "MANUAL_DISPATCH_EXISTS", count: 1 },
          { code: "MEMBER_NOTIFICATION_EXISTS", count: 3 },
        ],
      },
    });

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("적용된 기록 버전 2개");
    expect(alert).toHaveTextContent("수동 알림 발송 1개");
    expect(alert).toHaveTextContent("멤버 알림 3개");
    expect(alert.textContent).toMatch(/적용된 기록 버전 2개.*수동 알림 발송 1개.*멤버 알림 3개/);
    expect(screen.queryByText("닫히거나 공개된 모임은 삭제할 수 없습니다. 기록 보존을 위해 위험 작업이 잠겨 있습니다.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "목록에서 지우기" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "다시 확인" })).toBeEnabled();
  });

  it("replaces blockers from a delete race and keeps focus in the dialog", async () => {
    const user = userEvent.setup();
    const onRefreshPreview = vi.fn();
    const { rerender, restoreFocusRef } = renderDialog({
      preview,
      onRefreshPreview,
    });

    const dialog = screen.getByRole("dialog", { name: "이 모임을 목록에서 지울까요?" });
    const confirm = within(dialog).getByRole("button", { name: "목록에서 지우기" });
    confirm.focus();
    expect(confirm).toHaveFocus();

    rerender(
      <HostSessionDeletionPreviewDialog
        preview={{
          ...preview,
          canDelete: false,
          blockers: [{ code: "NOTIFICATION_DECISION_EXISTS", count: 1 }],
        }}
        previewLoading={false}
        error={null}
        submitting={false}
        restoreFocusRef={restoreFocusRef}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        onRefreshPreview={onRefreshPreview}
      />,
    );

    const alert = within(dialog).getByRole("alert");
    expect(alert).toHaveTextContent("알림 확인 결정 1개");
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(within(dialog).getByRole("button", { name: "취소" })).not.toHaveFocus();

    await user.click(within(dialog).getByRole("button", { name: "다시 확인" }));
    expect(onRefreshPreview).toHaveBeenCalledTimes(1);
  });

  it("keeps the deletion preview inside a bounded action sheet", () => {
    renderDialog({ preview });

    const dialog = screen.getByRole("dialog", { name: "이 모임을 목록에서 지울까요?" });
    expect(dialog).toHaveClass("rm-host-action-dialog-sheet");
    expect(dialog).toHaveStyle({
      maxHeight: "calc(100dvh - 24px)",
      overflowY: "auto",
    });
    expect(dialog.parentElement).toHaveClass("rm-host-action-dialog-backdrop");
  });

  it("announces pending preview reload with a status live region", () => {
    renderDialog({
      preview: { ...preview, canDelete: false, blockers: [{ code: "NOTIFICATION_EVENT_EXISTS", count: 1 }] },
      previewLoading: true,
    });

    expect(screen.getByRole("status")).toHaveTextContent("삭제할 데이터를 확인하고 있습니다.");
    expect(screen.getByRole("alert")).toHaveTextContent("알림 이벤트 1개");
  });
});

function renderDialog({
  preview: dialogPreview = preview,
  previewLoading = false,
  error = null,
  submitting = false,
  restoreFocusRef = createRef<HTMLElement | null>(),
  onClose = vi.fn(),
  onConfirm = vi.fn(),
  onRefreshPreview = vi.fn(),
}: {
  preview?: HostSessionDeletionPreviewResponse | null;
  previewLoading?: boolean;
  error?: string | null;
  submitting?: boolean;
  restoreFocusRef?: MutableRefObject<HTMLElement | null>;
  onClose?: () => void;
  onConfirm?: () => void;
  onRefreshPreview?: () => void;
} = {}) {
  const view = render(
    <HostSessionDeletionPreviewDialog
      preview={dialogPreview}
      previewLoading={previewLoading}
      error={error}
      submitting={submitting}
      restoreFocusRef={restoreFocusRef}
      onClose={onClose}
      onConfirm={onConfirm}
      onRefreshPreview={onRefreshPreview}
    />,
  );

  return { ...view, onClose, onConfirm, onRefreshPreview, restoreFocusRef };
}
