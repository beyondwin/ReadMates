import { render, screen, fireEvent } from "@testing-library/react";
import { useRef, useState, type RefObject } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminOnboardingModal } from "./admin-onboarding-modal";

function renderModal(props: {
  isDirty: boolean;
  onClose: () => void;
  effectPending?: boolean;
  triggerRef?: RefObject<HTMLElement | null>;
}) {
  return render(
    <AdminOnboardingModal
      onRequestClose={props.onClose}
      isDirty={props.isDirty}
      effectPending={props.effectPending ?? false}
      triggerRef={props.triggerRef}
    >
      <div>wizard contents</div>
    </AdminOnboardingModal>,
  );
}

afterEach(() => {
  document.body.style.overflow = "";
});

describe("AdminOnboardingModal", () => {
  it("renders children inside a dialog", () => {
    renderModal({ isDirty: false, onClose: () => {} });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("wizard contents")).toBeInTheDocument();
  });

  it("closes immediately when not dirty", () => {
    const onClose = vi.fn();
    renderModal({ isDirty: false, onClose });
    fireEvent.click(screen.getByRole("button", { name: /닫기/ }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("asks for confirmation when dirty", () => {
    const onClose = vi.fn();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    renderModal({ isDirty: true, onClose });
    fireEvent.click(screen.getByRole("button", { name: /닫기/ }));
    expect(confirmSpy).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
    confirmSpy.mockRestore();
  });

  it("aborts close when confirmation is cancelled", () => {
    const onClose = vi.fn();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderModal({ isDirty: true, onClose });
    fireEvent.click(screen.getByRole("button", { name: /닫기/ }));
    expect(onClose).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("closes on ESC keydown", () => {
    const onClose = vi.fn();
    renderModal({ isDirty: false, onClose });
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on backdrop click", () => {
    const onClose = vi.fn();
    renderModal({ isDirty: false, onClose });
    fireEvent.click(screen.getByTestId("admin-modal-dialog-backdrop"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it.each(["button", "escape", "backdrop"] as const)(
    "does not close through %s while the effect outcome is pending",
    (method) => {
      const onClose = vi.fn();
      renderModal({ isDirty: true, effectPending: true, onClose });
      if (method === "button") {
        fireEvent.click(screen.getByRole("button", { name: /닫기/ }));
      } else if (method === "escape") {
        fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
      } else {
        fireEvent.click(screen.getByTestId("admin-modal-dialog-backdrop"));
      }
      expect(onClose).not.toHaveBeenCalled();
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    },
  );

  it("locks background scroll and restores the trigger through the shared dialog", () => {
    const onClose = vi.fn();
    document.body.style.overflow = "auto";

    function Harness() {
      const triggerRef = useRef<HTMLButtonElement>(null);
      const [open, setOpen] = useState(true);
      return (
        <>
          <button type="button" ref={triggerRef}>
            새 클럽
          </button>
          {open ? (
            <AdminOnboardingModal
              isDirty={false}
              triggerRef={triggerRef}
              onRequestClose={() => {
                onClose();
                setOpen(false);
              }}
            >
              <div>wizard contents</div>
            </AdminOnboardingModal>
          ) : null}
        </>
      );
    }

    render(<Harness />);

    expect(document.body.style.overflow).toBe("hidden");
    expect(screen.getByRole("dialog", { name: "새 클럽" })).toHaveAttribute(
      "aria-modal",
      "true",
    );
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "새 클럽" })).toHaveFocus();
    expect(document.body.style.overflow).toBe("auto");
  });
});
