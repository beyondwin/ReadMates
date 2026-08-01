import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { AccountMenu } from "./account-menu";

function TestLink({ to, children, ...props }: ComponentProps<"a"> & { to: string }) {
  return (
    <a {...props} href={to}>
      {children}
    </a>
  );
}

function renderMenu(memberName = "멤버1") {
  return render(
    <>
      <AccountMenu
        memberName={memberName}
        avatarKey="reading-lamp"
        membershipLabel="정식 멤버"
        notificationsHref="/app/notifications"
        settingsHref="/app/me/settings"
        LinkComponent={TestLink}
        LogoutControl={<button type="button">로그아웃</button>}
      />
      <button type="button">바깥 작업</button>
    </>,
  );
}

afterEach(cleanup);

describe("AccountMenu", () => {
  it("opens a labelled nonmodal dialog in natural tab order and returns focus after Escape", async () => {
    const user = userEvent.setup();
    renderMenu();
    const trigger = screen.getByRole("button", { name: "멤버1 계정 메뉴" });

    await user.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
    const dialog = screen.getByRole("dialog", { name: "멤버1" });
    expect(dialog).toBeVisible();
    expect(dialog).toHaveAttribute("aria-modal", "false");
    expect(trigger).toHaveAttribute("aria-controls", dialog.id);
    const items = within(dialog).getAllByRole("link");
    expect(items.map((item) => item.textContent)).toEqual(["알림", "계정 설정"]);
    expect(within(dialog).getByRole("link", { name: "알림" })).toHaveAttribute("href", "/app/notifications");
    expect(within(dialog).getByRole("link", { name: "계정 설정" })).toHaveAttribute("href", "/app/me/settings");
    expect(within(dialog).getByRole("button", { name: "로그아웃" })).toBeVisible();
    expect(within(dialog).queryByRole("link", { name: "내 공간" })).toBeNull();
    expect(within(dialog).queryByRole("menuitem")).toBeNull();
    expect(screen.queryByRole("menu")).toBeNull();

    await user.tab();
    expect(within(dialog).getByRole("link", { name: "알림" })).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it("uses one explicit account trigger with a stable accessible name and stateful chevron", async () => {
    const user = userEvent.setup();
    renderMenu();
    const trigger = screen.getByRole("button", { name: "멤버1 계정 메뉴" });

    expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveTextContent("멤버1");
    expect(trigger).toHaveTextContent("계정");
    expect(trigger).toHaveTextContent("▾");
    expect(trigger.querySelector(".rm-avatar-chip img")).toHaveAttribute(
      "src",
      "/assets/avatars/book-club/reading-lamp.webp",
    );

    await user.click(trigger);

    expect(trigger).toHaveAccessibleName("멤버1 계정 메뉴");
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(trigger).toHaveTextContent("▴");
  });

  it("dismisses when a pointer starts outside the account control", async () => {
    const user = userEvent.setup();
    renderMenu();
    const trigger = screen.getByRole("button", { name: "멤버1 계정 메뉴" });

    await user.click(trigger);
    expect(screen.getByRole("dialog", { name: "멤버1" })).toBeVisible();

    await user.pointer({ keys: "[MouseLeft]", target: screen.getByRole("button", { name: "바깥 작업" }) });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it("keeps long Korean and English member names in a wrapping identity block", async () => {
    const user = userEvent.setup();
    const longName = "아주 긴 한국어 이름과 An exceptionally long English member name";
    renderMenu(longName);

    await user.click(screen.getByRole("button", { name: `${longName} 계정 메뉴` }));

    const identity = within(screen.getByRole("dialog", { name: longName })).getByText(longName);
    expect(identity).toHaveClass("rm-account-menu__member-name");
    expect(identity.parentElement).toHaveClass("rm-account-menu__identity");
    expect(screen.getByText("정식 멤버")).toBeVisible();
  });
});
