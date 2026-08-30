import type {
  PendingHandle,
  PendingRegistration,
  ReceiptRecoveryCapsule,
  RecoveryObservation,
  RecoveryStrategy,
  RetiredReceiptCapsuleRegistry,
  ReturnTarget,
  SpaceIdentity,
  TransitionPublicationPort,
  TransitionSafety,
  TransitionSafetyRegistrationPort,
} from "@/shared/model/global-space";
import {
  representativeSpaceReturnTarget,
  sameSpaceIdentity,
} from "@/shared/model/global-space";
import {
  candidateRoleSwitchTarget,
  resolveAuthorizedRoleSwitchTarget,
} from "./workspace-route-model";

export const DEFAULT_TRANSITION_PENDING_TIMEOUT_MS = 30_000;

export function normalizePendingTimeout(timeoutMs: number | undefined): number {
  if (timeoutMs === undefined) return DEFAULT_TRANSITION_PENDING_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error("INVALID_TRANSITION_TIMEOUT");
  }
  return Math.min(timeoutMs, DEFAULT_TRANSITION_PENDING_TIMEOUT_MS);
}

export function createRetiredReceiptCapsuleRegistry(
  recordCleanupError: (error: unknown) => void = () => undefined,
): RetiredReceiptCapsuleRegistry {
  const entries = new Map<string, ReceiptRecoveryCapsule>();

  return {
    retain(ownerId, generation, capsule) {
      const key = `${ownerId}:${generation}`;
      entries.set(key, capsule);
      return () => {
        if (entries.get(key) === capsule) entries.delete(key);
      };
    },
    invalidateAndClearAll() {
      const capsules = [...entries.values()];
      entries.clear();
      for (const capsule of capsules) {
        try {
          capsule.invalidateForAuthorityLoss();
        } catch (error) {
          recordCleanupError(error);
        }
        try {
          capsule.clear();
        } catch (error) {
          recordCleanupError(error);
        }
      }
    },
    size() {
      return entries.size;
    },
  };
}

type TimerHandle = ReturnType<typeof globalThis.setTimeout>;

type CoordinatorOptions = {
  registry?: RetiredReceiptCapsuleRegistry;
  publication?: TransitionPublicationPort;
  now?: () => number;
  setTimer?: (callback: () => void, timeoutMs: number) => TimerHandle;
  clearTimer?: (timer: TimerHandle) => void;
  onAuthorityLossPurge?: () => void;
  onSafetyCleanupError?: (error: AggregateError) => void;
};

type ActiveRegistration = {
  token: symbol;
  ownerId: string;
  operationId: string;
  generation: number;
  recovery: RecoveryStrategy;
  safety: Extract<TransitionSafety, { kind: "pending" | "unknown-outcome" }>;
  timer: TimerHandle | null;
  retire: (advanceGeneration: boolean, notify: boolean) => void;
};

export type GlobalSpaceTransitionCoordinator = TransitionSafetyRegistrationPort & {
  getSnapshot: () => TransitionSafety;
  subscribe: (listener: () => void) => () => void;
  invalidateForAuthorityLoss: () => void;
};

