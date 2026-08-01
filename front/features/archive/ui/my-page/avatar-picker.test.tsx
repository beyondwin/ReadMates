import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AvatarPicker } from "./avatar-picker";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function renderPicker({
  avatarKey = "squirrel-acorn",
  canEditProfile = true,
  onUpdateAvatar = vi.fn().mockResolvedValue({ avatarKey: "hedgehog-green-mug" }),
}: {
  avatarKey?: string;
  canEditProfile?: boolean;
  onUpdateAvatar?: ReturnType<typeof vi.fn>;
} = {}) {
  return {
    ...render(
      <AvatarPicker
        avatarKey={avatarKey}
        canEditProfile={canEditProfile}
        onUpdateAvatar={onUpdateAvatar}
      />,
    ),
    onUpdateAvatar,
  };
}

async function openPicker(user = userEvent.setup()) {
  const opener = screen.getByRole("button", { name: "아바타 바꾸기" });
  await user.click(opener);
  return {
    user,
    opener,
    dialog: screen.getByRole("dialog", { name: "나의 아바타 선택" }),
  };
}

describe("AvatarPicker", () => {
  it("uses one labelled opener focus stop with the avatar, pencil, and visible action text", () => {
    const { container } = renderPicker();
    const opener = screen.getByRole("button", { name: "아바타 바꾸기" });

    expect(opener).toBeVisible();
    expect(opener).toHaveTextContent("아바타 바꾸기");
    expect(opener.querySelector("img")).toHaveAttribute(
      "src",
      "/assets/avatars/book-club/squirrel-acorn.webp",
    );
    expect(opener.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelectorAll("button")).toHaveLength(1);
  });

  it("renders 40 labelled choices and keeps selection local until an explicit changed-key save", async () => {
    const onUpdateAvatar = vi.fn().mockResolvedValue({ avatarKey: "hedgehog-green-mug" });
    renderPicker({ onUpdateAvatar });
    const { user, opener, dialog } = await openPicker();
    const save = within(dialog).getByRole("button", { name: "이 아바타로 변경" });

    expect(within(dialog).getAllByRole("button", { name: /선택$/ })).toHaveLength(40);
    expect(save).toBeDisabled();

    await user.click(
      within(dialog).getByRole("button", {
        name: "초록 찻잔을 든 고슴도치 선택",
      }),
    );

    expect(save).toBeEnabled();
    expect(onUpdateAvatar).not.toHaveBeenCalled();
    expect(opener.querySelector("img")).toHaveAttribute(
      "src",
      "/assets/avatars/book-club/squirrel-acorn.webp",
    );

    await user.click(save);

    expect(onUpdateAvatar).toHaveBeenCalledTimes(1);
    expect(onUpdateAvatar).toHaveBeenCalledWith("hedgehog-green-mug");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(opener).toHaveFocus();
  });

  it("marks the current draft with aria-pressed and a visible check", async () => {
    renderPicker();
    const { user, dialog } = await openPicker();
    const current = within(dialog).getByRole("button", {
      name: "도토리를 든 다람쥐 선택",
    });
    const next = within(dialog).getByRole("button", {
      name: "초록 찻잔을 든 고슴도치 선택",
    });

    expect(current).toHaveAttribute("aria-pressed", "true");
    expect(current.querySelector(".rm-avatar-picker__check")).toBeVisible();
    expect(next).toHaveAttribute("aria-pressed", "false");

    await user.click(next);

    expect(current).toHaveAttribute("aria-pressed", "false");
    expect(current.querySelector(".rm-avatar-picker__check")).toBeNull();
    expect(next).toHaveAttribute("aria-pressed", "true");
    expect(next.querySelector(".rm-avatar-picker__check")).toBeVisible();
  });

  it.each([
    ["cancel", async (user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement) => {
      await user.click(within(dialog).getByRole("button", { name: "취소" }));
    }],
    ["Escape", async (user: ReturnType<typeof userEvent.setup>) => {
      await user.keyboard("{Escape}");
    }],
    ["backdrop", async (user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement) => {
      await user.click(dialog.parentElement!);
    }],
  ])("%s dismisses without saving and returns focus", async (_name, dismiss) => {
    const onUpdateAvatar = vi.fn();
    renderPicker({ onUpdateAvatar });
    const { user, opener, dialog } = await openPicker();

    await user.click(
      within(dialog).getByRole("button", {
        name: "초록 찻잔을 든 고슴도치 선택",
      }),
    );
    await dismiss(user, dialog);

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onUpdateAvatar).not.toHaveBeenCalled();
    expect(opener).toHaveFocus();
  });

  it("wraps Tab and Shift+Tab within the dialog", async () => {
    renderPicker();
    const { user, dialog } = await openPicker();
    const focusables = within(dialog)
      .getAllByRole("button")
      .filter((button) => !button.hasAttribute("disabled"));
    const first = focusables[0];
    const last = focusables.at(-1)!;

    first.focus();
    await user.tab({ shift: true });
    expect(last).toHaveFocus();

    last.focus();
    await user.tab();
    expect(first).toHaveFocus();
  });

  it("locks every action while saving and ignores Escape and double submit", async () => {
    const pendingSave = deferred<{ avatarKey: string }>();
    const onUpdateAvatar = vi.fn(() => pendingSave.promise);
    renderPicker({ onUpdateAvatar });
    const { user, dialog } = await openPicker();
    await user.click(
      within(dialog).getByRole("button", {
        name: "초록 찻잔을 든 고슴도치 선택",
      }),
    );
    const save = within(dialog).getByRole("button", { name: "이 아바타로 변경" });

    await user.click(save);
    await user.click(save);
    await user.keyboard("{Escape}");

    expect(onUpdateAvatar).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog", { name: "나의 아바타 선택" })).toBeVisible();
    expect(within(dialog).getByRole("button", { name: "변경 중…" })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "취소" })).toBeDisabled();
    for (const tile of within(dialog).getAllByRole("button", { name: /선택$/ })) {
      expect(tile).toBeDisabled();
    }

    pendingSave.resolve({ avatarKey: "hedgehog-green-mug" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("keeps the source avatar and selected draft after failure, then permits retry", async () => {
    const onUpdateAvatar = vi
      .fn()
      .mockRejectedValueOnce(new Error("temporary failure"))
      .mockResolvedValueOnce({ avatarKey: "hedgehog-green-mug" });
    renderPicker({ onUpdateAvatar });
    const { user, opener, dialog } = await openPicker();
    const next = within(dialog).getByRole("button", {
      name: "초록 찻잔을 든 고슴도치 선택",
    });

    await user.click(next);
    await user.click(within(dialog).getByRole("button", { name: "이 아바타로 변경" }));

    const alert = await within(dialog).findByRole("alert");
    expect(alert).toHaveTextContent("아바타를 변경하지 못했습니다. 다시 시도해 주세요.");
    expect(next).toHaveAttribute("aria-pressed", "true");
    expect(opener.querySelector("img")).toHaveAttribute(
      "src",
      "/assets/avatars/book-club/squirrel-acorn.webp",
    );

    await user.click(within(dialog).getByRole("button", { name: "이 아바타로 변경" }));

    expect(onUpdateAvatar).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(opener).toHaveFocus();
  });

  it("renders a decorative avatar without an opener when profile editing is unavailable", () => {
    const { container } = renderPicker({ canEditProfile: false });

    expect(screen.queryByRole("button", { name: "아바타 바꾸기" })).toBeNull();
    expect(container.querySelector(".rm-avatar-picker--decorative .rm-avatar-chip img")).toHaveAttribute(
      "src",
      "/assets/avatars/book-club/squirrel-acorn.webp",
    );
  });
});
