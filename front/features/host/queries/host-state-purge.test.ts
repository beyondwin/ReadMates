import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  hostClubQueryPrefix,
  hostMutationKey,
  purgeClubHostState,
} from "./host-state-purge";
import { currentSessionKeys } from "@/features/current-session/queries/current-session-queries";
import { aiClubKeys, aiJobKeys } from "@/features/host/aigen/queries/aigen-job-queries";
import { hostClubOperationsKeys } from "./host-club-operations-queries";
import { hostInvitationKeys } from "./host-invitation-queries";
import { hostMemberKeys } from "./host-members-queries";
import { hostNotificationKeys } from "./host-notification-queries";
import { hostSessionKeys } from "./host-session-queries";
import { hostSessionRecordKeys } from "./host-session-record-query-keys";
import { hostSessionRecoveryKeys } from "./host-session-recovery-queries";
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

  it("removes every current host family while retaining member and other-club state", async () => {
    const client = queryClient();
    const exactContext = { clubSlug: "reading-sai" };
    const otherContext = { clubSlug: "other-club" };
    const exactHostKeys = [
      hostSessionKeys.detail("session-7", exactContext),
      hostSessionRecordKeys.editor("session-7", exactContext),
      hostSessionRecoveryKeys.restorePreview("session-7", "change-3", exactContext),
      hostMemberKeys.list(undefined, exactContext),
      hostInvitationKeys.list(undefined, exactContext),
      hostNotificationKeys.summary(exactContext),
      hostClubOperationsKeys.snapshot(exactContext),
      aiJobKeys.detail("session-7", "job-2", exactContext),
      aiClubKeys.capabilities(exactContext),
    ];
    const otherHostKey = hostSessionKeys.detail("session-7", otherContext);
    const safeMemberKey = currentSessionKeys.current(exactContext);

    for (const key of exactHostKeys) client.setQueryData(key, { sensitive: true });
    client.setQueryData(otherHostKey, { otherClub: true });
    client.setQueryData(safeMemberKey, { memberSafe: true });

    await purgeClubHostState({
      clubSlug: exactContext.clubSlug,
      queryClient: client,
      storage: { clearClub: vi.fn().mockResolvedValue(undefined) },
    });

    for (const key of exactHostKeys) expect(client.getQueryData(key)).toBeUndefined();
    expect(client.getQueryData(otherHostKey)).toEqual({ otherClub: true });
    expect(client.getQueryData(safeMemberKey)).toEqual({ memberSafe: true });
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
