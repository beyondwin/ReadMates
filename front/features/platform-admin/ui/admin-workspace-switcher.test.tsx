import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
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
    </MemoryRouter>,
  );
}

describe("AdminWorkspaceSwitcher", () => {
  it("opens a menu with host and member workspace links", () => {
    renderSwitcher();

    fireEvent.click(screen.getByRole("button", { name: "내 공간" }));

    expect(screen.getByText("내 ReadMates 공간")).toBeInTheDocument();
    expect(screen.getByText("operator@example.com")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "읽는사이 호스트 공간" })).toHaveAttribute(
      "href",
      "/clubs/reading-sai/app/host",
    );
    expect(screen.getByRole("link", { name: "읽는사이 멤버 공간" })).toHaveAttribute(
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
    fireEvent.click(screen.getByRole("button", { name: "다른 계정으로 로그인" }));

    await waitFor(() => {
      expect(onOtherAccountLogin).toHaveBeenCalledTimes(1);
      expect(screen.getByRole("alert")).toHaveTextContent("로그아웃에 실패했습니다. 다시 시도해 주세요.");
    });
  });
});