export function createGlobalSpaceTransitionCoordinator(
  options: CoordinatorOptions = {},
): GlobalSpaceTransitionCoordinator {
  const cleanupErrors: unknown[] = [];
  const recordCleanupError = (error: unknown) => cleanupErrors.push(error);
  const registry = options.registry ?? createRetiredReceiptCapsuleRegistry(recordCleanupError);
  const publication = options.publication;
  const now = options.now ?? Date.now;
  const setTimer = options.setTimer ?? ((callback, timeoutMs) => globalThis.setTimeout(callback, timeoutMs));
  const clearTimer = options.clearTimer ?? ((timer) => globalThis.clearTimeout(timer));
  const ownerGenerations = new Map<string, number>();
  const active = new Map<symbol, ActiveRegistration>();
  const dirty = new Map<symbol, { ownerId: string; message: string }>();
  const listeners = new Set<() => void>();
  let authorityAvailable = true;

  function reportCleanupErrorsSince(startIndex: number) {
    const currentErrors = cleanupErrors.slice(startIndex);
    if (currentErrors.length === 0) return;
    try {
      options.onSafetyCleanupError?.(
        new AggregateError(currentErrors, "GLOBAL_SPACE_TRANSITION_CLEANUP_FAILED"),
      );
    } catch {
      // Reporting is observational and must never interrupt safety cleanup.
    }
  }

  function emit() {
    for (const listener of listeners) listener();
  }

  function getSnapshot(): TransitionSafety {
    // This is the aggregate blocking projection: any current pending owner wins
    // over dirty state, and settling the newest visible owner reveals the next.
    // Recovery publication remains independently generation-checked per owner.
    const pending = [...active.values()].at(-1);
    if (pending) return pending.safety;
    const dirtyRegistration = [...dirty.values()].at(-1);
    if (dirtyRegistration) return { kind: "dirty", message: dirtyRegistration.message };
    return { kind: "clean" };
  }

  function current(entry: ActiveRegistration) {
    return authorityAvailable
      && active.get(entry.token) === entry
      && ownerGenerations.get(entry.ownerId) === entry.generation;
  }

  function removeActive(entry: ActiveRegistration) {
    if (entry.timer !== null) {
      clearTimer(entry.timer);
      entry.timer = null;
    }
    active.delete(entry.token);
  }

  function managedReceiptCapsule(capsule: ReceiptRecoveryCapsule): ReceiptRecoveryCapsule {
    let invalidated = false;
    let cleared = false;
    return {
      operationId: capsule.operationId,
      reconcileOriginal() {
        if (invalidated || cleared) {
          return Promise.resolve({ operationId: capsule.operationId, outcome: "authority-lost" });
        }
        return capsule.reconcileOriginal();
      },
      invalidateForAuthorityLoss() {
        if (invalidated) return;
        invalidated = true;
        try {
          capsule.invalidateForAuthorityLoss();
        } catch (error) {
          recordCleanupError(error);
        }
      },
      clear() {
        if (cleared) return;
        cleared = true;
        try {
          capsule.clear();
        } catch (error) {
          recordCleanupError(error);
        }
      },
    };
  }

  function publish(observation: RecoveryObservation) {
    publication?.currentOwnerRefetch(observation);
  }

  function registerDirty(ownerId: string, message: string) {
    const token = Symbol(ownerId);
    dirty.set(token, { ownerId, message });
    emit();
    return () => {
      if (!dirty.delete(token)) return;
      emit();
    };
  }

  function beginPending(registration: PendingRegistration): PendingHandle {
    const recoveryOperationId = registration.recovery.kind === "receipt"
      ? registration.recovery.capsule.operationId
      : registration.recovery.operationId;
    if (registration.operationId !== recoveryOperationId) {
      throw new Error("RECOVERY_OPERATION_ID_MISMATCH");
    }
    const timeoutMs = normalizePendingTimeout(registration.timeoutMs);
    const generation = (ownerGenerations.get(registration.ownerId) ?? 0) + 1;
    ownerGenerations.set(registration.ownerId, generation);
    for (const previous of [...active.values()]) {
      if (previous.ownerId === registration.ownerId) previous.retire(false, false);
    }
    const token = Symbol(`${registration.ownerId}:${generation}`);
    const startedAt = now();
    const capsule = registration.recovery.kind === "receipt"
      ? managedReceiptCapsule(registration.recovery.capsule)
      : null;
    const recovery: RecoveryStrategy = capsule
      ? { kind: "receipt", capsule }
      : registration.recovery;
    const entry: ActiveRegistration = {
      token,
      ownerId: registration.ownerId,
      operationId: registration.operationId,
      generation,
      recovery,
      safety: {
        kind: "pending",
        ownerId: registration.ownerId,
        operationId: registration.operationId,
        generation,
        startedAt,
        timeoutAt: startedAt + timeoutMs,
        recovery,
      },
      timer: null,
      retire: () => undefined,
    };
    active.set(token, entry);
    let retiredRemoval: (() => void) | null = null;
    let unregistered = false;
    let reconciliation: Promise<RecoveryObservation> | null = null;

    entry.timer = setTimer(() => {
      if (!current(entry) || entry.safety.kind !== "pending") return;
      entry.timer = null;
      entry.safety = {
        kind: "unknown-outcome",
        operationId: entry.operationId,
        generation: entry.generation,
        recovery: entry.recovery,
      };
      emit();
    }, timeoutMs);
    emit();

    async function settle(): Promise<"accepted" | "obsolete"> {
      if (!current(entry)) return "obsolete";
      const cleanupErrorStart = cleanupErrors.length;
      removeActive(entry);
      capsule?.clear();
      retiredRemoval?.();
      retiredRemoval = null;
      emit();
      reportCleanupErrorsSince(cleanupErrorStart);
      return "accepted";
    }

    function retire(advanceGeneration: boolean, notify: boolean) {
      if (unregistered) return;
      unregistered = true;
      if (active.get(entry.token) === entry) {
        removeActive(entry);
      }
      if (advanceGeneration && ownerGenerations.get(entry.ownerId) === entry.generation) {
        ownerGenerations.set(entry.ownerId, entry.generation + 1);
      }
      if (capsule && authorityAvailable) {
        retiredRemoval = registry.retain(entry.ownerId, entry.generation, capsule);
      }
      if (notify) emit();
      queueMicrotask(() => {
        void reconcile().catch(() => {
          // Detached reconciliation failure remains unknown and is never published.
        });
      });
    }

    entry.retire = retire;

    function unregister() {
      retire(true, true);
    }

    function reconcile(): Promise<RecoveryObservation> {
      if (reconciliation) return reconciliation;
      if (!authorityAvailable) {
        return Promise.resolve({ operationId: entry.operationId, outcome: "authority-lost" });
      }
      if (!unregistered && entry.safety.kind === "pending") {
        return Promise.resolve({ operationId: entry.operationId, outcome: "still-unknown" });
      }

      reconciliation = (async () => {
        const cleanupErrorStart = cleanupErrors.length;
        try {
          let observation: RecoveryObservation;
          try {
            observation = entry.recovery.kind === "receipt"
              ? await entry.recovery.capsule.reconcileOriginal()
              : await entry.recovery.reconcile();
          } catch (error) {
            if (!authorityAvailable) {
              return { operationId: entry.operationId, outcome: "authority-lost" };
            }
            throw error;
          }
          if (!authorityAvailable) {
            return { operationId: entry.operationId, outcome: "authority-lost" };
          }
          const normalized = observation.operationId === entry.operationId
            ? observation
            : { operationId: entry.operationId, outcome: "still-unknown" as const };

          if (current(entry) && entry.safety.kind === "unknown-outcome") {
            if (normalized.outcome !== "still-unknown") removeActive(entry);
            publish(normalized);
            emit();
          }
          return normalized;
        } finally {
          capsule?.clear();
          retiredRemoval?.();
          retiredRemoval = null;
          reportCleanupErrorsSince(cleanupErrorStart);
        }
      })();
      return reconciliation;
    }

    return { generation, settle, unregister, reconcile };
  }

  function invalidateForAuthorityLoss() {
    if (!authorityAvailable) return;
    authorityAvailable = false;
    const cleanupErrorStart = cleanupErrors.length;

    for (const entry of active.values()) {
      if (entry.recovery.kind === "receipt") {
        entry.recovery.capsule.invalidateForAuthorityLoss();
        entry.recovery.capsule.clear();
      }
    }
    try {
      registry.invalidateAndClearAll();
    } catch (error) {
      recordCleanupError(error);
    }

    const affectedOwners = new Set<string>();
    for (const entry of active.values()) {
      affectedOwners.add(entry.ownerId);
      if (entry.timer !== null) clearTimer(entry.timer);
    }
    for (const entry of dirty.values()) affectedOwners.add(entry.ownerId);
    active.clear();
    dirty.clear();
    try {
      options.onAuthorityLossPurge?.();
    } catch (error) {
      recordCleanupError(error);
    }
    for (const ownerId of affectedOwners) {
      ownerGenerations.set(ownerId, (ownerGenerations.get(ownerId) ?? 0) + 1);
    }
    emit();
    reportCleanupErrorsSince(cleanupErrorStart);
  }

  return {
    registerDirty,
    beginPending,
    getSnapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    invalidateForAuthorityLoss,
  };
}

