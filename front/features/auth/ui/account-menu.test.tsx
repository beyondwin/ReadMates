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
        membershipLabel="정식 멤버"
        mySpaceHref="/app/me"
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
  it("opens from the account trigger, preserves natural tab order, and returns focus after Escape", async () => {
    const user = userEvent.setup();
    renderMenu();
    const trigger = screen.getByRole("button", { name: "멤버1 계정 메뉴" });

    await user.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const menu = screen.getByRole("menu");
    expect(menu).toBeVisible();
    expect(within(menu).getByRole("link", { name: "내 공간" })).toHaveAttribute("href", "/app/me");
    expect(within(menu).getByRole("link", { name: "계정 관리" })).toHaveAttribute("href", "/app/me/settings");

    await user.tab();
    expect(within(menu).getByRole("link", { name: "내 공간" })).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it("dismisses when a pointer starts outside the account control", async () => {
    const user = userEvent.setup();
    renderMenu();
    const trigger = screen.getByRole("button", { name: "멤버1 계정 메뉴" });

    await user.click(trigger);
    expect(screen.getByRole("menu")).toBeVisible();

    await user.pointer({ keys: "[MouseLeft]", target: screen.getByRole("button", { name: "바깥 작업" }) });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it("keeps long Korean and English member names in a wrapping identity block", async () => {
    const user = userEvent.setup();
    const longName = "아주 긴 한국어 이름과 An exceptionally long English member name";
    renderMenu(longName);

    await user.click(screen.getByRole("button", { name: `${longName} 계정 메뉴` }));

    const identity = screen.getByText(longName);
    expect(identity).toHaveClass("rm-account-menu__member-name");
    expect(identity.parentElement).toHaveClass("rm-account-menu__identity");
    expect(screen.getByText("정식 멤버")).toBeVisible();
  });
});
