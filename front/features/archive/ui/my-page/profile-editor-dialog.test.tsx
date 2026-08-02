import { render, screen, waitFor, within } from "@testing-library/react";
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
    expect(screen.getByRole("heading", { name: "변경사항을 버릴까요?" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "계속 편집" }));
    expect(screen.getByRole("textbox", { name: "표시 이름" })).toHaveValue("멤버1 변경");
    await user.click(screen.getByRole("button", { name: "프로필 편집 닫기" }));
    await user.click(screen.getByRole("button", { name: "변경사항 버리기" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["displayName", "같은 클럽에서 이미 쓰고 있는 이름입니다.", "textbox"],
    ["avatarKey", "선택한 아바타를 사용할 수 없습니다.", "avatar"],
    ["form", "프로필을 저장하지 못했습니다.", "form"],
  ] as const)("keeps the draft and exposes a %s error", async (field, message, target) => {
    const user = userEvent.setup();
    renderEditor({ onSaveProfile: vi.fn().mockRejectedValue(new ProfileUpdateFailure(message, null, field)) });
    const input = screen.getByRole("textbox", { name: "표시 이름" });
    await user.clear(input);
    await user.type(input, "새 멤버");
    await user.click(screen.getByRole("button", { name: "변경사항 저장" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(message);
    expect(input).toHaveValue("새 멤버");
    if (target === "textbox") expect(input).toHaveAttribute("aria-describedby", alert.id);
    if (target === "form") expect(screen.getByRole("button", { name: "변경사항 저장" })).toHaveFocus();
    if (target === "avatar") expect(screen.getByRole("group", { name: "아바타 목록" })).toHaveAttribute("aria-describedby", alert.id);
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
});