export type GlobalSpaceDestinationInput = {
  currentIdentity: SpaceIdentity;
  targetIdentity: SpaceIdentity;
  currentTarget: ReturnTarget;
  lastSafeTarget: ReturnTarget | null;
  availableIdentities: readonly SpaceIdentity[];
  correspondence: "authorized" | "unavailable" | "unknown";
  reason: "user" | "authority-loss";
};

export type GlobalSpaceDestination = {
  identity: SpaceIdentity;
  target: ReturnTarget;
  navigation: "push" | "replace";
};

export function resolveGlobalSpaceDestination(
  input: GlobalSpaceDestinationInput,
): GlobalSpaceDestination | null {
  const availableIdentities = input.availableIdentities.filter(isValidProjectedIdentity);
  const targetIdentity = availableIdentities.find((identity) =>
    sameSpaceIdentity(identity, input.targetIdentity)
  ) ?? availableIdentities[0];
  if (!targetIdentity) return null;
  const navigation = input.reason === "authority-loss" ? "replace" : "push";
  const lastSafe = input.lastSafeTarget && targetBelongsToIdentity(input.lastSafeTarget, targetIdentity)
    ? input.lastSafeTarget
    : null;

  if (
    input.currentIdentity.productSpace === "clubs"
    && targetIdentity.productSpace === "clubs"
    && input.currentIdentity.clubId === targetIdentity.clubId
    && input.currentIdentity.clubSlug === targetIdentity.clubSlug
  ) {
    const candidate = candidateRoleSwitchTarget({
      pathname: input.currentTarget.pathname,
      targetWorkspace: targetIdentity.perspective,
      transition: input.reason === "authority-loss" ? "authority-loss" : "role-switch",
    });
    const authorizedWorkspaces = availableIdentities.flatMap((identity) =>
      identity.productSpace === "clubs"
      && identity.clubId === targetIdentity.clubId
      && identity.clubSlug === targetIdentity.clubSlug
        ? [identity.perspective]
        : []
    );
    const pathname = resolveAuthorizedRoleSwitchTarget({
      candidate,
      authorizedWorkspaces,
      correspondence: input.correspondence,
      lastSafeTarget: lastSafe ? `${lastSafe.pathname}${lastSafe.search}${lastSafe.hash}` : null,
    });
    return {
      identity: targetIdentity,
      target: returnTargetFromHref(pathname),
      navigation,
    };
  }

  return {
    identity: targetIdentity,
    target: lastSafe ?? representativeSpaceReturnTarget(targetIdentity),
    navigation,
  };
}

