import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef, type MutableRefObject } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  lifecycleConfirmCopy,
  openAlreadyExistsMessage,
  SELECTABLE_REVERSE_REASON_OPTIONS,
} from "../../model/host-session-lifecycle-model";
import { SessionLifecycleConfirmDialog } from "./session-lifecycle-confirm-dialog";

const copy = lifecycleConfirmCopy("reopen");
const openCopy = lifecycleConfirmCopy("open");
const reverseKinds = ["reopen", "unpublish", "return-to-draft"] as const;

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

  it("labels the dialog from open copy", () => {
    renderDialog({ copy: openCopy });

    expect(screen.getByRole("dialog", { name: "멤버에게 열기" })).toBeVisible();
    expect(screen.getByText("멤버 참석과 질문이 시작됩니다.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "멤버에게 열기" })).toHaveClass("btn", "btn-primary", "btn-sm");
    expect(screen.queryByLabelText("변경 사유")).not.toBeInTheDocument();
  });

  it("calls onConfirm from the primary confirm button for a forward action", async () => {
    const user = userEvent.setup();
    const { onConfirm, onClose } = renderDialog({ copy: openCopy });

    const confirm = screen.getByRole("button", { name: openCopy.confirmLabel });
    expect(confirm).toHaveClass("btn", "btn-primary", "btn-sm");
    expect(confirm).not.toHaveStyle({ background: "var(--danger)" });

    await user.click(confirm);

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("calls onClose from Escape without confirming", async () => {
    const user = userEvent.setup();
    const { onConfirm, onClose } = renderDialog();

    await user.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("calls onClose from the cancel button without confirming", async () => {
    const user = userEvent.setup();
    const { onConfirm, onClose } = renderDialog();

    await user.click(screen.getByRole("button", { name: "취소" }));

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
    expect(screen.getByRole("link", { name: "진행 중인 모임 열기" })).toHaveAttribute(
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
    const { unmount } = renderDialog({ copy: openCopy, restoreFocusRef });

    const cancel = screen.getByRole("button", { name: "취소" });
    const confirm = screen.getByRole("button", { name: openCopy.confirmLabel });
    expect(cancel).toHaveFocus();

    await user.tab();
    expect(confirm).toHaveFocus();
    await user.tab();
    expect(cancel).toHaveFocus();

    unmount();
    expect(trigger).toHaveFocus();
    expect(restoreFocusRef.current).toBeNull();
  });

  it("includes the recovery link in the tab cycle", async () => {
    const user = userEvent.setup();
    renderDialog({
      copy: openCopy,
      errorMessage: openAlreadyExistsMessage(),
      openSessionHref: "/app/host/sessions/session-open/edit",
    });

    const cancel = screen.getByRole("button", { name: "취소" });
    const confirm = screen.getByRole("button", { name: openCopy.confirmLabel });
    const link = screen.getByRole("link", { name: "진행 중인 모임 열기" });
    expect(cancel).toHaveFocus();

    await user.tab();
    expect(confirm).toHaveFocus();
    await user.tab();
    expect(link).toHaveFocus();
    await user.tab();
    expect(cancel).toHaveFocus();
  });

  it.each(reverseKinds)("requires a selectable reverse reason before confirming %s", async (kind) => {
    const user = userEvent.setup();
    const dialogCopy = lifecycleConfirmCopy(kind);
    const { onConfirm } = renderDialog({ copy: dialogCopy });

    const dialog = screen.getByRole("dialog", { name: dialogCopy.title });
    const reason = within(dialog).getByLabelText("변경 사유");
    expect(reason.tagName).toBe("SELECT");
    expect(within(reason).queryByRole("option", { name: "이전 클라이언트에서 사유 없이 변경됨" }))
      .not.toBeInTheDocument();
    expect(within(reason).queryByRole("option", { name: "LEGACY_UNSPECIFIED" })).not.toBeInTheDocument();
    expect(SELECTABLE_REVERSE_REASON_OPTIONS.map((option) => option.code)).toEqual([
      "ACCIDENTAL_TRANSITION",
      "MEETING_RESCHEDULED",
      "CONTENT_CORRECTION",
      "OPERATIONAL_RECOVERY",
      "OTHER_OPERATIONAL_REASON",
    ]);
    for (const option of SELECTABLE_REVERSE_REASON_OPTIONS) {
      expect(within(reason).getByRole("option", { name: option.label })).toHaveValue(option.code);
    }

    await user.click(within(dialog).getByRole("button", { name: dialogCopy.confirmLabel }));

    expect(onConfirm).not.toHaveBeenCalled();
    expect(within(dialog).getByRole("alert")).toHaveTextContent("사유를 선택해 주세요");
    expect(reason).toHaveFocus();
  });

  it("sends a trimmed reverse request and remaining note count", async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderDialog();
    const dialog = screen.getByRole("dialog", { name: copy.title });

    await user.selectOptions(within(dialog).getByLabelText("변경 사유"), "MEETING_RESCHEDULED");
    const note = within(dialog).getByLabelText("설명 (선택)");
    expect(note.tagName).toBe("TEXTAREA");
    expect(within(dialog).getByText("남은 글자 500")).toBeVisible();
    await user.type(note, "  moved online  ");
    expect(within(dialog).getByText("남은 글자 484")).toBeVisible();

    await user.click(within(dialog).getByRole("button", { name: copy.confirmLabel }));

    expect(onConfirm).toHaveBeenCalledWith({
      reasonCode: "MEETING_RESCHEDULED",
      reasonNote: "moved online",
    });
  });

  it("omits a blank reverse note from the confirmed request", async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderDialog();
    const dialog = screen.getByRole("dialog", { name: copy.title });

    await user.selectOptions(within(dialog).getByLabelText("변경 사유"), "ACCIDENTAL_TRANSITION");
    await user.type(within(dialog).getByLabelText("설명 (선택)"), "   ");
    await user.click(within(dialog).getByRole("button", { name: copy.confirmLabel }));

    expect(onConfirm).toHaveBeenCalledWith({ reasonCode: "ACCIDENTAL_TRANSITION" });
  });

  it("rejects an oversized reverse note without calling onConfirm", async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderDialog();
    const dialog = screen.getByRole("dialog", { name: copy.title });
    const note = within(dialog).getByLabelText("설명 (선택)");

    await user.selectOptions(within(dialog).getByLabelText("변경 사유"), "CONTENT_CORRECTION");
    await user.click(note);
    await user.paste("x".repeat(501));
    await user.click(within(dialog).getByRole("button", { name: copy.confirmLabel }));

    expect(onConfirm).not.toHaveBeenCalled();
    expect(within(dialog).getByRole("alert")).toHaveTextContent("설명은 500자까지입니다");
    expect(note).toHaveFocus();
  });

  it("rejects control characters in the reverse note", async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderDialog();
    const dialog = screen.getByRole("dialog", { name: copy.title });
    const note = within(dialog).getByLabelText("설명 (선택)");

    await user.selectOptions(within(dialog).getByLabelText("변경 사유"), "OPERATIONAL_RECOVERY");
    await user.click(note);
    await user.paste("ok\u0001nope");
    await user.click(within(dialog).getByRole("button", { name: copy.confirmLabel }));

    expect(onConfirm).not.toHaveBeenCalled();
    expect(within(dialog).getByRole("alert")).toHaveTextContent("설명에 사용할 수 없는 문자가 있습니다");
    expect(note).toHaveFocus();
  });

  it("keeps selected reverse values and dialog focus after a server error", async () => {
    const user = userEvent.setup();
    const { rerender, onConfirm, restoreFocusRef } = renderDialog();
    const dialog = screen.getByRole("dialog", { name: copy.title });

    await user.selectOptions(within(dialog).getByLabelText("변경 사유"), "OTHER_OPERATIONAL_REASON");
    await user.type(within(dialog).getByLabelText("설명 (선택)"), "keep this note");
    await user.click(within(dialog).getByRole("button", { name: copy.confirmLabel }));
    expect(onConfirm).toHaveBeenCalledWith({
      reasonCode: "OTHER_OPERATIONAL_REASON",
      reasonNote: "keep this note",
    });

    rerender(
      <SessionLifecycleConfirmDialog
        copy={copy}
        errorMessage="요청을 처리하지 못했습니다. 네트워크 연결을 확인한 뒤 다시 시도해 주세요"
        openSessionHref={null}
        submitting={false}
        restoreFocusRef={restoreFocusRef}
        onClose={vi.fn()}
        onConfirm={onConfirm}
      />,
    );

    const stillOpen = screen.getByRole("dialog", { name: copy.title });
    expect(within(stillOpen).getByLabelText("변경 사유")).toHaveValue("OTHER_OPERATIONAL_REASON");
    expect(within(stillOpen).getByLabelText("설명 (선택)")).toHaveValue("keep this note");
    expect(within(stillOpen).getByRole("alert")).toHaveTextContent("요청을 처리하지 못했습니다");
    expect(stillOpen.contains(document.activeElement)).toBe(true);
    expect(within(stillOpen).getByRole("button", { name: "취소" })).not.toHaveFocus();
  });
});

function renderDialog({
  copy: dialogCopy = copy,
  errorMessage = null,
  openSessionHref = null,
  submitting = false,
  restoreFocusRef = createRef<HTMLElement | null>(),
  onClose = vi.fn(),
  onConfirm = vi.fn(),
}: {
  copy?: typeof copy;
  errorMessage?: string | null;
  openSessionHref?: string | null;
  submitting?: boolean;
  restoreFocusRef?: MutableRefObject<HTMLElement | null>;
  onClose?: () => void;
  onConfirm?: (request?: { reasonCode: string; reasonNote?: string }) => void;
} = {}) {
  const view = render(
    <SessionLifecycleConfirmDialog
      copy={dialogCopy}
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
