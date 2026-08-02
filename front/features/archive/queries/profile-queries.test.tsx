import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/shared/api/client", () => ({
  readmatesFetch: vi.fn(),
  readmatesFetchResponse: vi.fn(),
}));

import { updateMyAvatar } from "@/features/archive/api/archive-api";
import type { MemberProfileResponse } from "@/features/archive/api/archive-contracts";
import { readmatesFetchResponse } from "@/shared/api/client";
import { archiveKeys } from "./archive-queries";
import { useUpdateMyAvatarMutation } from "./profile-queries";

const savedProfile: MemberProfileResponse = {
  membershipId: "membership-1",
  displayName: "기존 이름",
  accountName: "book-friend",
  profileImageUrl: null,
  avatarKey: "cloud-green-book",
};

function createWrapper() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }

  return { client, Wrapper };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
}

function profileResponse(profile: MemberProfileResponse, status = 200) {
  return new Response(JSON.stringify(profile), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  vi.mocked(readmatesFetchResponse).mockReset();
});

describe("profile mutations", () => {
  it("sends an avatar update to the own-avatar endpoint", async () => {
    vi.mocked(readmatesFetchResponse).mockResolvedValue(profileResponse(savedProfile));

    await updateMyAvatar("cloud-green-book", { clubSlug: "reading-sai" });

    expect(readmatesFetchResponse).toHaveBeenCalledWith(
      "/api/me/avatar",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ avatarKey: "cloud-green-book" }),
      }),
      { clubSlug: "reading-sai" },
    );
  });

  it("waits for a successful authoritative avatar response before invalidating archive data", async () => {
    const pendingResponse = deferred<Response>();
    vi.mocked(readmatesFetchResponse).mockReturnValue(pendingResponse.promise);
    const { client, Wrapper } = createWrapper();
    const invalidateQueries = vi.spyOn(client, "invalidateQueries");
    client.setQueryData([...archiveKeys.all, "profile"], { displayName: "기존 이름" });
    const { result } = renderHook(() => useUpdateMyAvatarMutation(), { wrapper: Wrapper });

    let save!: Promise<MemberProfileResponse>;
    act(() => {
      save = result.current.mutateAsync("cloud-green-book");
    });

    await waitFor(() => expect(readmatesFetchResponse).toHaveBeenCalledOnce());
    expect(invalidateQueries).not.toHaveBeenCalled();

    pendingResponse.resolve(profileResponse(savedProfile));

    await act(async () => {
      await expect(save).resolves.toEqual(savedProfile);
    });

    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: archiveKeys.all });
    expect(client.getQueryState([...archiveKeys.all, "profile"])?.isInvalidated).toBe(true);
  });

  it("does not invalidate archive data when the avatar update is rejected", async () => {
    vi.mocked(readmatesFetchResponse).mockResolvedValue(profileResponse(savedProfile, 400));
    const { client, Wrapper } = createWrapper();
    const invalidateQueries = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useUpdateMyAvatarMutation(), { wrapper: Wrapper });

    await expect(result.current.mutateAsync("cloud-green-book")).rejects.toMatchObject({ status: 400 });

    expect(invalidateQueries).not.toHaveBeenCalled();
  });
});
