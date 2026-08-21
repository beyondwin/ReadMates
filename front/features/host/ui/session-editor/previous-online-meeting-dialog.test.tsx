import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef, type MutableRefObject } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PreviousOnlineMeetingDialog } from "./previous-online-meeting-dialog";

afterEach(() => {
  document.body.replaceChildren();
});

describe("PreviousOnlineMeetingDialog", () => {
  it("shows the previous URL and masked passcode presence without passcode plaintext", () => {
    renderDialog();

    const dialog = screen.getByRole("dialog", { name: "이전 온라인 모임 정보" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByText("https://meeting.invalid/club")).toBeInTheDocument();
    expect(screen.getByText("있음")).toBeInTheDocument();
    expect(screen.queryByText("room-code-2048")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "취소" })).toHaveFocus();
  });

  it("shows 없음 when the previous meeting has no passcode", () => {
    renderDialog({
      previous: { meetingUrl: "https://meeting.invalid/club", meetingPasscode: null },
    });

    expect(screen.getByText("없음")).toBeInTheDocument();
    expect(screen.queryByText("있음")).not.toBeInTheDocument();
  });

  it("adopts the previous url and passcode, using an empty passcode when absent", async () => {
    const user = userEvent.setup();
    const { onAdopt, onClose } = renderDialog({
      previous: { meetingUrl: "https://meeting.invalid/club", meetingPasscode: null },
    });

    await user.click(screen.getByRole("button", { name: "현재 모임에 적용" }));

    expect(onAdopt).toHaveBeenCalledWith({
      meetingUrl: "https://meeting.invalid/club",
      meetingPasscode: "",
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("adopts a present passcode without displaying it", async () => {
    const user = userEvent.setup();
    const { onAdopt } = renderDialog();

    await user.click(screen.getByRole("button", { name: "현재 모임에 적용" }));

    expect(onAdopt).toHaveBeenCalledWith({
      meetingUrl: "https://meeting.invalid/club",
      meetingPasscode: "room-code-2048",
    });
    expect(screen.queryByText("room-code-2048")).not.toBeInTheDocument();
  });

  it("closes from 취소 without adopting", async () => {
    const user = userEvent.setup();
    const { onAdopt, onClose } = renderDialog();

    await user.click(screen.getByRole("button", { name: "취소" }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onAdopt).not.toHaveBeenCalled();
  });

  it("traps tab focus and restores the trigger on close", async () => {
    const user = userEvent.setup();
    const trigger = document.createElement("button");
    trigger.type = "button";
    document.body.append(trigger);
    const restoreFocusRef: MutableRefObject<HTMLElement | null> = { current: trigger };
    const { unmount } = renderDialog({ restoreFocusRef });

    const cancel = screen.getByRole("button", { name: "취소" });
    const confirm = screen.getByRole("button", { name: "현재 모임에 적용" });
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
  previous = {
    meetingUrl: "https://meeting.invalid/club",
    meetingPasscode: "room-code-2048",
  },
  restoreFocusRef = createRef<HTMLElement | null>(),
  onClose = vi.fn(),
  onAdopt = vi.fn(),
}: {
  previous?: { meetingUrl: string; meetingPasscode: string | null };
  restoreFocusRef?: MutableRefObject<HTMLElement | null>;
  onClose?: () => void;
  onAdopt?: (next: { meetingUrl: string; meetingPasscode: string }) => void;
} = {}) {
  const view = render(
    <PreviousOnlineMeetingDialog
      previous={previous}
      restoreFocusRef={restoreFocusRef}
      onClose={onClose}
      onAdopt={onAdopt}
    />,
  );

  return { ...view, onClose, onAdopt, restoreFocusRef };
}
