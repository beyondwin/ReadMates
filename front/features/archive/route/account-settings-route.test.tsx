import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MyPageResponse } from "@/features/archive/api/archive-contracts";
import { AccountSettingsRoute } from "./account-settings-route";

const route = vi.hoisted(() => ({
  loaderData: null as unknown,
  revalidate: vi.fn(),
}));
const api = vi.hoisted(() => ({
  updateMyProfile: vi.fn(),
  leaveMembership: vi.fn(),
}));

vi.mock("react-router-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router-dom")>()),
  useLoaderData: () => route.loaderData,
  useRevalidator: () => ({ revalidate: route.revalidate }),
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

const updatedProfile = { displayName: "새 이름", accountName: "book-friend" };

function response(ok: boolean, body: unknown) {
  return { ok, json: vi.fn().mockResolvedValue(body) } as unknown as Response;
}

function renderRoute(overrides: Partial<Parameters<typeof AccountSettingsRoute>[0]> = {}) {
  const onProfileUpdated = vi.fn().mockResolvedValue(undefined);
  render(<AccountSettingsRoute canEditProfile onProfileUpdated={onProfileUpdated} {...overrides} />);
  return { onProfileUpdated };
}

async function submitName(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "이름 변경" }));
  await user.clear(screen.getByRole("textbox", { name: "이름" }));
  await user.type(screen.getByRole("textbox", { name: "이름" }), "새 이름");
  await user.click(screen.getByRole("button", { name: "이름 저장" }));
}

describe("AccountSettingsRoute", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    route.loaderData = profile;
    api.updateMyProfile.mockResolvedValue(response(true, updatedProfile));
    api.leaveMembership.mockResolvedValue({ ok: true });
  });

  afterEach(cleanup);

  it("updates the profile, refreshes auth, and keeps the optimistic name visible", async () => {
    const user = userEvent.setup();
    const { onProfileUpdated } = renderRoute();

    await submitName(user);

    expect(api.updateMyProfile).toHaveBeenCalledWith("새 이름");
    expect(onProfileUpdated).toHaveBeenCalledOnce();
    expect(route.revalidate).toHaveBeenCalledOnce();
    expect(screen.getByText("새 이름")).toBeVisible();
  });

  it.each([
    ["DISPLAY_NAME_DUPLICATE", "같은 클럽에서 이미 쓰고 있는 이름입니다."],
    ["DISPLAY_NAME_RESERVED", "시스템에서 쓰는 이름은 사용할 수 없습니다."],
    ["MEMBERSHIP_NOT_ALLOWED", "현재 상태에서는 프로필을 수정할 수 없습니다."],
  ])("shows the decoded %s profile save error", async (code, message) => {
    const user = userEvent.setup();
    api.updateMyProfile.mockResolvedValue(response(false, { code }));
    const { onProfileUpdated } = renderRoute();

    await submitName(user);

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(onProfileUpdated).not.toHaveBeenCalled();
    expect(route.revalidate).not.toHaveBeenCalled();
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
