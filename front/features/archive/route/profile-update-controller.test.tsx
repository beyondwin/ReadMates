import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MemberProfileResponse, MyPageResponse } from "@/features/archive/api/archive-contracts";
import { useProfileUpdateController } from "./profile-update-controller";

const api = vi.hoisted(() => ({
  updateMyProfile: vi.fn(),
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

const updatedProfile: MemberProfileResponse = {
  membershipId: "membership-1",
  displayName: "새 이름",
  accountName: "book-friend",
  profileImageUrl: null,
};

function response(ok: boolean, body: unknown) {
  return { ok, json: vi.fn().mockResolvedValue(body) } as unknown as Response;
}

describe("useProfileUpdateController", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("updates the profile after refreshing auth and retains the optimistic name", async () => {
    const onProfileUpdated = vi.fn().mockResolvedValue(undefined);
    const onRevalidate = vi.fn();
    api.updateMyProfile.mockResolvedValue(response(true, updatedProfile));
    const { result } = renderHook(() =>
      useProfileUpdateController({
        sourceProfile: profile,
        canEditProfile: true,
        onProfileUpdated,
        onRevalidate,
      }),
    );

    await act(async () => {
      await expect(result.current.updateProfile("새 이름")).resolves.toEqual(updatedProfile);
    });

    expect(api.updateMyProfile).toHaveBeenCalledWith("새 이름");
    expect(onProfileUpdated).toHaveBeenCalledOnce();
    expect(onRevalidate).toHaveBeenCalledOnce();
    expect(result.current.profile.displayName).toBe("새 이름");
  });

  it("retains the optimistic name when revalidation returns a fresh stale profile object", async () => {
    const onProfileUpdated = vi.fn().mockResolvedValue(undefined);
    const onRevalidate = vi.fn();
    api.updateMyProfile.mockResolvedValue(response(true, updatedProfile));
    const { result, rerender } = renderHook(
      ({ sourceProfile }) =>
        useProfileUpdateController({
          sourceProfile,
          canEditProfile: true,
          onProfileUpdated,
          onRevalidate,
        }),
      { initialProps: { sourceProfile: profile } },
    );

    await act(async () => {
      await result.current.updateProfile("새 이름");
    });

    rerender({ sourceProfile: { ...profile } });

    expect(result.current.profile.displayName).toBe("새 이름");
  });

  it("retires an optimistic override after authoritative data moves past it", async () => {
    const onProfileUpdated = vi.fn().mockResolvedValue(undefined);
    const onRevalidate = vi.fn();
    api.updateMyProfile.mockResolvedValue(response(true, updatedProfile));
    const { result, rerender } = renderHook(
      ({ sourceProfile }) =>
        useProfileUpdateController({
          sourceProfile,
          canEditProfile: true,
          onProfileUpdated,
          onRevalidate,
        }),
      { initialProps: { sourceProfile: profile } },
    );

    await act(async () => {
      await result.current.updateProfile("새 이름");
    });
    expect(result.current.profile.displayName).toBe("새 이름");

    rerender({ sourceProfile: { ...profile, displayName: "권위 이름" } });
    expect(result.current.profile.displayName).toBe("권위 이름");

    rerender({ sourceProfile: { ...profile } });
    expect(result.current.profile.displayName).toBe("기존 이름");
  });

  it("rejects a profile update when the membership cannot edit", async () => {
    const denied = renderHook(() =>
      useProfileUpdateController({
        sourceProfile: profile,
        canEditProfile: false,
        onProfileUpdated: vi.fn().mockResolvedValue(undefined),
        onRevalidate: vi.fn(),
      }),
    );

    await expect(denied.result.current.updateProfile("새 이름")).rejects.toThrow("현재 상태에서는 프로필을 수정할 수 없습니다.");

    expect(api.updateMyProfile).not.toHaveBeenCalled();
  });

  it("decodes a rejected API response into the profile save error", async () => {
    api.updateMyProfile.mockResolvedValue(response(false, { code: "DISPLAY_NAME_DUPLICATE" }));
    const onProfileUpdated = vi.fn().mockResolvedValue(undefined);
    const onRevalidate = vi.fn();
    const { result } = renderHook(() =>
      useProfileUpdateController({
        sourceProfile: profile,
        canEditProfile: true,
        onProfileUpdated,
        onRevalidate,
      }),
    );

    await expect(result.current.updateProfile("중복 이름")).rejects.toThrow("같은 클럽에서 이미 쓰고 있는 이름입니다.");

    expect(onProfileUpdated).not.toHaveBeenCalled();
    expect(onRevalidate).not.toHaveBeenCalled();
  });
});
