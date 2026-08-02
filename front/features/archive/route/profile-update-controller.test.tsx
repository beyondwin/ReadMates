import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MemberProfileResponse, MyPageResponse } from "@/features/archive/api/archive-contracts";
import { ReadmatesApiError } from "@/shared/api/errors";
import { useProfileUpdateController } from "./profile-update-controller";

const mutations = vi.hoisted(() => ({
  updateMyProfile: vi.fn(),
  useUpdateMyProfileMutation: vi.fn(),
}));

vi.mock("@/features/archive/queries/profile-queries", () => ({
  useUpdateMyProfileMutation: mutations.useUpdateMyProfileMutation,
}));

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

const saved: MemberProfileResponse = {
  membershipId: "membership-1",
  displayName: "새 이름",
  accountName: "book-friend",
  profileImageUrl: null,
  avatarKey: "cloud-green-book",
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function renderController(sourceProfile = profile, clubSlug = "reading-sai", canEditProfile = true) {
  const onProfileUpdated = vi.fn().mockResolvedValue(undefined);
  const onRevalidate = vi.fn();
  const hook = renderHook(
    (props: { sourceProfile: MyPageResponse; clubSlug: string }) => useProfileUpdateController({
      ...props,
      canEditProfile,
      onProfileUpdated,
      onRevalidate,
    }),
    { initialProps: { sourceProfile, clubSlug } },
  );
  return { ...hook, onProfileUpdated, onRevalidate };
}

describe("useProfileUpdateController", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mutations.useUpdateMyProfileMutation.mockReturnValue({ mutateAsync: mutations.updateMyProfile });
  });

  it("saves both fields, refreshes auth once, and revalidates once", async () => {
    const order: string[] = [];
    mutations.updateMyProfile.mockResolvedValue(saved);
    const { result, onProfileUpdated, onRevalidate } = renderController();
    onProfileUpdated.mockImplementation(async () => { order.push("auth-refresh"); });
    onRevalidate.mockImplementation(() => { order.push("revalidate"); });

    await act(async () => {
      await expect(result.current.saveProfile({
        displayName: "새 이름",
        avatarKey: "cloud-green-book",
      })).resolves.toEqual(saved);
    });

    expect(mutations.updateMyProfile).toHaveBeenCalledWith({
      displayName: "새 이름",
      avatarKey: "cloud-green-book",
    });
    expect(order).toEqual(["auth-refresh", "revalidate"]);
    expect(result.current.profile).toMatchObject({
      displayName: "새 이름",
      avatarKey: "cloud-green-book",
    });
  });

  it("retains the saved profile across stale, authoritative, then stale loader snapshots", async () => {
    mutations.updateMyProfile.mockResolvedValue(saved);
    const { result, rerender } = renderController();

    await act(async () => { await result.current.saveProfile({ displayName: "새 이름", avatarKey: "cloud-green-book" }); });
    rerender({ sourceProfile: { ...profile }, clubSlug: "reading-sai" });
    expect(result.current.profile).toMatchObject({ displayName: "새 이름", avatarKey: "cloud-green-book" });

    rerender({
      sourceProfile: { ...profile, displayName: "새 이름", avatarKey: "cloud-green-book" },
      clubSlug: "reading-sai",
    });
    expect(result.current.profile).toMatchObject({ displayName: "새 이름", avatarKey: "cloud-green-book" });

    rerender({ sourceProfile: { ...profile }, clubSlug: "reading-sai" });
    expect(result.current.profile).toMatchObject({ displayName: "새 이름", avatarKey: "cloud-green-book" });
  });

  it("keeps the newest invoked profile when overlapping saves resolve newest first", async () => {
    const first = deferred<MemberProfileResponse>();
    const second = deferred<MemberProfileResponse>();
    const firstSaved = { ...saved, displayName: "첫 번째 이름", avatarKey: "cloud-green-book" };
    const secondSaved = { ...saved, displayName: "두 번째 이름", avatarKey: "sun-green-book" };
    mutations.updateMyProfile
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const { result, onProfileUpdated, onRevalidate } = renderController();

    let firstRequest!: Promise<MemberProfileResponse>;
    let secondRequest!: Promise<MemberProfileResponse>;
    act(() => {
      firstRequest = result.current.saveProfile({ displayName: "첫 번째 이름", avatarKey: "cloud-green-book" });
      secondRequest = result.current.saveProfile({ displayName: "두 번째 이름", avatarKey: "sun-green-book" });
    });

    second.resolve(secondSaved);
    await act(async () => { await secondRequest; });
    expect(result.current.profile).toMatchObject({ displayName: "두 번째 이름", avatarKey: "sun-green-book" });

    first.resolve(firstSaved);
    await act(async () => { await firstRequest; });

    expect(result.current.profile).toMatchObject({ displayName: "두 번째 이름", avatarKey: "sun-green-book" });
    expect(onProfileUpdated).toHaveBeenCalledOnce();
    expect(onRevalidate).toHaveBeenCalledOnce();
  });

  it("advances to a later accepted save and accepts an unrelated newer loader identity", async () => {
    const laterSaved = { ...saved, displayName: "두 번째 이름", avatarKey: "sun-green-book" };
    mutations.updateMyProfile
      .mockResolvedValueOnce(saved)
      .mockResolvedValueOnce(laterSaved);
    const { result, rerender } = renderController();

    await act(async () => { await result.current.saveProfile({ displayName: "새 이름", avatarKey: "cloud-green-book" }); });
    rerender({ sourceProfile: { ...profile, ...saved }, clubSlug: "reading-sai" });
    await act(async () => { await result.current.saveProfile({ displayName: "두 번째 이름", avatarKey: "sun-green-book" }); });

    rerender({ sourceProfile: { ...profile, ...saved }, clubSlug: "reading-sai" });
    expect(result.current.profile).toMatchObject({ displayName: "두 번째 이름", avatarKey: "sun-green-book" });

    const newerLoaderProfile = { ...profile, displayName: "서버의 새 이름", avatarKey: "moon-green-book" };
    rerender({ sourceProfile: newerLoaderProfile, clubSlug: "reading-sai" });
    expect(result.current.profile).toMatchObject(newerLoaderProfile);
  });

  it("prevents an old-club response from replacing the current club profile", async () => {
    mutations.updateMyProfile.mockResolvedValue(saved);
    const { result, rerender } = renderController();
    await act(async () => { await result.current.saveProfile({ displayName: "새 이름", avatarKey: "cloud-green-book" }); });

    const otherClub = { ...profile, displayName: "다른 클럽 이름", avatarKey: "sun-green-book" };
    rerender({ sourceProfile: otherClub, clubSlug: "other-club" });

    expect(result.current.profile).toMatchObject(otherClub);
  });

  it("rejects before mutation when the membership cannot edit", async () => {
    const { result } = renderController(profile, "reading-sai", false);

    await expect(result.current.saveProfile({ displayName: "새 이름", avatarKey: "cloud-green-book" }))
      .rejects.toMatchObject({ field: "form" });
    expect(mutations.updateMyProfile).not.toHaveBeenCalled();
  });

  it("maps typed API failures to the responsible profile field and preserves the cause", async () => {
    const apiError = new ReadmatesApiError(
      { code: "AVATAR_KEY_INVALID", message: "invalid", status: 400, fallback: false },
      new Response(JSON.stringify({ code: "AVATAR_KEY_INVALID" }), { status: 400 }),
    );
    mutations.updateMyProfile.mockRejectedValue(apiError);
    const { result, onProfileUpdated, onRevalidate } = renderController();

    await expect(result.current.saveProfile({ displayName: "새 이름", avatarKey: "cloud-green-book" }))
      .rejects.toMatchObject({ code: "AVATAR_KEY_INVALID", field: "avatarKey", cause: apiError });
    expect(onProfileUpdated).not.toHaveBeenCalled();
    expect(onRevalidate).not.toHaveBeenCalled();
  });
});
