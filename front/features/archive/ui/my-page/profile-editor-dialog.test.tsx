import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ProfileUpdateFailure } from "@/features/archive/model/profile-update";
import { ProfileEditorDialog } from "./profile-editor-dialog";

const profile = { displayName: "멤버1", avatarKey: "banana-green-book" as const };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function renderEditor(overrides: Partial<React.ComponentProps<typeof ProfileEditorDialog>> = {}) {
  const opener = document.createElement("button");
  opener.textContent = "프로필 편집";
  document.body.append(opener);
  opener.focus();
  const onClose = vi.fn();
  const onSaveProfile = vi.fn(async (draft) => ({ ...draft, accountName: "member-one" }));
  render(<ProfileEditorDialog profile={profile} opener={opener} onClose={onClose} onSaveProfile={onSaveProfile} {...overrides} />);
  return { opener, onClose, onSaveProfile };
}

describe("ProfileEditorDialog", () => {
  it("focuses the name input initially even when mobile-back is CSS-hidden", () => {
    renderEditor();
    const mobileBack = screen.getByRole("button", { name: "프로필 편집 뒤로" });
    Object.defineProperty(mobileBack, "getClientRects", { value: () => [] });
    expect(screen.getByRole("textbox", { name: "표시 이름" })).toHaveFocus();
  });

  it("initializes one atomic draft and saves both fields only from the final action", async () => {
    const user = userEvent.setup();
    const { onSaveProfile, onClose, opener } = renderEditor();
    const dialog = screen.getByRole("dialog", { name: "프로필 편집" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleDescription();
    const input = within(dialog).getByRole("textbox", { name: "표시 이름" });
    expect(input).toHaveValue("멤버1");
    await user.clear(input);
    await user.type(input, "새 멤버");
    await user.click(within(dialog).getByRole("button", { name: "아바타 선택" }));
    await user.click(within(dialog).getByRole("button", { name: "초록 책을 읽는 구름 선택" }));
    expect(onSaveProfile).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "프로필로 돌아가기" }));
    await user.click(within(dialog).getByRole("button", { name: "변경사항 저장" }));
    expect(onSaveProfile).toHaveBeenCalledTimes(1);
    expect(onSaveProfile).toHaveBeenCalledWith({ displayName: "새 멤버", avatarKey: "cloud-green-book" });
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(opener).toHaveFocus();
  });

  it("locks controls and prevents duplicate saves", async () => {
    const pending = deferred<{ displayName: string; avatarKey: "banana-green-book"; accountName: string }>();
    const save = vi.fn(() => pending.promise);
    const user = userEvent.setup();
    renderEditor({ onSaveProfile: save });
    const action = screen.getByRole("button", { name: "변경사항 저장" });
    await user.click(action);
    await user.click(action);
    await user.keyboard("{Escape}");
    expect(save).toHaveBeenCalledTimes(1);
    expect(action).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "표시 이름" })).toBeDisabled();
    expect(screen.getByRole("dialog")).toBeVisible();
    pending.resolve({ ...profile, accountName: "member-one" });
  });

  it.each(["Escape", "backdrop", "close"])("closes a pristine draft by %s", async (method) => {
    const user = userEvent.setup();
    const { onClose } = renderEditor();
    if (method === "Escape") await user.keyboard("{Escape}");
    if (method === "backdrop") await user.click(screen.getByTestId("profile-editor-scrim"));
    if (method === "close") await user.click(screen.getByRole("button", { name: "프로필 편집 닫기" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("routes every dirty dismissal through discard confirmation and can continue editing", async () => {
    const user = userEvent.setup();
    const { onClose } = renderEditor();
    await user.type(screen.getByRole("textbox", { name: "표시 이름" }), " 변경");
    await user.keyboard("{Escape}");
    const discardHeading = screen.getByRole("heading", { name: "변경사항을 버릴까요?" });
    expect(discardHeading).toBeVisible();
    expect(screen.getByRole("button", { name: "계속 편집" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "계속 편집" }));
    expect(screen.getByRole("textbox", { name: "표시 이름" })).toHaveValue("멤버1 변경");
    expect(screen.getByRole("textbox", { name: "표시 이름" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "프로필 편집 닫기" }));
    await user.click(screen.getByRole("button", { name: "변경사항 버리기" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it.each(["backdrop", "mobile-back", "cancel"])("routes dirty %s dismissal through discard", async (method) => {
    const user = userEvent.setup();
    const { onClose } = renderEditor();
    await user.type(screen.getByRole("textbox", { name: "표시 이름" }), " 변경");
    if (method === "backdrop") await user.click(screen.getByTestId("profile-editor-scrim"));
    if (method === "mobile-back") await user.click(screen.getByRole("button", { name: "프로필 편집 뒤로" }));
    if (method === "cancel") await user.click(screen.getByRole("button", { name: "취소" }));
    expect(screen.getByRole("heading", { name: "변경사항을 버릴까요?" })).toBeVisible();
    expect(onClose).not.toHaveBeenCalled();
  });

  it.each([
    ["close", "프로필 편집 닫기"],
    ["cancel", "취소"],
    ["mobile-back", "프로필 편집 뒤로"],
  ])("restores the recreated logical %s control after continuing", async (_method, label) => {
    const user = userEvent.setup();
    renderEditor();
    await user.type(screen.getByRole("textbox", { name: "표시 이름" }), " 변경");
    const original = screen.getByRole("button", { name: label });
    await user.click(original);
    await user.click(screen.getByRole("button", { name: "계속 편집" }));
    const recreated = screen.getByRole("button", { name: label });
    expect(recreated).toHaveFocus();
  });

  it.each([
    ["displayName", "같은 클럽에서 이미 쓰고 있는 이름입니다.", "textbox"],
    ["avatarKey", "선택한 아바타를 사용할 수 없습니다.", "avatar"],
    ["form", "프로필을 저장하지 못했습니다.", "form"],
  ] as const)("keeps the draft and exposes a %s error", async (field, message, target) => {
    const user = userEvent.setup();
    renderEditor({ onSaveProfile: vi.fn().mockRejectedValue(new ProfileUpdateFailure(message, null, field)) });
    const input = screen.getByRole("textbox", { name: "표시 이름" });
    const scrollBody = document.querySelector<HTMLElement>(".rm-profile-editor__body")!;
    scrollBody.scrollTop = 48;
    await user.clear(input);
    await user.type(input, "새 멤버");
    await user.click(screen.getByRole("button", { name: "변경사항 저장" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(message);
    expect(input).toHaveValue("새 멤버");
    if (target === "textbox") expect(input).toHaveAttribute("aria-describedby", alert.id);
    if (target === "form") expect(screen.getByRole("button", { name: "변경사항 저장" })).toHaveFocus();
    if (target === "avatar") {
      expect(screen.getByRole("dialog", { name: "프로필 편집" })).toBeVisible();
      expect(screen.getByRole("button", { name: "아바타 선택" })).toHaveAttribute("aria-describedby", alert.id);
      expect(screen.getByRole("button", { name: "아바타 선택" })).toHaveFocus();
      expect(scrollBody.scrollTop).toBe(48);
    }
  });

  it("wraps keyboard focus inside the dialog", async () => {
    const user = userEvent.setup();
    renderEditor();
    const dialog = screen.getByRole("dialog");
    const buttons = within(dialog).getAllByRole("button").filter((button) => !button.hasAttribute("disabled"));
    const last = buttons.at(-1)!;
    last.focus();
    await user.tab();
    expect(dialog.contains(document.activeElement)).toBe(true);
    await user.tab({ shift: true });
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it("recovers focus when a DOM transition leaves focus outside the dialog", async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.type(screen.getByRole("textbox", { name: "표시 이름" }), " 변경");
    await user.keyboard("{Escape}");
    const outsider = document.createElement("button");
    document.body.append(outsider);
    outsider.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(screen.getByRole("button", { name: "계속 편집" })).toHaveFocus();
  });
});
