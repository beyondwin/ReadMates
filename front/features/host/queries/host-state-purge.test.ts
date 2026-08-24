import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  hostClubQueryPrefix,
  hostMutationKey,
  purgeClubHostState,
} from "./host-state-purge";
import { registerHostRequest } from "@/shared/api/host-authority-event";
import { readmatesFetch } from "@/shared/api/client";

function queryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Number.POSITIVE_INFINITY } },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("purgeClubHostState", () => {
  it("cancels and removes only the exact club query scope", async () => {
    const client = queryClient();
    const same = [...hostClubQueryPrefix("reading-sai"), "sessions"] as const;
    const other = [...hostClubQueryPrefix("other-club"), "sessions"] as const;
    client.setQueryData(same, { secret: "remove" });
    client.setQueryData(other, { safe: "keep" });
    const storage = { clearClub: vi.fn().mockResolvedValue(undefined) };

    await purgeClubHostState({ clubSlug: "reading-sai", queryClient: client, storage });

    expect(client.getQueryData(same)).toBeUndefined();
    expect(client.getQueryData(other)).toEqual({ safe: "keep" });
    expect(storage.clearClub).toHaveBeenCalledWith("reading-sai");
  });

  it("does not let an in-flight response resurrect a purged club query", async () => {
    const client = queryClient();
    const key = [...hostClubQueryPrefix("reading-sai"), "session", "session-1"] as const;
    let resolve!: (value: { secret: string }) => void;
    const pending = new Promise<{ secret: string }>((done) => {
      resolve = done;
    });
    const request = client.fetchQuery({ queryKey: key, queryFn: () => pending });
    await Promise.resolve();

    await purgeClubHostState({
      clubSlug: "reading-sai",
      queryClient: client,
      storage: { clearClub: vi.fn().mockResolvedValue(undefined) },
    });
    resolve({ secret: "late" });
    await request.catch(() => undefined);
    await Promise.resolve();

    expect(client.getQueryData(key)).toBeUndefined();
  });

  it("aborts only the exact club's in-flight host requests before clearing state", async () => {
    const exactClub = new AbortController();
    const otherClub = new AbortController();
    const unregisterExact = registerHostRequest("reading-sai", exactClub);
    const unregisterOther = registerHostRequest("other-club", otherClub);
    const order: string[] = [];
    exactClub.signal.addEventListener("abort", () => order.push("cancel"));

    await purgeClubHostState({
      clubSlug: "reading-sai",
      queryClient: queryClient(),
      storage: { clearClub: vi.fn(async () => { order.push("storage"); }) },
    });

    expect(exactClub.signal.aborted).toBe(true);
    expect(otherClub.signal.aborted).toBe(false);
    expect(order).toEqual(["cancel", "storage"]);
    unregisterExact();
    unregisterOther();
  });

  it("removes exact-club mutations and prevents a deferred body from running late callbacks", async () => {
    const client = queryClient();
    const onSuccess = vi.fn();
    let bodyController!: ReadableStreamDefaultController<Uint8Array>;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          bodyController = controller;
        },
      }),
      { headers: { "Content-Type": "application/json" } },
    )));
    const exactMutation = client.getMutationCache().build(client, {
      mutationKey: hostMutationKey("reading-sai", "session", "save"),
      mutationFn: () => readmatesFetch<{ secret: string }>(
        "/api/host/sessions/session-1",
        undefined,
        { clubSlug: "reading-sai" },
      ),
      onSuccess,
    });
    client.getMutationCache().build(client, {
      mutationKey: hostMutationKey("other-club", "session", "save"),
      mutationFn: async () => ({ safe: true }),
    });
    const request = exactMutation.execute(undefined);
    await Promise.resolve();

    await purgeClubHostState({
      clubSlug: "reading-sai",
      queryClient: client,
      storage: { clearClub: vi.fn().mockResolvedValue(undefined) },
    });
    bodyController.enqueue(new TextEncoder().encode(JSON.stringify({ secret: "late" })));
    bodyController.close();

    await expect(request).rejects.toMatchObject({ code: "HOST_REQUEST_PURGED" });
    expect(onSuccess).not.toHaveBeenCalled();
    expect(client.getMutationCache().findAll({
      mutationKey: hostMutationKey("reading-sai"),
    })).toHaveLength(0);
    expect(client.getMutationCache().findAll({
      mutationKey: hostMutationKey("other-club"),
    })).toHaveLength(1);
  });
});
