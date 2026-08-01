import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";
import { logout } from "@/features/auth/api/auth-api";
import { AccountMenuController } from "./account-menu-controller";

vi.mock("@/features/auth/api/auth-api", () => ({
  logout: vi.fn(),
}));

const auth: AuthMeResponse = {
  authenticated: true,
  userId: "member-1",
  membershipId: "membership-1",
  clubId: "club-1",
  email: "member1@example.com",
  displayName: "멤버1",
  accountName: "멤버",
  role: "MEMBER",
  membershipStatus: "ACTIVE",
  approvalState: "ACTIVE",
};

function TestLink({ to, children, ...props }: ComponentProps<"a"> & { to: string }) {
  return (
    <a {...props} href={to}>
      {children}
    </a>
  );
}

async function renderOpenController({
  appBasePath = "",
  onLoggedOut = vi.fn(),
}: {
  appBasePath?: string;
  onLoggedOut?: () => void;
} = {}) {
  const user = userEvent.setup();
  render(
    <AccountMenuController
      auth={auth}
      appBasePath={appBasePath}
      LinkComponent={TestLink}
      onLoggedOut={onLoggedOut}
    />,
  );
  await user.click(screen.getByRole("button", { name: "멤버1 계정 메뉴" }));
  return { user, onLoggedOut };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("AccountMenuController", () => {
  it("keeps club-scoped notification and account settings destinations inside the popover", async () => {
    await renderOpenController({ appBasePath: "/clubs/reading-sai/app" });

    expect(screen.getByRole("link", { name: "알림" })).toHaveAttribute(
      "href",
      "/clubs/reading-sai/app/notifications",
    );
    expect(screen.getByRole("link", { name: "계정 설정" })).toHaveAttribute(
      "href",
      "/clubs/reading-sai/app/me/settings",
    );
    expect(screen.queryByRole("link", { name: "내 공간" })).not.toBeInTheDocument();
    expect(screen.getByText("정식 멤버")).toBeVisible();
  });

  it("keeps the menu open with inline feedback after logout fails", async () => {
    vi.mocked(logout).mockResolvedValue(new Response(null, { status: 500 }));
    const onLoggedOut = vi.fn();
    const { user } = await renderOpenController({ onLoggedOut });

    await user.click(screen.getByRole("button", { name: "로그아웃" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "로그아웃에 실패했습니다. 잠시 후 다시 시도해 주세요.",
    );
    expect(screen.getByRole("dialog", { name: "멤버1" })).toBeVisible();
    expect(onLoggedOut).not.toHaveBeenCalled();
  });

  it.each([204, 401])("clears auth and redirects when logout returns %s", async (status) => {
    vi.mocked(logout).mockResolvedValue(new Response(null, { status }));
    const location = { href: "" };
    vi.stubGlobal("location", location);
    const onLoggedOut = vi.fn();
    const { user } = await renderOpenController({ onLoggedOut });

    await user.click(screen.getByRole("button", { name: "로그아웃" }));

    await waitFor(() => {
      expect(onLoggedOut).toHaveBeenCalledTimes(1);
    });
    expect(location.href).toBe("/login");
  });

  it("deduplicates logout while the first request is pending", async () => {
    let resolveLogout!: (response: Response) => void;
    vi.mocked(logout).mockReturnValue(
      new Promise<Response>((resolve) => {
        resolveLogout = resolve;
      }),
    );
    const { user } = await renderOpenController();
    const button = screen.getByRole("button", { name: "로그아웃" });

    await user.dblClick(button);

    expect(logout).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "로그아웃 중" })).toBeDisabled();
    resolveLogout(new Response(null, { status: 500 }));
    expect(await screen.findByRole("alert")).toBeVisible();
  });
});
