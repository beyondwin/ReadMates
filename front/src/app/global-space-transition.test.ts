import { act } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  PendingHandle,
  ReceiptRecoveryCapsule,
  RecoveryObservation,
  ReturnTarget,
  SpaceIdentity,
  TransitionPublicationBoundaryPort,
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
    })?.target).toEqual(lastSafeTarget);
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

  it.each(["user", "authority-loss"] as const)(
    "returns no %s destination when the available-space projection is empty",
    (reason) => {
      expect(resolveGlobalSpaceDestination({
        currentIdentity: member,
        targetIdentity: host,
        currentTarget: target("/clubs/reading-sai/app"),
        lastSafeTarget: target("/clubs/reading-sai/app/host"),
        availableIdentities: [],
        correspondence: "unknown",
        reason,
      })).toBeNull();
    },
  );

  it("returns no destination when every projected identity is malformed", () => {
    expect(resolveGlobalSpaceDestination({
      currentIdentity: member,
      targetIdentity: host,
      currentTarget: target("/clubs/reading-sai/app"),
      lastSafeTarget: null,
      availableIdentities: [
        { productSpace: "clubs", clubId: "", clubSlug: "", perspective: "host" },
      ],
      correspondence: "unknown",
      reason: "user",
    })).toBeNull();
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

function publicationPort() {
  return {
    currentOwnerRefetch: vi.fn((observation: RecoveryObservation) => observation),
  } satisfies TransitionPublicationPort;
}

function publicationBoundaries() {
  const observe = () => vi.fn((observation: RecoveryObservation) => observation);
  return {
    ui: observe(),
    cache: observe(),
    receiptCallback: observe(),
    successCopy: observe(),
    errorCopy: observe(),
    navigation: observe(),
    returnTarget: observe(),
    sessionStorage: observe(),
  } satisfies TransitionPublicationBoundaryPort;
}

function expectNoBoundaryPublication(boundaries: ReturnType<typeof publicationBoundaries>) {
  expect(boundaries.ui).not.toHaveBeenCalled();
  expect(boundaries.cache).not.toHaveBeenCalled();
  expect(boundaries.receiptCallback).not.toHaveBeenCalled();
  expect(boundaries.successCopy).not.toHaveBeenCalled();
  expect(boundaries.errorCopy).not.toHaveBeenCalled();
  expect(boundaries.navigation).not.toHaveBeenCalled();
  expect(boundaries.returnTarget).not.toHaveBeenCalled();
  expect(boundaries.sessionStorage).not.toHaveBeenCalled();
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
    const publication = publicationPort();
    const publicationBoundary = publicationBoundaries();
    const reconcile = vi.fn(async () => ({ operationId: "history-1", outcome: "succeeded" as const }));
    const coordinator = createGlobalSpaceTransitionCoordinator({ publication, publicationBoundary });
    const handle = coordinator.beginPending({
      ownerId: "owner-1",
      operationId: "history-1",
      timeoutMs: 10,
      recovery: { kind: "authoritative-history", operationId: "history-1", reconcile },
    });
    act(() => vi.advanceTimersByTime(10));

    await expect(handle.reconcile()).resolves.toEqual({ operationId: "history-1", outcome: "succeeded" });

    expect(reconcile).toHaveBeenCalledTimes(1);
    expect(publication.currentOwnerRefetch).toHaveBeenCalledTimes(1);
    expect(publicationBoundary.ui).toHaveBeenCalledTimes(1);
    expect(publicationBoundary.cache).toHaveBeenCalledTimes(1);
    expect(publicationBoundary.receiptCallback).toHaveBeenCalledTimes(1);
    expect(publicationBoundary.successCopy).toHaveBeenCalledTimes(1);
    expect(publicationBoundary.errorCopy).toHaveBeenCalledTimes(1);
    expect(publicationBoundary.navigation).toHaveBeenCalledTimes(1);
    expect(publicationBoundary.returnTarget).toHaveBeenCalledTimes(1);
    expect(publicationBoundary.sessionStorage).toHaveBeenCalledTimes(1);
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

  it("makes dirty registration a no-op after authority loss", () => {
    const coordinator = createGlobalSpaceTransitionCoordinator();
    coordinator.invalidateForAuthorityLoss();
    const listener = vi.fn();
    coordinator.subscribe(listener);

    const unregister = coordinator.registerDirty("late-owner", "must never surface");

    expect(coordinator.getSnapshot()).toEqual({ kind: "clean" });
    expect(listener).not.toHaveBeenCalled();
    unregister();
    unregister();
    expect(coordinator.getSnapshot()).toEqual({ kind: "clean" });
    expect(listener).not.toHaveBeenCalled();
  });

  it("returns a cleared receipt tombstone when pending registration starts after authority loss", async () => {
    const registry = createRetiredReceiptCapsuleRegistry();
    const publication = publicationPort();
    const publicationBoundary = publicationBoundaries();
    const timerHandle = {} as ReturnType<typeof globalThis.setTimeout>;
    const setTimer = vi.fn(() => timerHandle);
    const request = {
      previewId: "late-preview" as string | null,
      idempotencyKey: "late-intent" as string | null,
    };
    const capsule: ReceiptRecoveryCapsule = {
      operationId: "late-operation",
      reconcileOriginal: vi.fn(async () => ({ operationId: "late-operation", outcome: "succeeded" as const })),
      invalidateForAuthorityLoss: vi.fn(),
      clear: vi.fn(() => {
        request.previewId = null;
        request.idempotencyKey = null;
      }),
    };
    const coordinator = createGlobalSpaceTransitionCoordinator({
      registry,
      publication,
      publicationBoundary,
      setTimer,
    });
    coordinator.invalidateForAuthorityLoss();

    const handle = coordinator.beginPending({
      ownerId: "late-owner",
      operationId: "late-operation",
      recovery: { kind: "receipt", capsule },
    });

    expect(capsule.invalidateForAuthorityLoss).toHaveBeenCalledTimes(1);
    expect(capsule.clear).toHaveBeenCalledTimes(1);
    expect(request).toEqual({ previewId: null, idempotencyKey: null });
    expect(setTimer).not.toHaveBeenCalled();
    expect(registry.size()).toBe(0);
    expect(coordinator.getSnapshot()).toEqual({ kind: "clean" });
    await expect(handle.settle("succeeded")).resolves.toBe("obsolete");
    handle.unregister();
    await expect(handle.reconcile()).resolves.toEqual({
      operationId: "late-operation",
      outcome: "authority-lost",
    });
    expect(capsule.reconcileOriginal).not.toHaveBeenCalled();
    expect(publication.currentOwnerRefetch).not.toHaveBeenCalled();
    expectNoBoundaryPublication(publicationBoundary);
    expect(capsule.invalidateForAuthorityLoss).toHaveBeenCalledTimes(1);
    expect(capsule.clear).toHaveBeenCalledTimes(1);
  });

  it("tombstones dirty and receipt registrations reentered from authority cleanup callbacks", async () => {
    const registry = createRetiredReceiptCapsuleRegistry();
    const publication = publicationPort();
    const publicationBoundary = publicationBoundaries();
    const timerHandle = {} as ReturnType<typeof globalThis.setTimeout>;
    const setTimer = vi.fn(() => timerHandle);
    const clearTimer = vi.fn();
    const listener = vi.fn();
    const reentrant: {
      unregisterDirty: (() => void) | null;
      lateHandle: PendingHandle | null;
    } = { unregisterDirty: null, lateHandle: null };
    const lateRequest = { idempotencyKey: "late-intent" as string | null };
    const lateCapsule: ReceiptRecoveryCapsule = {
      operationId: "late-operation",
      reconcileOriginal: vi.fn(async () => ({ operationId: "late-operation", outcome: "succeeded" as const })),
      invalidateForAuthorityLoss: vi.fn(),
      clear: vi.fn(() => {
        lateRequest.idempotencyKey = null;
      }),
    };
    const primaryCapsule: ReceiptRecoveryCapsule = {
      operationId: "primary-operation",
      reconcileOriginal: vi.fn(async () => ({ operationId: "primary-operation", outcome: "succeeded" as const })),
      invalidateForAuthorityLoss: vi.fn(() => {
        reentrant.unregisterDirty = coordinator.registerDirty("reentrant-dirty", "must never surface");
      }),
      clear: vi.fn(() => {
        reentrant.lateHandle = coordinator.beginPending({
          ownerId: "reentrant-pending",
          operationId: "late-operation",
          recovery: { kind: "receipt", capsule: lateCapsule },
        });
      }),
    };
    const coordinator = createGlobalSpaceTransitionCoordinator({
      registry,
      publication,
      publicationBoundary,
      setTimer,
      clearTimer,
    });
    const primaryHandle = coordinator.beginPending({
      ownerId: "primary-owner",
      operationId: "primary-operation",
      recovery: { kind: "receipt", capsule: primaryCapsule },
    });
    coordinator.subscribe(listener);

    coordinator.invalidateForAuthorityLoss();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(setTimer).toHaveBeenCalledTimes(1);
    expect(clearTimer).toHaveBeenCalledTimes(1);
    expect(primaryCapsule.invalidateForAuthorityLoss).toHaveBeenCalledTimes(1);
    expect(primaryCapsule.clear).toHaveBeenCalledTimes(1);
    expect(lateCapsule.invalidateForAuthorityLoss).toHaveBeenCalledTimes(1);
    expect(lateCapsule.clear).toHaveBeenCalledTimes(1);
    expect(lateRequest.idempotencyKey).toBeNull();
    expect(registry.size()).toBe(0);
    expect(coordinator.getSnapshot()).toEqual({ kind: "clean" });
    reentrant.unregisterDirty?.();
    if (!reentrant.lateHandle) throw new Error("REENTRANT_HANDLE_NOT_CAPTURED");
    await expect(primaryHandle.settle("succeeded")).resolves.toBe("obsolete");
    await expect(reentrant.lateHandle.settle("succeeded")).resolves.toBe("obsolete");
    await expect(reentrant.lateHandle.reconcile()).resolves.toEqual({
      operationId: "late-operation",
      outcome: "authority-lost",
    });
    expect(lateCapsule.reconcileOriginal).not.toHaveBeenCalled();
    expect(publication.currentOwnerRefetch).not.toHaveBeenCalled();
    expectNoBoundaryPublication(publicationBoundary);
    expect(lateCapsule.invalidateForAuthorityLoss).toHaveBeenCalledTimes(1);
    expect(lateCapsule.clear).toHaveBeenCalledTimes(1);
  });

  it("normal unmount performs at most one same-identity receipt lookup and always clears in finally", async () => {
    const registry = createRetiredReceiptCapsuleRegistry();
    const publication = publicationPort();
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
    const coordinator = createGlobalSpaceTransitionCoordinator({ registry, publication });
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
    expect(publication.currentOwnerRefetch).not.toHaveBeenCalled();
  });

  it("atomically retires an overlapping registration for the same owner without resurrecting it", async () => {
    const registry = createRetiredReceiptCapsuleRegistry();
    const publication = publicationPort();
    const firstCapsule: ReceiptRecoveryCapsule = {
      operationId: "operation-1",
      reconcileOriginal: vi.fn(async () => ({ operationId: "operation-1", outcome: "succeeded" as const })),
      invalidateForAuthorityLoss: vi.fn(),
      clear: vi.fn(),
    };
    const coordinator = createGlobalSpaceTransitionCoordinator({ registry, publication });
    const first = coordinator.beginPending({
      ownerId: "owner-1",
      operationId: "operation-1",
      recovery: { kind: "receipt", capsule: firstCapsule },
    });
    const second = coordinator.beginPending({
      ownerId: "owner-1",
      operationId: "operation-2",
      recovery: {
        kind: "authoritative-history",
        operationId: "operation-2",
        reconcile: vi.fn(async () => ({ operationId: "operation-2", outcome: "succeeded" as const })),
      },
    });

    expect(coordinator.getSnapshot()).toMatchObject({ kind: "pending", operationId: "operation-2" });
    expect(registry.size()).toBe(1);
    await expect(first.settle("succeeded")).resolves.toBe("obsolete");
    await expect(first.reconcile()).resolves.toEqual({ operationId: "operation-1", outcome: "succeeded" });
    expect(firstCapsule.reconcileOriginal).toHaveBeenCalledTimes(1);
    expect(firstCapsule.clear).toHaveBeenCalledTimes(1);
    expect(registry.size()).toBe(0);
    expect(publication.currentOwnerRefetch).not.toHaveBeenCalled();

    await expect(second.settle("succeeded")).resolves.toBe("accepted");
    expect(coordinator.getSnapshot()).toEqual({ kind: "clean" });
  });

  it("does not obsolete a current pending registration when a dirty token unregisters", async () => {
    const coordinator = createGlobalSpaceTransitionCoordinator();
    const pending = coordinator.beginPending({
      ownerId: "owner-1",
      operationId: "operation-1",
      recovery: {
        kind: "authoritative-history",
        operationId: "operation-1",
        reconcile: vi.fn(async () => ({ operationId: "operation-1", outcome: "succeeded" as const })),
      },
    });
    const unregisterDirty = coordinator.registerDirty("owner-1", "unsaved");

    unregisterDirty();

    expect(coordinator.getSnapshot()).toMatchObject({ kind: "pending", operationId: "operation-1" });
    await expect(pending.settle("succeeded")).resolves.toBe("accepted");
  });

  it("keeps every different-owner registration blocking until that owner settles", async () => {
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
    const second = coordinator.beginPending({
      ownerId: "owner-2",
      operationId: "operation-2",
      recovery: {
        kind: "authoritative-history",
        operationId: "operation-2",
        reconcile: vi.fn(async () => ({ operationId: "operation-2", outcome: "succeeded" as const })),
      },
    });

    expect(coordinator.getSnapshot()).toMatchObject({ kind: "pending", operationId: "operation-2" });
    await expect(second.settle("succeeded")).resolves.toBe("accepted");
    expect(coordinator.getSnapshot()).toMatchObject({ kind: "pending", operationId: "operation-1" });
    await expect(first.settle("failed")).resolves.toBe("accepted");
    expect(coordinator.getSnapshot()).toEqual({ kind: "clean" });
  });

  it("allows each still-current owner to publish its own recovery observation", async () => {
    vi.useFakeTimers();
    const publication = publicationPort();
    const coordinator = createGlobalSpaceTransitionCoordinator({ publication });
    const first = coordinator.beginPending({
      ownerId: "owner-1",
      operationId: "operation-1",
      timeoutMs: 10,
      recovery: {
        kind: "authoritative-history",
        operationId: "operation-1",
        reconcile: vi.fn(async () => ({ operationId: "operation-1", outcome: "succeeded" as const })),
      },
    });
    const second = coordinator.beginPending({
      ownerId: "owner-2",
      operationId: "operation-2",
      timeoutMs: 10,
      recovery: {
        kind: "authoritative-history",
        operationId: "operation-2",
        reconcile: vi.fn(async () => ({ operationId: "operation-2", outcome: "failed" as const })),
      },
    });
    act(() => vi.advanceTimersByTime(10));

    await expect(first.reconcile()).resolves.toEqual({ operationId: "operation-1", outcome: "succeeded" });
    expect(coordinator.getSnapshot()).toMatchObject({ kind: "unknown-outcome", operationId: "operation-2" });
    await expect(second.reconcile()).resolves.toEqual({ operationId: "operation-2", outcome: "failed" });

    expect(publication.currentOwnerRefetch.mock.calls.map(([observation]) => observation)).toEqual([
      { operationId: "operation-1", outcome: "succeeded" },
      { operationId: "operation-2", outcome: "failed" },
    ]);
    expect(coordinator.getSnapshot()).toEqual({ kind: "clean" });
  });

  it.each(["receipt", "authoritative-history"] as const)(
    "rejects a mismatched %s recovery identity synchronously without I/O",
    (kind) => {
      const reconcile = vi.fn(async () => ({ operationId: "recovery-operation", outcome: "succeeded" as const }));
      const capsule: ReceiptRecoveryCapsule = {
        operationId: "recovery-operation",
        reconcileOriginal: reconcile,
        invalidateForAuthorityLoss: vi.fn(),
        clear: vi.fn(),
      };
      const coordinator = createGlobalSpaceTransitionCoordinator();

      expect(() => coordinator.beginPending({
        ownerId: "owner-1",
        operationId: "registration-operation",
        recovery: kind === "receipt"
          ? { kind, capsule }
          : { kind, operationId: "recovery-operation", reconcile },
      })).toThrow("RECOVERY_OPERATION_ID_MISMATCH");

      expect(reconcile).not.toHaveBeenCalled();
      expect(capsule.invalidateForAuthorityLoss).not.toHaveBeenCalled();
      expect(capsule.clear).not.toHaveBeenCalled();
      expect(coordinator.getSnapshot()).toEqual({ kind: "clean" });
    },
  );

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
    const publication = publicationPort();
    const publicationBoundary = publicationBoundaries();
    const order: string[] = [];
    let originalRequestCount = 0;
    const issueOriginalRequest = () => {
      originalRequestCount += 1;
      return {
        previewId: "preview-1" as string | null,
        reasonCategory: "SECURITY_REVIEW" as string | null,
        reason: "safe reason" as string | null,
        idempotencyKey: "intent-1" as string | null,
      };
    };
    const request = issueOriginalRequest();
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
      publication,
      publicationBoundary,
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
    expect(publication.currentOwnerRefetch).not.toHaveBeenCalled();
    expectNoBoundaryPublication(publicationBoundary);
  });

  it("returns authority-lost and publishes nothing when authority changes while recovery awaits", async () => {
    let resolveRecovery!: (observation: RecoveryObservation) => void;
    const recoveryResult = new Promise<RecoveryObservation>((resolve) => {
      resolveRecovery = resolve;
    });
    const publication = publicationPort();
    const capsule: ReceiptRecoveryCapsule = {
      operationId: "operation-1",
      reconcileOriginal: vi.fn(() => recoveryResult),
      invalidateForAuthorityLoss: vi.fn(),
      clear: vi.fn(),
    };
    const coordinator = createGlobalSpaceTransitionCoordinator({ publication });
    const handle = coordinator.beginPending({
      ownerId: "owner-1",
      operationId: "operation-1",
      recovery: { kind: "receipt", capsule },
    });
    handle.unregister();
    await Promise.resolve();
    expect(capsule.reconcileOriginal).toHaveBeenCalledTimes(1);

    coordinator.invalidateForAuthorityLoss();
    resolveRecovery({ operationId: "operation-1", outcome: "succeeded" });

    await expect(handle.reconcile()).resolves.toEqual({ operationId: "operation-1", outcome: "authority-lost" });
    expect(publication.currentOwnerRefetch).not.toHaveBeenCalled();
    expect(capsule.invalidateForAuthorityLoss).toHaveBeenCalledTimes(1);
    expect(capsule.clear).toHaveBeenCalledTimes(1);
  });

  it("isolates capsule and purge exceptions until every authority-loss cleanup has run", async () => {
    const cleanupErrors = vi.fn();
    const order: string[] = [];
    const firstCapsule: ReceiptRecoveryCapsule = {
      operationId: "operation-1",
      reconcileOriginal: vi.fn(async () => ({ operationId: "operation-1", outcome: "still-unknown" as const })),
      invalidateForAuthorityLoss: vi.fn(() => {
        order.push("first-invalidate");
        throw new Error("first invalidate failed");
      }),
      clear: vi.fn(() => {
        order.push("first-clear");
        throw new Error("first clear failed");
      }),
    };
    const secondCapsule: ReceiptRecoveryCapsule = {
      operationId: "operation-2",
      reconcileOriginal: vi.fn(async () => ({ operationId: "operation-2", outcome: "still-unknown" as const })),
      invalidateForAuthorityLoss: vi.fn(() => order.push("second-invalidate")),
      clear: vi.fn(() => order.push("second-clear")),
    };
    const coordinator = createGlobalSpaceTransitionCoordinator({
      onAuthorityLossPurge: () => {
        order.push("purge");
        throw new Error("purge failed");
      },
      onSafetyCleanupError: cleanupErrors,
    });
    const first = coordinator.beginPending({
      ownerId: "owner-1",
      operationId: "operation-1",
      recovery: { kind: "receipt", capsule: firstCapsule },
    });
    const second = coordinator.beginPending({
      ownerId: "owner-2",
      operationId: "operation-2",
      recovery: { kind: "receipt", capsule: secondCapsule },
    });

    expect(() => coordinator.invalidateForAuthorityLoss()).not.toThrow();

    expect(order).toEqual([
      "first-invalidate",
      "first-clear",
      "second-invalidate",
      "second-clear",
      "purge",
    ]);
    expect(cleanupErrors).toHaveBeenCalledTimes(1);
    expect(cleanupErrors.mock.calls[0]?.[0]).toBeInstanceOf(AggregateError);
    expect(cleanupErrors.mock.calls[0]?.[0].errors).toHaveLength(3);
    await expect(first.settle("succeeded")).resolves.toBe("obsolete");
    await expect(second.settle("failed")).resolves.toBe("obsolete");
    expect(coordinator.getSnapshot()).toEqual({ kind: "clean" });
  });

  it("skips authoritative-history I/O when latest authority is absent", async () => {
    const publication = publicationPort();
    const reconcile = vi.fn(async () => ({ operationId: "history-1", outcome: "succeeded" as const }));
    const coordinator = createGlobalSpaceTransitionCoordinator({ publication });
    const handle = coordinator.beginPending({
      ownerId: "owner-1",
      operationId: "history-1",
      recovery: { kind: "authoritative-history", operationId: "history-1", reconcile },
    });

    coordinator.invalidateForAuthorityLoss();

    await expect(handle.reconcile()).resolves.toEqual({ operationId: "history-1", outcome: "authority-lost" });
    expect(reconcile).not.toHaveBeenCalled();
    expect(publication.currentOwnerRefetch).not.toHaveBeenCalled();
  });
});
