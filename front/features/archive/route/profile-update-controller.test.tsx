import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MemberProfileResponse, MyPageResponse } from "@/features/archive/api/archive-contracts";
import { ReadmatesApiError } from "@/shared/api/errors";
import { useProfileUpdateController } from "./profile-update-controller";

const mutations = vi.hoisted(() => ({
  updateMyProfile: vi.fn(),
  updateMyAvatar: vi.fn(),
  useUpdateMyProfileMutation: vi.fn(),
  useUpdateMyAvatarMutation: vi.fn(),
}));

vi.mock("@/features/archive/queries/profile-queries", () => ({
  useUpdateMyProfileMutation: mutations.useUpdateMyProfileMutation,
  useUpdateMyAvatarMutation: mutations.useUpdateMyAvatarMutation,
}));

const profile: MyPageResponse = {
  avatarKey: "squirrel-acorn",
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
  avatarKey: "squirrel-acorn",
};

const updatedAvatar: MemberProfileResponse = {
  membershipId: "membership-1",
  displayName: "기존 이름",
  accountName: "book-friend",
  profileImageUrl: null,
  avatarKey: "hedgehog-green-mug",
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
}

describe("useProfileUpdateController", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mutations.useUpdateMyProfileMutation.mockReturnValue({ mutateAsync: mutations.updateMyProfile });
    mutations.useUpdateMyAvatarMutation.mockReturnValue({ mutateAsync: mutations.updateMyAvatar });
  });

  it("updates the profile after refreshing auth and retains the optimistic name", async () => {
    const onProfileUpdated = vi.fn().mockResolvedValue(undefined);
    const onRevalidate = vi.fn();
    mutations.updateMyProfile.mockResolvedValue(updatedProfile);
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

    expect(mutations.updateMyProfile).toHaveBeenCalledWith("새 이름");
    expect(onProfileUpdated).toHaveBeenCalledOnce();
    expect(onRevalidate).toHaveBeenCalledOnce();
    expect(result.current.profile.displayName).toBe("새 이름");
  });

  it("refreshes auth before revalidation and then exposes the saved profile", async () => {
    const callbackOrder: string[] = [];
    const onProfileUpdated = vi.fn().mockImplementation(async () => {
      callbackOrder.push("auth-refresh");
    });
    const onRevalidate = vi.fn().mockImplementation(() => {
      callbackOrder.push("revalidate");
    });
    mutations.updateMyProfile.mockResolvedValue(updatedProfile);
    const { result } = renderHook(() =>
      useProfileUpdateController({
        sourceProfile: profile,
        canEditProfile: true,
        onProfileUpdated,
        onRevalidate,
      }),
    );

    await act(async () => {
      await result.current.updateProfile("새 이름");
    });

    expect(callbackOrder).toEqual(["auth-refresh", "revalidate"]);
    expect(result.current.profile.displayName).toBe("새 이름");
  });

  it("retains the optimistic name when revalidation returns a fresh stale profile object", async () => {
    const onProfileUpdated = vi.fn().mockResolvedValue(undefined);
    const onRevalidate = vi.fn();
    mutations.updateMyProfile.mockResolvedValue(updatedProfile);
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
    mutations.updateMyProfile.mockResolvedValue(updatedProfile);
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

  it("retains the latest successful display name when an earlier revalidation arrives late", async () => {
    const firstSave = deferred<MemberProfileResponse>();
    const secondSave = deferred<MemberProfileResponse>();
    const callbackOrder: string[] = [];
    const onProfileUpdated = vi.fn().mockImplementation(async () => {
      callbackOrder.push("auth-refresh");
    });
    const onRevalidate = vi.fn().mockImplementation(() => {
      callbackOrder.push("revalidate");
    });
    mutations.updateMyProfile
      .mockReturnValueOnce(firstSave.promise)
      .mockReturnValueOnce(secondSave.promise);
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

    let saveFirst!: Promise<MemberProfileResponse>;
    let saveSecond!: Promise<MemberProfileResponse>;
    act(() => {
      saveFirst = result.current.updateProfile("첫 이름");
      saveSecond = result.current.updateProfile("둘째 이름");
    });

    firstSave.resolve({ ...updatedProfile, displayName: "첫 이름" });
    await act(async () => {
      await saveFirst;
    });
    secondSave.resolve({ ...updatedProfile, displayName: "둘째 이름" });
    await act(async () => {
      await saveSecond;
    });
    expect(result.current.profile.displayName).toBe("둘째 이름");

    rerender({ sourceProfile: { ...profile, displayName: "첫 이름" } });

    expect(result.current.profile.displayName).toBe("둘째 이름");
    expect(callbackOrder).toEqual(["auth-refresh", "revalidate", "auth-refresh", "revalidate"]);
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

    expect(mutations.updateMyProfile).not.toHaveBeenCalled();
  });

  it("decodes a rejected API response into the profile save error", async () => {
    mutations.updateMyProfile.mockRejectedValue(
      new ReadmatesApiError(
        { code: "DISPLAY_NAME_DUPLICATE", message: "duplicate", status: 409, fallback: false },
        new Response(JSON.stringify({ code: "DISPLAY_NAME_DUPLICATE" }), { status: 409 }),
      ),
    );
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

  it("updates only the avatar after refreshing auth and leaves the saved name alone", async () => {
    const callbackOrder: string[] = [];
    const onProfileUpdated = vi.fn().mockImplementation(async () => {
      callbackOrder.push("auth-refresh");
    });
    const onRevalidate = vi.fn().mockImplementation(() => {
      callbackOrder.push("revalidate");
    });
    mutations.updateMyAvatar.mockResolvedValue(updatedAvatar);
    const { result } = renderHook(() =>
      useProfileUpdateController({
        sourceProfile: profile,
        canEditProfile: true,
        onProfileUpdated,
        onRevalidate,
      }),
    );

    await act(async () => {
      await expect(result.current.updateAvatar("hedgehog-green-mug")).resolves.toEqual(updatedAvatar);
    });

    expect(mutations.updateMyAvatar).toHaveBeenCalledWith("hedgehog-green-mug");
    expect(result.current.profile.avatarKey).toBe("hedgehog-green-mug");
    expect(result.current.profile.displayName).toBe("기존 이름");
    expect(callbackOrder).toEqual(["auth-refresh", "revalidate"]);
  });

  it("retains the latest successful avatar when an earlier revalidation arrives late", async () => {
    const firstSave = deferred<MemberProfileResponse>();
    const secondSave = deferred<MemberProfileResponse>();
    const callbackOrder: string[] = [];
    const onProfileUpdated = vi.fn().mockImplementation(async () => {
      callbackOrder.push("auth-refresh");
    });
    const onRevalidate = vi.fn().mockImplementation(() => {
      callbackOrder.push("revalidate");
    });
    mutations.updateMyAvatar
      .mockReturnValueOnce(firstSave.promise)
      .mockReturnValueOnce(secondSave.promise);
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

    let saveFirst!: Promise<MemberProfileResponse>;
    let saveSecond!: Promise<MemberProfileResponse>;
    act(() => {
      saveFirst = result.current.updateAvatar("hedgehog-green-book");
      saveSecond = result.current.updateAvatar("hedgehog-green-mug");
    });

    firstSave.resolve({ ...updatedAvatar, avatarKey: "hedgehog-green-book" });
    await act(async () => {
      await saveFirst;
    });
    secondSave.resolve(updatedAvatar);
    await act(async () => {
      await saveSecond;
    });
    expect(result.current.profile.avatarKey).toBe("hedgehog-green-mug");

    rerender({ sourceProfile: { ...profile, avatarKey: "hedgehog-green-book" } });

    expect(result.current.profile.avatarKey).toBe("hedgehog-green-mug");
    expect(callbackOrder).toEqual(["auth-refresh", "revalidate", "auth-refresh", "revalidate"]);
  });

  it("retires name and avatar overrides independently when the corresponding source field changes", async () => {
    const onProfileUpdated = vi.fn().mockResolvedValue(undefined);
    const onRevalidate = vi.fn();
    mutations.updateMyProfile.mockResolvedValue(updatedProfile);
    mutations.updateMyAvatar.mockResolvedValue(updatedAvatar);
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
      await result.current.updateAvatar("hedgehog-green-mug");
    });
    expect(result.current.profile).toMatchObject({ displayName: "새 이름", avatarKey: "hedgehog-green-mug" });

    rerender({ sourceProfile: { ...profile, displayName: "권위 이름" } });
    expect(result.current.profile).toMatchObject({ displayName: "권위 이름", avatarKey: "hedgehog-green-mug" });

    rerender({ sourceProfile: { ...profile } });
    expect(result.current.profile).toMatchObject({ displayName: "기존 이름", avatarKey: "hedgehog-green-mug" });

    rerender({ sourceProfile: { ...profile, avatarKey: "권위 아바타" } });
    expect(result.current.profile).toMatchObject({ displayName: "기존 이름", avatarKey: "권위 아바타" });
  });

  it("does not set an avatar override or refresh route state when the avatar update fails", async () => {
    const onProfileUpdated = vi.fn().mockResolvedValue(undefined);
    const onRevalidate = vi.fn();
    mutations.updateMyAvatar.mockRejectedValue(new Error("avatar save failed"));
    const { result } = renderHook(() =>
      useProfileUpdateController({
        sourceProfile: profile,
        canEditProfile: true,
        onProfileUpdated,
        onRevalidate,
      }),
    );

    await expect(result.current.updateAvatar("hedgehog-green-mug")).rejects.toThrow("이름 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.");

    expect(result.current.profile.avatarKey).toBe("squirrel-acorn");
    expect(onProfileUpdated).not.toHaveBeenCalled();
    expect(onRevalidate).not.toHaveBeenCalled();
  });
});
