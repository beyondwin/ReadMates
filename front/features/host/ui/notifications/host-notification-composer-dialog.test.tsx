import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HostNotificationComposerDialog } from "./host-notification-composer-dialog";

function DialogHarness({
  busy = false,
  onClose = vi.fn(),
  variant,
  title,
  description,
}: {
  busy?: boolean;
  onClose?: () => void;
  variant?: "centered" | "side-sheet";
  title?: string;
  description?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>작성기 열기</button>
      <HostNotificationComposerDialog
        open={open}
        busy={busy}
        variant={variant}
        title={title}
        description={description}
        onClose={() => {
          onClose();
          setOpen(false);
        }}
      >
        <button type="button">첫 작업</button>
        <button type="button">마지막 작업</button>
      </HostNotificationComposerDialog>
    </>
  );
}

afterEach(() => {
  document.body.style.overflow = "";
});

describe("HostNotificationComposerDialog", () => {
  it("labels the modal, focuses it, traps focus, and restores the opener and body scroll", async () => {
    const user = userEvent.setup();
    document.body.style.overflow = "auto";
    render(<DialogHarness />);

    const opener = screen.getByRole("button", { name: "작성기 열기" });
    await user.click(opener);

    const dialog = screen.getByRole("dialog", { name: "알림 보내기" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleDescription("대상과 채널을 확인한 뒤에만 알림이 발송됩니다.");
    expect(dialog).toHaveFocus();
    expect(document.body.style.overflow).toBe("hidden");

    await user.tab();
    expect(screen.getByRole("button", { name: "첫 작업" })).toHaveFocus();
    screen.getByRole("button", { name: "마지막 작업" }).focus();
    await user.tab();
    expect(dialog).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
    expect(document.body.style.overflow).toBe("auto");
  });

  it("does not close or mutate when Escape is pressed while busy", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<DialogHarness busy onClose={onClose} />);

    await user.click(screen.getByRole("button", { name: "작성기 열기" }));
    await user.keyboard("{Escape}");

    expect(screen.getByRole("dialog", { name: "알림 보내기" })).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("renders a named side sheet without changing the dialog contract", async () => {
    const user = userEvent.setup();
    render(
      <DialogHarness
        variant="side-sheet"
        title="발송 전 확인"
        description="최종 대상과 채널을 확인한 뒤 발송합니다."
      />,
    );

    await user.click(screen.getByRole("button", { name: "작성기 열기" }));

    expect(screen.getByRole("dialog", { name: "발송 전 확인" }))
      .toHaveClass("host-notification-composer-dialog--side-sheet");
  });
});
