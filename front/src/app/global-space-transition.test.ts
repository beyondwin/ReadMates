import { act } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  ReceiptRecoveryCapsule,
  ReturnTarget,
  SpaceIdentity,
  TransitionPublicationPort,
} from "@/shared/model/global-space";
import {
  createGlobalSpaceTransitionCoordinator,
  createRetiredReceiptCapsuleRegistry,
  normalizePendingTimeout,
  resolveGlobalSpaceDestination,
} from "./global-space-transition";

const platform: SpaceIdentity = { productSpace: "platform" };
const member: SpaceIdentity = {
  productSpace: "clubs",
  clubId: "club-1",
  clubSlug: "reading-sai",
  perspective: "member",
};
const host: SpaceIdentity = { ...member, perspective: "host" };

function target(pathname: string, search = ""): ReturnTarget {
  return { pathname, search, hash: "", focusId: null, scrollTop: 0 };
}

describe("global space destination resolution", () => {
  it("uses loader-authorized member-host correspondence", () => {
    expect(resolveGlobalSpaceDestination({
      currentIdentity: member,
      targetIdentity: host,
      currentTarget: target("/clubs/reading-sai/app/sessions/meeting-7"),
      lastSafeTarget: target("/clubs/reading-sai/app/host/sessions"),
      availableIdentities: [member, host],
      correspondence: "authorized",
      reason: "user",
    })).toEqual({
      identity: host,
      target: target("/clubs/reading-sai/app/host/sessions/meeting-7"),
      navigation: "push",
    });
  });

  it.each([
    [platform, member, "/clubs/reading-sai/app/archive"],
    [member, platform, "/admin/audit?range=30d"],
  ] as const)("restores the last safe platform-club target", (currentIdentity, targetIdentity, href) => {
    const parsed = new URL(href, "https://readmates.invalid");
    const lastSafeTarget = target(parsed.pathname, parsed.search);
    expect(resolveGlobalSpaceDestination({
      currentIdentity,
      targetIdentity,
      currentTarget: target(currentIdentity.productSpace === "platform" ? "/admin/today" : "/clubs/reading-sai/app"),
      lastSafeTarget,
      availableIdentities: [platform, member],
      correspondence: "unknown",
      reason: "user",
    }).target).toEqual(lastSafeTarget);
  });

  it("falls back from an unknown route and replaces on authority loss", () => {
    expect(resolveGlobalSpaceDestination({
      currentIdentity: host,
      targetIdentity: member,
      currentTarget: target("/clubs/reading-sai/app/host/unknown"),
      lastSafeTarget: null,
      availableIdentities: [member],
      correspondence: "unavailable",
      reason: "authority-loss",
    })).toEqual({
      identity: member,
      target: target("/clubs/reading-sai/app"),
      navigation: "replace",
    });
  });
});

