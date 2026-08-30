import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { HostWorkspaceSwitcher } from "./host-workspace-switcher";

const club = {
  name: "읽는사이",
  slug: "reading-sai",
  avatarKey: "banana-green-book",
};

const clubs = [
  { slug: "reading-sai", name: "읽는사이", href: "/clubs/reading-sai/app" },
  { slug: "next-club", name: "다음 책을 오래 함께 읽는 모임", href: "/clubs/next-club/app" },
];

const workspaceItems = [
  { id: "member" as const, label: "멤버 공간", href: "/clubs/reading-sai/app/archive" },
  { id: "host" as const, label: "호스트 공간", href: "/clubs/reading-sai/app/host/records" },
];

describe("HostWorkspaceSwitcher", () => {
  it("combines club identity and the current workspace into one trigger without an avatar fallback flash", () => {
    const { container } = render(
      <HostWorkspaceSwitcher
        club={club}
        clubs={clubs}
        currentWorkspace="host"
        workspaceItems={workspaceItems}
        onSelectTarget={vi.fn()}
      />,
    );

    expect(screen.getAllByRole("button", { name: "읽는사이 · 호스트 운영실" })).toHaveLength(1);
    expect(container.querySelectorAll("details")).toHaveLength(1);
    expect(container.querySelector(".rm-host-workspace-switcher__trigger img")).toHaveAttribute(
      "src",
      "/assets/avatars/book-club/banana-green-book.webp",
    );
  });

  it("uses the same-club safe workspace target and the target club's precomputed route", async () => {
    const user = userEvent.setup();
    const onSelectTarget = vi.fn();

    render(
      <HostWorkspaceSwitcher
        club={club}
        clubs={[
          clubs[0],
          { ...clubs[1], href: "/clubs/next-club/app/host/records" },
        ]}
        currentWorkspace="host"
        workspaceItems={workspaceItems}
        onSelectTarget={onSelectTarget}
      />,
    );

    await user.click(screen.getByRole("button", { name: "읽는사이 · 호스트 운영실" }));
    const menu = screen.getByRole("navigation", { name: "클럽과 작업 공간 선택" });

    await user.click(within(menu).getByRole("button", { name: "멤버 공간" }));
    expect(onSelectTarget).toHaveBeenLastCalledWith("/clubs/reading-sai/app/archive");

    await user.click(screen.getByRole("button", { name: "읽는사이 · 호스트 운영실" }));
    await user.click(within(menu).getByRole("button", { name: "다음 책을 오래 함께 읽는 모임" }));
    expect(onSelectTarget).toHaveBeenLastCalledWith("/clubs/next-club/app/host/records");
  });

  it("uses each target club's precomputed authority-safe URL", async () => {
    const user = userEvent.setup();
    const onSelectTarget = vi.fn();

    render(
      <HostWorkspaceSwitcher
        club={club}
        clubs={[
          clubs[0],
          { slug: "member-only", name: "멤버 전용 클럽", href: "/clubs/member-only/app" },
          { slug: "host-next", name: "다음 호스트 클럽", href: "/clubs/host-next/app/host/people" },
        ]}
        currentWorkspace="host"
        workspaceItems={workspaceItems}
        onSelectTarget={onSelectTarget}
      />,
    );

    const trigger = screen.getByRole("button", { name: "읽는사이 · 호스트 운영실" });
    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "멤버 전용 클럽" }));
    expect(onSelectTarget).toHaveBeenLastCalledWith("/clubs/member-only/app");

    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "다음 호스트 클럽" }));
    expect(onSelectTarget).toHaveBeenLastCalledWith("/clubs/host-next/app/host/people");
  });

  it("keeps an unavailable host workspace visible with its reason and does not navigate", async () => {
    const user = userEvent.setup();
    const onSelectTarget = vi.fn();

    render(
      <HostWorkspaceSwitcher
        club={club}
        clubs={clubs}
        currentWorkspace="member"
        workspaceItems={workspaceItems}
        disabledReason="이 클럽의 호스트 권한이 없습니다."
        onSelectTarget={onSelectTarget}
      />,
    );

    await user.click(screen.getByRole("button", { name: "읽는사이 · 멤버 공간" }));
    const hostChoice = screen.getByRole("button", { name: "호스트 운영실" });
    expect(hostChoice).toBeDisabled();
    expect(hostChoice).toHaveAccessibleDescription("이 클럽의 호스트 권한이 없습니다.");
    expect(screen.getByText("이 클럽의 호스트 권한이 없습니다.")).toBeVisible();
    await user.click(hostChoice);
    expect(onSelectTarget).not.toHaveBeenCalled();
  });

  it("dismisses the menu with Escape and restores focus to the combined trigger", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <HostWorkspaceSwitcher
        club={club}
        clubs={clubs}
        currentWorkspace="host"
        workspaceItems={workspaceItems}
        onSelectTarget={vi.fn()}
      />,
    );
    const trigger = screen.getByRole("button", { name: "읽는사이 · 호스트 운영실" });

    await user.click(trigger);
    expect(container.querySelector("details")).toHaveAttribute("open");
    await user.keyboard("{Escape}");

    expect(container.querySelector("details")).not.toHaveAttribute("open");
    expect(trigger).toHaveFocus();
  });

  it("keeps labelled relationships unique when responsive shell slots render two switchers", () => {
    const { container } = render(
      <>
        {["desktop", "mobile"].map((placement) => (
          <HostWorkspaceSwitcher
            key={placement}
            club={club}
            clubs={clubs}
            currentWorkspace="member"
            workspaceItems={workspaceItems}
            disabledReason="이 클럽의 호스트 권한이 없습니다."
            onSelectTarget={vi.fn()}
          />
        ))}
      </>,
    );

    const ids = [...container.querySelectorAll("[id]")].map((element) => element.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
