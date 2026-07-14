import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EvidenceDrawer } from "./EvidenceDrawer";

describe("EvidenceDrawer", () => {
  it("labels the target, traps focus, closes with Escape/backdrop, and restores focus", () => {
    const onClose = vi.fn();
    render(
      <>
        <button type="button">근거 열기</button>
        <EvidenceDrawer open targetLabel="요약 1" onClose={onClose}>
          <button type="button">근거 작업</button>
        </EvidenceDrawer>
      </>,
    );
    const dialog = screen.getByRole("dialog", { name: "요약 1 근거" });
    expect(dialog).toBeInTheDocument();
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.mouseDown(dialog.parentElement as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("restores the previously focused trigger when closed", () => {
    const { rerender } = render(
      <>
        <button type="button">근거 열기</button>
        <EvidenceDrawer open={false} targetLabel="요약 1" onClose={() => {}}>
          내용
        </EvidenceDrawer>
      </>,
    );
    const opener = screen.getByRole("button", { name: "근거 열기" });
    opener.focus();
    rerender(
      <>
        <button type="button">근거 열기</button>
        <EvidenceDrawer open targetLabel="요약 1" onClose={() => {}}>
          내용
        </EvidenceDrawer>
      </>,
    );
    rerender(
      <>
        <button type="button">근거 열기</button>
        <EvidenceDrawer open={false} targetLabel="요약 1" onClose={() => {}}>
          내용
        </EvidenceDrawer>
      </>,
    );
    expect(document.activeElement).toBe(opener);
  });
});
