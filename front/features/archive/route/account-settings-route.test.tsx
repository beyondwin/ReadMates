import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MyPageResponse } from "@/features/archive/api/archive-contracts";
import { SpaceTransitionSafetyProvider } from "@/shared/ui/space-transition-safety-context";
import { AccountSettingsRoute } from "./account-settings-route";

const route = vi.hoisted(() => ({
  loaderData: null as unknown,
}));
const api = vi.hoisted(() => ({
  leaveMembership: vi.fn(),
}));

vi.mock("react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router")>()),
  useLoaderData: () => route.loaderData,
}));
vi.mock("@/features/archive/api/archive-api", () => api);

const profile: MyPageResponse = {
  avatarKey: "banana-green-book",
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

function renderRouteWithObsoleteOwner() {
  const port = {
    registerDirty: vi.fn(() => () => undefined),
    beginPending: vi.fn(() => ({
      generation: 1,
      settle: vi.fn(async () => "obsolete" as const),
      publishAccepted: vi.fn(() => "rejected" as const),
      unregister: vi.fn(),
      reconcile: vi.fn(async () => ({ operationId: "leave", outcome: "still-unknown" as const })),
    })),
  };
  render(<SpaceTransitionSafetyProvider port={port}><AccountSettingsRoute /></SpaceTransitionSafetyProvider>);
  return port;
}

describe("AccountSettingsRoute", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    route.loaderData = profile;
    api.leaveMembership.mockResolvedValue({ ok: true });
  });

  afterEach(cleanup);

  it("omits redundant desktop return chrome while preserving the page heading", () => {
    renderRoute();

    expect(screen.queryByRole("link", { name: "내 공간" })).toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: "계정 설정" })).toBeVisible();
  });

  it("keeps the leave failure visible instead of redirecting", async () => {
    const user = userEvent.setup();
    api.leaveMembership.mockResolvedValue({ ok: false });
    renderRoute();

    await user.click(screen.getByRole("button", { name: "클럽 탈퇴…" }));
    await user.click(screen.getByRole("button", { name: "클럽 탈퇴" }));

    expect(api.leaveMembership).toHaveBeenCalledOnce();
    expect(await screen.findByRole("alert")).toHaveTextContent("탈퇴 처리에 실패했습니다. 잠시 후 다시 시도해 주세요.");
  });

  it("does not publish leave success when settlement becomes obsolete", async () => {
    const user = userEvent.setup();
    const port = renderRouteWithObsoleteOwner();

    await user.click(screen.getByRole("button", { name: "클럽 탈퇴…" }));
    await user.click(screen.getByRole("button", { name: "클럽 탈퇴" }));

    expect(api.leaveMembership).toHaveBeenCalledOnce();
    expect(port.beginPending).toHaveBeenCalledOnce();
    expect(screen.queryByText("탈퇴 처리되었습니다.")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
