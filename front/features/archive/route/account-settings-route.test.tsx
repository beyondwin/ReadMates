import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MyPageResponse } from "@/features/archive/api/archive-contracts";
import { AccountSettingsRoute } from "./account-settings-route";

const route = vi.hoisted(() => ({
  loaderData: null as unknown,
  pathname: "/clubs/reading-sai/app/me/settings",
}));
const api = vi.hoisted(() => ({
  leaveMembership: vi.fn(),
}));

vi.mock("react-router-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router-dom")>()),
  useLoaderData: () => route.loaderData,
  useLocation: () => ({ pathname: route.pathname }),
}));
vi.mock("@/features/archive/api/archive-api", () => api);

const profile: MyPageResponse = {
  displayName: "기존 이름",
  accountName: "book-friend",
  email: "reader@example.com",
  role: "MEMBER",
  membershipStatus: "ACTIVE",
  clubName: "읽는 사이",
  joinedAt: "2026-01",
  sessionCount: 2,
  totalSessionCount: 3,
  completedReadingCount: 1,
  currentSessionId: "session-current",
  recentAttendances: [],
};

function renderRoute() {
  render(<AccountSettingsRoute />);
}

describe("AccountSettingsRoute", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    route.loaderData = profile;
    route.pathname = "/clubs/reading-sai/app/me/settings";
    api.leaveMembership.mockResolvedValue({ ok: true });
  });

  afterEach(cleanup);

  it.each([
    ["/clubs/reading-sai/app/me/settings", "/clubs/reading-sai/app/me"],
    ["/app/me/settings", "/app/me"],
  ])("builds a stable my-space return from %s", (pathname, expectedHref) => {
    route.pathname = pathname;
    renderRoute();

    expect(screen.getByRole("link", { name: "내 공간" })).toHaveAttribute("href", expectedHref);
  });

  it("keeps the leave failure visible instead of redirecting", async () => {
    const user = userEvent.setup();
    api.leaveMembership.mockResolvedValue({ ok: false });
    renderRoute();

    await user.click(screen.getByRole("button", { name: "탈퇴" }));
    await user.click(screen.getByRole("button", { name: "탈퇴 확인" }));

    expect(api.leaveMembership).toHaveBeenCalledOnce();
    expect(await screen.findByRole("alert")).toHaveTextContent("탈퇴 처리에 실패했습니다. 잠시 후 다시 시도해 주세요.");
  });
});
