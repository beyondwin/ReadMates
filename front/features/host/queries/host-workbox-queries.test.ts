// @vitest-environment jsdom

import { createElement, type PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HostWorkboxDeferralReceipt } from "../api/host-workbox-contracts";

vi.mock("../api/host-workbox-api", () => ({
  deferHostWorkboxItem: vi.fn(),
  fetchHostWorkboxPage: vi.fn(),
  removeHostWorkboxDeferral: vi.fn(),
}));

import {
  deferHostWorkboxItem,
  fetchHostWorkboxPage,
  removeHostWorkboxDeferral,
} from "../api/host-workbox-api";
import { hostSessionKeys } from "./host-session-queries";
import {
  hostWorkboxKeys,
  hostWorkboxPageQuery,
  useDeferHostWorkboxItemMutation,
  useRemoveHostWorkboxDeferralMutation,
} from "./host-workbox-queries";

const context = { clubSlug: "reading-sai" } as const;

function createWrapper() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Number.POSITIVE_INFINITY },
      mutations: { retry: false },
    },
  });
  function Wrapper({ children }: PropsWithChildren) {
    return createElement(QueryClientProvider, { client }, children);
  }
  return { client, Wrapper };
}

beforeEach(() => vi.clearAllMocks());

describe("host workbox query identity", () => {
  it("uses non-colliding club, state, cursor, and limit page identities under the workbox root", () => {
    const now = hostWorkboxKeys.page({ state: "NOW", cursor: null, limit: 20 }, context);
    const deferred = hostWorkboxKeys.page({ state: "DEFERRED", cursor: null, limit: 20 }, context);
    const continued = hostWorkboxKeys.page({ state: "NOW", cursor: "next-1", limit: 20 }, context);
    const byteExact = hostWorkboxKeys.page({ state: "NOW", cursor: "  next-1  ", limit: 20 }, context);
    const otherLimit = hostWorkboxKeys.page({ state: "NOW", cursor: null, limit: 50 }, context);
    const otherClub = hostWorkboxKeys.page(
      { state: "NOW", cursor: null, limit: 20 },
      { clubSlug: "other-club" },
    );

    expect(hostWorkboxKeys.scope(context)).toEqual(["host", "reading-sai", "workbox"]);
    expect(byteExact.at(-1)).toEqual({ state: "NOW", cursor: "  next-1  ", limit: 20 });
    expect(new Set([now, deferred, continued, otherLimit, otherClub].map(JSON.stringify)).size).toBe(5);
  });

  it.each(["", "   ", "\t\n"])(
    "rejects blank continuation %j before creating a query key or calling the API",
    (cursor) => {
      expect(() => hostWorkboxPageQuery({ state: "NOW", cursor, limit: 20 }, context)).toThrow();
      expect(fetchHostWorkboxPage).not.toHaveBeenCalled();
    },
  );

  it("passes the authoritative page request and club context to the API", async () => {
    const request = { state: "COMPLETED" as const, cursor: "next-2", limit: 20 };
    vi.mocked(fetchHostWorkboxPage).mockResolvedValue({
      state: "COMPLETED",
      evaluatedAt: "2026-08-30T09:00:00Z",
      sourceAvailability: [],
      items: [],
      nextCursor: null,
    } as never);
    const client = new QueryClient();

    await client.fetchQuery(hostWorkboxPageQuery(request, context));

    expect(fetchHostWorkboxPage).toHaveBeenCalledWith(request, context);
  });
});

describe("host workbox deferral invalidation", () => {
  it("returns the original PUT receipt and invalidates every workbox page plus current composition", async () => {
    const receipt: HostWorkboxDeferralReceipt = {
      key: "SCHEDULE_UNSEEN:session-1:r7",
      deferredUntil: "2026-08-31T09:00:00Z",
    };
    vi.mocked(deferHostWorkboxItem).mockResolvedValue(receipt);
    const { client, Wrapper } = createWrapper();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useDeferHostWorkboxItemMutation(context), { wrapper: Wrapper });

    let returned: HostWorkboxDeferralReceipt | undefined;
    await act(async () => {
      returned = await result.current.mutateAsync({
        key: receipt.key,
        deferredUntil: receipt.deferredUntil,
      });
    });

    expect(returned).toBe(receipt);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: hostWorkboxKeys.scope(context) });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: hostSessionKeys.operatingRoomCurrent(context),
    });
    expect(invalidateSpy).toHaveBeenCalledTimes(2);
    expect(client.getMutationCache().getAll()[0]?.options.mutationKey).toEqual([
      "host-mutation", "reading-sai", "workbox", "defer",
    ]);
  });

  it("keeps DELETE invalidation and mutation ownership inside the exact club", async () => {
    vi.mocked(removeHostWorkboxDeferral).mockResolvedValue(undefined);
    const { client, Wrapper } = createWrapper();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");
    const otherContext = { clubSlug: "other-club" } as const;
    const { result } = renderHook(
      () => useRemoveHostWorkboxDeferralMutation(otherContext),
      { wrapper: Wrapper },
    );

    await act(async () => {
      await result.current.mutateAsync("MEMBER_APPROVAL:member-1:g1");
    });

    expect(removeHostWorkboxDeferral).toHaveBeenCalledWith(
      "MEMBER_APPROVAL:member-1:g1",
      otherContext,
    );
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: hostWorkboxKeys.scope(otherContext),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: hostSessionKeys.operatingRoomCurrent(otherContext),
    });
    expect(invalidateSpy.mock.calls.flatMap(([input]) => input.queryKey ?? [])).not.toContain("reading-sai");
    expect(client.getMutationCache().getAll()[0]?.options.mutationKey).toEqual([
      "host-mutation", "other-club", "workbox", "remove-deferral",
    ]);
  });

  it("preserves the original server error and does not invalidate on failure", async () => {
    const serverError = Object.assign(new Error("stale"), { code: "WORKBOX_RESTART_REQUIRED" });
    vi.mocked(deferHostWorkboxItem).mockRejectedValue(serverError);
    const { client, Wrapper } = createWrapper();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useDeferHostWorkboxItemMutation(context), { wrapper: Wrapper });

    let received: unknown;
    await act(async () => {
      received = await result.current.mutateAsync({
        key: "SCHEDULE_UNSEEN:session-1:r7",
        deferredUntil: "2026-08-31T09:00:00Z",
      }).catch((error) => error);
    });

    expect(received).toBe(serverError);
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});
