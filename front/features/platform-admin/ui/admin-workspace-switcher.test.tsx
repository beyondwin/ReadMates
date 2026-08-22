import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import type { AdminWorkspaceDestination } from "@/features/platform-admin/model/admin-workspace-switcher-model";
import { AdminWorkspaceSwitcher } from "./admin-workspace-switcher";

const destinations: AdminWorkspaceDestination[] = [
  {
    id: "membership-host:host",
    clubName: "읽는사이",
    clubSlug: "reading-sai",
    role: "HOST",
    status: "ACTIVE",
    label: "호스트 공간",
    href: "/clubs/reading-sai/app/host",
    priority: "primary",
  },
  {
    id: "membership-host:member",
    clubName: "읽는사이",
    clubSlug: "reading-sai",
    role: "HOST",
    status: "ACTIVE",
    label: "멤버 공간",
    href: "/clubs/reading-sai/app",
    priority: "secondary",
  },
];

function renderSwitcher(overrides: Partial<ComponentProps<typeof AdminWorkspaceSwitcher>> = {}) {
  const onOtherAccountLogin = overrides.onOtherAccountLogin ?? vi.fn(async () => true);
  return render(
    <MemoryRouter>
      <AdminWorkspaceSwitcher
        accountLabel="operator@example.com"
        destinations={destinations}
        onOtherAccountLogin={onOtherAccountLogin}
        {...overrides}
      />
      <button type="button">바깥 작업</button>
    </MemoryRouter>,
  );
}

async function openWithKey(key: "{Enter}" | "{ }" | "{ArrowDown}") {
  const user = userEvent.setup();
  renderSwitcher();
  const trigger = screen.getByRole("button", { name: "내 공간" });
  trigger.focus();
  await user.keyboard(key);
  return { user, trigger };
}

describe("AdminWorkspaceSwitcher", () => {
  it("opens a menu with host and member workspace destinations", () => {
    renderSwitcher();

    fireEvent.click(screen.getByRole("button", { name: "내 공간" }));

    expect(screen.getByText("내 ReadMates 공간")).toBeInTheDocument();
    expect(screen.getByText("operator@example.com")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "읽는사이 호스트 공간" })).toHaveAttribute(
      "href",
      "/clubs/reading-sai/app/host",
    );
    expect(screen.getByRole("menuitem", { name: "읽는사이 멤버 공간" })).toHaveAttribute(
      "href",
      "/clubs/reading-sai/app",
    );
    expect(screen.getAllByText("HOST").length).toBeGreaterThan(0);
  });

  it("shows an empty state for accounts without workspace destinations", () => {
    renderSwitcher({ destinations: [] });

    fireEvent.click(screen.getByRole("button", { name: "내 공간" }));

    expect(screen.getByText("이 계정으로 열 수 있는 클럽이 없습니다.")).toBeInTheDocument();
  });

  it("keeps the menu open and shows a local error when other-account login fails", async () => {
    const onOtherAccountLogin = vi.fn(async () => false);
    renderSwitcher({ onOtherAccountLogin });

    fireEvent.click(screen.getByRole("button", { name: "내 공간" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "다른 계정으로 로그인" }));

    await waitFor(() => {
      expect(onOtherAccountLogin).toHaveBeenCalledTimes(1);
      expect(screen.getByRole("alert")).toHaveTextContent("로그아웃에 실패했습니다. 다시 시도해 주세요.");
    });
  });

  it("opens from Enter, Space, and ArrowDown and focuses the first item", async () => {
    const { trigger: enterTrigger } = await openWithKey("{Enter}");
    expect(enterTrigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("menuitem", { name: "읽는사이 호스트 공간" })).toHaveFocus();
  });

  it("opens from Space and focuses the first item", async () => {
    await openWithKey("{ }");
    expect(screen.getByRole("menuitem", { name: "읽는사이 호스트 공간" })).toHaveFocus();
  });

  it("opens from ArrowDown and focuses the first item", async () => {
    await openWithKey("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "읽는사이 호스트 공간" })).toHaveFocus();
  });

  it("moves roving focus with arrows, Home, and End", async () => {
    const { user } = await openWithKey("{Enter}");
    const host = screen.getByRole("menuitem", { name: "읽는사이 호스트 공간" });
    const member = screen.getByRole("menuitem", { name: "읽는사이 멤버 공간" });
    const otherAccount = screen.getByRole("menuitem", { name: "다른 계정으로 로그인" });

    expect(host).toHaveFocus();
    expect(host).toHaveAttribute("tabindex", "0");
    expect(member).toHaveAttribute("tabindex", "-1");

    await user.keyboard("{ArrowDown}");
    expect(member).toHaveFocus();
    await user.keyboard("{End}");
    expect(otherAccount).toHaveFocus();
    await user.keyboard("{Home}");
    expect(host).toHaveFocus();
    await user.keyboard("{ArrowUp}");
    expect(otherAccount).toHaveFocus();
  });

  it("closes on Escape and returns focus to the trigger", async () => {
    const { user, trigger } = await openWithKey("{Enter}");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("closes on outside click and returns focus to the trigger", async () => {
    const user = userEvent.setup();
    renderSwitcher();
    const trigger = screen.getByRole("button", { name: "내 공간" });
    await user.click(trigger);
    expect(screen.getByRole("menu", { name: "내 ReadMates 공간" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "바깥 작업" }));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("does not leave focusable hidden items in the document when closed", () => {
    renderSwitcher();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /읽는사이/ })).not.toBeInTheDocument();
  });
});
