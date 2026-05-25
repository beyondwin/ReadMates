import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AdminOnboardingModal } from "./admin-onboarding-modal";

function renderModal(props: { isDirty: boolean; onClose: () => void }) {
  return render(
    <AdminOnboardingModal onRequestClose={props.onClose} isDirty={props.isDirty}>
      <div>wizard contents</div>
    </AdminOnboardingModal>,
  );
}

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
    const { container } = renderModal({ isDirty: false, onClose });
    const backdrop = container.querySelector(".admin-onboarding-modal__backdrop");
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