describe("transition timeout contract", () => {
  it.each([
    [undefined, 30_000],
    [5_000, 5_000],
    [30_001, 30_000],
  ])("normalizes %s to %s", (input, expected) => {
    expect(normalizePendingTimeout(input)).toBe(expected);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "rejects %s",
    (input) => {
      expect(() => normalizePendingTimeout(input)).toThrow("INVALID_TRANSITION_TIMEOUT");
    },
  );
});

function publicationSpies() {
  return {
    ui: vi.fn(),
    cache: vi.fn(),
    receipt: vi.fn(),
    successCopy: vi.fn(),
    errorCopy: vi.fn(),
    navigation: vi.fn(),
    returnTarget: vi.fn(),
    sessionStorage: vi.fn(),
  };
}

function expectNoPublication(publication: ReturnType<typeof publicationSpies>) {
  for (const publish of Object.values(publication)) {
    expect(publish).not.toHaveBeenCalled();
  }
}

function publicationPort(publication: ReturnType<typeof publicationSpies>): TransitionPublicationPort {
  return {
    currentOwnerRefetch: (observation) => {
      for (const publish of Object.values(publication)) publish(observation);
    },
  };
}

describe("global space transition coordinator", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("blocks while pending and promotes the same registration to unknown outcome at timeout", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const coordinator = createGlobalSpaceTransitionCoordinator();
    const recovery = {
      kind: "authoritative-history" as const,
      operationId: "operation-1",
      reconcile: vi.fn(async () => ({ operationId: "operation-1", outcome: "still-unknown" as const })),
    };

    const handle = coordinator.beginPending({ ownerId: "owner-1", operationId: "operation-1", recovery });

    expect(coordinator.getSnapshot()).toMatchObject({
      kind: "pending",
      ownerId: "owner-1",
      operationId: "operation-1",
      generation: handle.generation,
      startedAt: 1_000,
      timeoutAt: 31_000,
      recovery,
    });

    act(() => vi.advanceTimersByTime(29_999));
    expect(coordinator.getSnapshot().kind).toBe("pending");
    act(() => vi.advanceTimersByTime(1));
    expect(coordinator.getSnapshot()).toEqual({
      kind: "unknown-outcome",
      operationId: "operation-1",
      generation: handle.generation,
      recovery,
    });
    expect(recovery.reconcile).not.toHaveBeenCalled();
  });

  it("publishes only a current-generation unknown-outcome observation through the refetch sink", async () => {
    vi.useFakeTimers();
    const publication = publicationSpies();
    const reconcile = vi.fn(async () => ({ operationId: "history-1", outcome: "succeeded" as const }));
    const coordinator = createGlobalSpaceTransitionCoordinator({ publication: publicationPort(publication) });
    const handle = coordinator.beginPending({
      ownerId: "owner-1",
      operationId: "history-1",
      timeoutMs: 10,
      recovery: { kind: "authoritative-history", operationId: "history-1", reconcile },
    });
    act(() => vi.advanceTimersByTime(10));

    await expect(handle.reconcile()).resolves.toEqual({ operationId: "history-1", outcome: "succeeded" });

    expect(reconcile).toHaveBeenCalledTimes(1);
    for (const publish of Object.values(publication)) expect(publish).toHaveBeenCalledTimes(1);
    expect(coordinator.getSnapshot()).toEqual({ kind: "clean" });
  });

  it("registers dirty state until the exact owner token unregisters", () => {
    const coordinator = createGlobalSpaceTransitionCoordinator();
    const unregister = coordinator.registerDirty("editor-1", "변경 내용을 저장하지 않았습니다.");

    expect(coordinator.getSnapshot()).toEqual({ kind: "dirty", message: "변경 내용을 저장하지 않았습니다." });
    unregister();
    unregister();
    expect(coordinator.getSnapshot()).toEqual({ kind: "clean" });
  });

  it("normal unmount performs at most one same-identity receipt lookup and always clears in finally", async () => {
    const registry = createRetiredReceiptCapsuleRegistry();
    const publication = publicationSpies();
    const request = {
      previewId: "preview-1" as string | null,
      reasonCategory: "SECURITY_REVIEW" as string | null,
      reason: "safe reason" as string | null,
      idempotencyKey: "intent-1" as string | null,
    };
    const originalBytes = JSON.stringify(request);
    let replayCount = 0;
    const capsule: ReceiptRecoveryCapsule = {
      operationId: "operation-1",
      reconcileOriginal: vi.fn(async () => {
        replayCount += 1;
        expect(JSON.stringify(request)).toBe(originalBytes);
        throw new Error("response lost again");
      }),
      invalidateForAuthorityLoss: vi.fn(),
      clear: vi.fn(() => {
        request.previewId = null;
        request.reasonCategory = null;
        request.reason = null;
        request.idempotencyKey = null;
      }),
    };
    const coordinator = createGlobalSpaceTransitionCoordinator({ registry, publication: publicationPort(publication) });
    const handle = coordinator.beginPending({
      ownerId: "owner-1",
      operationId: "operation-1",
      recovery: { kind: "receipt", capsule },
    });

    handle.unregister();
    expect(registry.size()).toBe(1);
    await Promise.resolve();
    await Promise.resolve();
    await expect(handle.reconcile()).rejects.toThrow("response lost again");
    await expect(handle.reconcile()).rejects.toThrow("response lost again");

    expect(replayCount).toBe(1);
    expect(capsule.clear).toHaveBeenCalledTimes(1);
    expect(request).toEqual({ previewId: null, reasonCategory: null, reason: null, idempotencyKey: null });
    expect(registry.size()).toBe(0);
    await expect(handle.settle("succeeded")).resolves.toBe("obsolete");
    expectNoPublication(publication);
  });

  it("accepts settlement only for the active owner generation", async () => {
    const coordinator = createGlobalSpaceTransitionCoordinator();
    const first = coordinator.beginPending({
      ownerId: "owner-1",
      operationId: "operation-1",
      recovery: {
        kind: "authoritative-history",
        operationId: "operation-1",
        reconcile: vi.fn(async () => ({ operationId: "operation-1", outcome: "succeeded" as const })),
      },
    });

    await expect(first.settle("succeeded")).resolves.toBe("accepted");
    await expect(first.settle("failed")).resolves.toBe("obsolete");
    expect(coordinator.getSnapshot()).toEqual({ kind: "clean" });
  });

  it("invalidates and clears an active receipt synchronously before any later recovery", async () => {
    const registry = createRetiredReceiptCapsuleRegistry();
    const capsule: ReceiptRecoveryCapsule = {
      operationId: "active-1",
      reconcileOriginal: vi.fn(async () => ({ operationId: "active-1", outcome: "still-unknown" as const })),
      invalidateForAuthorityLoss: vi.fn(),
      clear: vi.fn(),
    };
    const coordinator = createGlobalSpaceTransitionCoordinator({ registry });
    const handle = coordinator.beginPending({
      ownerId: "active-owner",
      operationId: "active-1",
      recovery: { kind: "receipt", capsule },
    });

    coordinator.invalidateForAuthorityLoss();
    handle.unregister();

    expect(capsule.invalidateForAuthorityLoss).toHaveBeenCalledTimes(1);
    expect(capsule.clear).toHaveBeenCalledTimes(1);
    expect(registry.size()).toBe(0);
    await expect(handle.reconcile()).resolves.toEqual({ operationId: "active-1", outcome: "authority-lost" });
    expect(capsule.reconcileOriginal).not.toHaveBeenCalled();
  });

  it("invalidates active and retired receipts before purge and permits zero authority-loss replay", async () => {
    const registry = createRetiredReceiptCapsuleRegistry();
    const publication = publicationSpies();
    const order: string[] = [];
    const request = {
      previewId: "preview-1" as string | null,
      reasonCategory: "SECURITY_REVIEW" as string | null,
      reason: "safe reason" as string | null,
      idempotencyKey: "intent-1" as string | null,
    };
    const originalRequestCount = 1;
    let replayCount = 0;
    const capsule: ReceiptRecoveryCapsule = {
      operationId: "operation-1",
      reconcileOriginal: vi.fn(async () => {
        replayCount += 1;
        return { operationId: "operation-1", outcome: "still-unknown" as const };
      }),
      invalidateForAuthorityLoss: vi.fn(() => order.push("invalidate")),
      clear: vi.fn(() => {
        order.push("clear");
        request.previewId = null;
        request.reasonCategory = null;
        request.reason = null;
        request.idempotencyKey = null;
      }),
    };
    const coordinator = createGlobalSpaceTransitionCoordinator({
      registry,
      publication: publicationPort(publication),
      onAuthorityLossPurge: () => {
        order.push("purge");
        expect(request).toEqual({ previewId: null, reasonCategory: null, reason: null, idempotencyKey: null });
      },
    });
    const handle = coordinator.beginPending({
      ownerId: "owner-1",
      operationId: "operation-1",
      recovery: { kind: "receipt", capsule },
    });

    handle.unregister();
    expect(registry.size()).toBe(1);
    coordinator.invalidateForAuthorityLoss();
    const settlement = await handle.settle("succeeded");
    const observation = await handle.reconcile();

    expect(originalRequestCount).toBe(1);
    expect(replayCount).toBe(0);
    expect(settlement).toBe("obsolete");
    expect(observation).toEqual({ operationId: "operation-1", outcome: "authority-lost" });
    expect(order.slice(0, 3)).toEqual(["invalidate", "clear", "purge"]);
    expect(request).toEqual({ previewId: null, reasonCategory: null, reason: null, idempotencyKey: null });
    expect(registry.size()).toBe(0);
    expectNoPublication(publication);
  });

  it("skips authoritative-history I/O when latest authority is absent", async () => {
    const publication = publicationSpies();
    const reconcile = vi.fn(async () => ({ operationId: "history-1", outcome: "succeeded" as const }));
    const coordinator = createGlobalSpaceTransitionCoordinator({ publication: publicationPort(publication) });
    const handle = coordinator.beginPending({
      ownerId: "owner-1",
      operationId: "history-1",
      recovery: { kind: "authoritative-history", operationId: "history-1", reconcile },
    });

    coordinator.invalidateForAuthorityLoss();

    await expect(handle.reconcile()).resolves.toEqual({ operationId: "history-1", outcome: "authority-lost" });
    expect(reconcile).not.toHaveBeenCalled();
    expectNoPublication(publication);
  });
});
