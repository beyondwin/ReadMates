import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef, type MutableRefObject } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  lifecycleConfirmCopy,
  openAlreadyExistsMessage,
} from "../../model/host-session-lifecycle-model";
import { SessionLifecycleConfirmDialog } from "./session-lifecycle-confirm-dialog";

const copy = lifecycleConfirmCopy("reopen");

afterEach(() => {
  document.body.replaceChildren();
});

describe("SessionLifecycleConfirmDialog", () => {
  it("labels the dialog from copy and focuses cancel on open", () => {
    renderDialog();

    const dialog = screen.getByRole("dialog", { name: copy.title });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-labelledby", "session-lifecycle-confirm-title");
    expect(screen.getByRole("heading", { name: copy.title })).toHaveAttribute(
      "id",
      "session-lifecycle-confirm-title",
    );
    expect(screen.getByText(copy.body)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "취소" })).toHaveFocus();
  });

  it("calls onConfirm from the primary confirm button", async () => {
    const user = userEvent.setup();
    const { onConfirm, onClose } = renderDialog();

    const confirm = screen.getByRole("button", { name: copy.confirmLabel });
    expect(confirm).toHaveClass("btn", "btn-primary", "btn-sm");
    expect(confirm).not.toHaveStyle({ background: "var(--danger)" });

    await user.click(confirm);

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("calls onClose from Escape without confirming", async () => {
    const user = userEvent.setup();
    const { onConfirm, onClose } = renderDialog();

    await user.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("disables confirm and cancel while submitting and ignores Escape", async () => {
    const user = userEvent.setup();
    const { onConfirm, onClose } = renderDialog({ submitting: true });

    expect(screen.getByRole("button", { name: copy.confirmLabel })).toBeDisabled();
    expect(screen.getByRole("button", { name: "취소" })).toBeDisabled();

    screen.getByRole("dialog", { name: copy.title }).focus();
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: copy.confirmLabel }));
    await user.click(screen.getByRole("button", { name: "취소" }));

    expect(onConfirm).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("shows the open-already-exists message and editor link when provided", () => {
    renderDialog({
      errorMessage: openAlreadyExistsMessage(),
      openSessionHref: "/app/host/sessions/session-open/edit",
    });

    expect(screen.getByRole("alert")).toHaveTextContent(openAlreadyExistsMessage());
    expect(screen.getByRole("link", { name: "진행 중인 세션 열기" })).toHaveAttribute(
      "href",
      "/app/host/sessions/session-open/edit",
    );
  });

  it("traps tab focus and restores the trigger on close", async () => {
    const user = userEvent.setup();
    const trigger = document.createElement("button");
    trigger.type = "button";
    document.body.append(trigger);
    const restoreFocusRef: MutableRefObject<HTMLElement | null> = { current: trigger };
    const { unmount } = renderDialog({ restoreFocusRef });

    const cancel = screen.getByRole("button", { name: "취소" });
    const confirm = screen.getByRole("button", { name: copy.confirmLabel });
    expect(cancel).toHaveFocus();

    await user.tab();
    expect(confirm).toHaveFocus();
    await user.tab();
    expect(cancel).toHaveFocus();

    unmount();
    expect(trigger).toHaveFocus();
    expect(restoreFocusRef.current).toBeNull();
  });
});

function renderDialog({
  errorMessage = null,
  openSessionHref = null,
  submitting = false,
  restoreFocusRef = createRef<HTMLElement | null>(),
  onClose = vi.fn(),
  onConfirm = vi.fn(),
}: {
  errorMessage?: string | null;
  openSessionHref?: string | null;
  submitting?: boolean;
  restoreFocusRef?: MutableRefObject<HTMLElement | null>;
  onClose?: () => void;
  onConfirm?: () => void;
} = {}) {
  const view = render(
    <SessionLifecycleConfirmDialog
      copy={copy}
      errorMessage={errorMessage}
      openSessionHref={openSessionHref}
      submitting={submitting}
      restoreFocusRef={restoreFocusRef}
      onClose={onClose}
      onConfirm={onConfirm}
    />,
  );

  return { ...view, onClose, onConfirm, restoreFocusRef };
}