function isValidProjectedIdentity(identity: unknown): identity is SpaceIdentity {
  if (!identity || typeof identity !== "object") return false;
  const candidate = identity as Record<string, unknown>;
  if (candidate.productSpace === "platform") return true;
  return candidate.productSpace === "clubs"
    && typeof candidate.clubId === "string"
    && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(candidate.clubId)
    && typeof candidate.clubSlug === "string"
    && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(candidate.clubSlug)
    && (candidate.perspective === "member" || candidate.perspective === "host");
}

function returnTargetFromHref(href: string): ReturnTarget {
  const url = new URL(href, "https://readmates.invalid");
  return {
    pathname: url.pathname,
    search: url.search,
    hash: url.hash,
    focusId: null,
    scrollTop: 0,
  };
}

function targetBelongsToIdentity(target: ReturnTarget, identity: SpaceIdentity) {
  if (identity.productSpace === "platform") {
    return /^\/admin(?:\/|$)/.test(target.pathname);
  }
  const base = `/clubs/${encodeURIComponent(identity.clubSlug)}/app`;
  if (target.pathname !== base && !target.pathname.startsWith(`${base}/`)) return false;
  const hostPath = target.pathname === `${base}/host` || target.pathname.startsWith(`${base}/host/`);
  return identity.perspective === "host" ? hostPath : !hostPath;
}
