import { readFileSync } from "node:fs";
import { useRef, useState, type ReactNode, type RefObject } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminModalDialog } from "./admin-modal-dialog";

const GLOBALS_CSS = readFileSync("src/styles/globals.css", "utf8");

function DialogHarness({
  onRequestClose,
  children,
}: {
  onRequestClose?: () => void;
  children?: ReactNode;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(true);
  const close = () => {
    onRequestClose?.();
    setOpen(false);
  };

  return (
    <div>
      <button type="button" ref={triggerRef}>
        열기
      </button>
      <button type="button">바깥 작업</button>
      {open ? (
        <AdminModalDialog titleId="admin-dialog-title" triggerRef={triggerRef} onRequestClose={close}>
          {children ?? (
            <>
              <h2 id="admin-dialog-title">확인</h2>
              <button type="button">첫 작업</button>
              <button type="button">마지막 작업</button>
            </>
          )}
        </AdminModalDialog>
      ) : null}
    </div>
  );
}

afterEach(() => {
  document.body.style.overflow = "";
});

describe("AdminModalDialog", () => {
  it("labels the dialog, moves initial focus inside, and restores the trigger", async () => {
    const user = userEvent.setup();
    const onRequestClose = vi.fn();
    document.body.style.overflow = "auto";
    render(<DialogHarness onRequestClose={onRequestClose} />);

    const dialog = screen.getByRole("dialog", { name: "확인" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-labelledby", "admin-dialog-title");
    expect(screen.getByRole("button", { name: "첫 작업" })).toHaveFocus();
    expect(document.body.style.overflow).toBe("hidden");

    await user.keyboard("{Escape}");
    expect(onRequestClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "열기" })).toHaveFocus();
    expect(document.body.style.overflow).toBe("auto");
  });

  it("wraps Tab and Shift+Tab around the dialog in both directions", async () => {
    const user = userEvent.setup();
    render(<DialogHarness />);

    const dialog = screen.getByRole("dialog", { name: "확인" });
    const first = screen.getByRole("button", { name: "첫 작업" });
    const last = screen.getByRole("button", { name: "마지막 작업" });
    expect(first).toHaveFocus();

    last.focus();
    await user.tab();
    expect(first).toHaveFocus();
    expect(dialog.contains(document.activeElement)).toBe(true);

    await user.tab({ shift: true });
    expect(last).toHaveFocus();
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it("pulls focus back when a nested widget leaves the dialog", () => {
    render(
      <DialogHarness>
        <h2 id="admin-dialog-title">확인</h2>
        <button type="button">첫 작업</button>
        <div role="group" aria-label="세부 입력">
          <input aria-label="사유" />
          <button type="button">중첩 작업</button>
        </div>
        <button type="button">마지막 작업</button>
      </DialogHarness>,
    );

    const outsider = document.createElement("button");
    outsider.textContent = "외부";
    document.body.append(outsider);
    outsider.focus();
    fireEvent.keyDown(document, { key: "Tab" });

    expect(screen.getByRole("dialog", { name: "확인" }).contains(document.activeElement)).toBe(true);
    outsider.remove();
  });

  it("keeps Tab inside the dialog when nested fields sit between the edges", async () => {
    const user = userEvent.setup();
    render(
      <DialogHarness>
        <h2 id="admin-dialog-title">확인</h2>
        <button type="button">첫 작업</button>
        <div role="group" aria-label="세부 입력">
          <input aria-label="사유" />
          <select aria-label="범위">
            <option>클럽</option>
          </select>
        </div>
        <button type="button">마지막 작업</button>
      </DialogHarness>,
    );

    const dialog = screen.getByRole("dialog", { name: "확인" });
    screen.getByRole("textbox", { name: "사유" }).focus();
    await user.tab();
    expect(screen.getByRole("combobox", { name: "범위" })).toHaveFocus();
    expect(dialog.contains(document.activeElement)).toBe(true);

    screen.getByRole("button", { name: "마지막 작업" }).focus();
    await user.tab();
    expect(screen.getByRole("button", { name: "첫 작업" })).toHaveFocus();
  });

  it("closes on backdrop click and marks the background inert", async () => {
    const user = userEvent.setup();
    const onRequestClose = vi.fn();
    render(<DialogHarness onRequestClose={onRequestClose} />);

    const outside = screen.getByRole("button", { name: "바깥 작업" });
    expect(outside.closest("[inert]")).not.toBeNull();
    expect(screen.getByRole("dialog", { name: "확인" }).closest("[inert]")).toBeNull();

    await user.click(screen.getByTestId("admin-modal-dialog-backdrop"));
    expect(onRequestClose).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "바깥 작업" }).closest("[inert]")).toBeNull();
  });

  it("uses the 768px overlay contract with internal scroll and reduced motion", () => {
    const block = GLOBALS_CSS.slice(GLOBALS_CSS.indexOf(".admin-modal-dialog"));
    expect(block).toContain("@media (max-width: 768px)");
    expect(block).toContain("env(safe-area-inset-bottom");
    expect(block).toContain("overflow: auto");
    expect(block).toContain("prefers-reduced-motion: reduce");
  });
});

describe("AdminModalDialog props contract", () => {
  it("accepts the required overlay fields", () => {
    const triggerRef: RefObject<HTMLElement | null> = { current: null };
    const onRequestClose = () => undefined;
    expect(typeof onRequestClose).toBe("function");
    expect(triggerRef.current).toBeNull();
  });
});
