import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  HostActionConfirmationDialog,
  type HostActionPreview,
  type NotificationDecision,
} from "./host-action-confirmation-dialog";

const preview: HostActionPreview = {
  previewId: "preview-1",
  targetCount: 3,
  expectedInAppCount: 3,
  expectedEmailCount: 2,
  excludedCount: 1,
  expiresAt: "2026-07-23T20:00:00+09:00",
};

function DialogHarness({
  initialPreview = preview,
  onConfirm = vi.fn(),
}: {
  initialPreview?: HostActionPreview;
  onConfirm?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [decision, setDecision] = useState<NotificationDecision | null>(null);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>변경사항 검토</button>
      <HostActionConfirmationDialog
        open={open}
        preview={initialPreview}
        decision={decision}
        submitting={false}
        onDecisionChange={setDecision}
        onCancel={() => {
          setDecision(null);
          setOpen(false);
        }}
        onConfirm={onConfirm}
      />
    </>
  );
}

describe("HostActionConfirmationDialog", () => {
  it("requires an explicit SEND or SKIP choice with no default", async () => {
    const user = userEvent.setup();
    render(<DialogHarness />);
    await user.click(screen.getByRole("button", { name: "변경사항 검토" }));

    expect(screen.getByRole("dialog")).toHaveAttribute("aria-modal", "true");
    expect(screen.getByRole("radio", { name: "알림 보내고 반영" })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: "알림 없이 반영" })).not.toBeChecked();
    expect(screen.getByRole("group", { name: "필수 선택" })).toHaveAttribute("aria-required", "true");
    expect(screen.getByRole("radio", { name: "알림 보내고 반영" })).toBeRequired();
    expect(screen.getByRole("radio", { name: "알림 없이 반영" })).toBeRequired();
    expect(screen.getByRole("button", { name: "선택대로 반영" })).toBeDisabled();

    await user.click(screen.getByRole("radio", { name: "알림 없이 반영" }));
    expect(screen.getByRole("button", { name: "선택대로 반영" })).toBeEnabled();
  });

  it("traps focus, cancels with Escape, and restores trigger focus without confirming", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<DialogHarness onConfirm={onConfirm} />);
    const trigger = screen.getByRole("button", { name: "변경사항 검토" });
    trigger.focus();
    await user.click(trigger);

    const send = screen.getByRole("radio", { name: "알림 보내고 반영" });
    const cancel = screen.getByRole("button", { name: "취소" });
    expect(send).toHaveFocus();

    cancel.focus();
    await user.tab();
    expect(send).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("disables SEND for zero targets while leaving SKIP available", async () => {
    const user = userEvent.setup();
    render(<DialogHarness initialPreview={{
      ...preview,
      targetCount: 0,
      expectedInAppCount: 0,
      expectedEmailCount: 0,
    }} />);
    await user.click(screen.getByRole("button", { name: "변경사항 검토" }));

    expect(screen.getByRole("radio", { name: "알림 보내고 반영" })).toBeDisabled();
    expect(screen.getByText("알림 대상이 없어 SEND를 선택할 수 없습니다.")).toBeVisible();
    await user.click(screen.getByRole("radio", { name: "알림 없이 반영" }));
    expect(screen.getByRole("button", { name: "선택대로 반영" })).toBeEnabled();
  });

  it("keeps mobile action labels safe at 320px", async () => {
    const user = userEvent.setup();
    render(<DialogHarness />);
    await user.click(screen.getByRole("button", { name: "변경사항 검토" }));

    expect(screen.getByTestId("host-action-dialog-sheet")).toHaveStyle({
      width: "min(480px, calc(100vw - 24px))",
      maxWidth: "100%",
    });
    expect(screen.getByRole("button", { name: "선택대로 반영" })).toHaveStyle({
      whiteSpace: "nowrap",
    });
  });

  it("waits for an open preview before focusing the required decision group", () => {
    const props = {
      open: true,
      preview: null,
      decision: null,
      submitting: false,
      onDecisionChange: vi.fn(),
      onCancel: vi.fn(),
      onConfirm: vi.fn(),
    };
    const { rerender } = render(<HostActionConfirmationDialog {...props} />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    rerender(<HostActionConfirmationDialog {...props} preview={preview} />);

    expect(screen.getByRole("radio", { name: "알림 보내고 반영" })).toHaveFocus();
  });
});
