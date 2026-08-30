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

export function createRetiredReceiptCapsuleRegistry(): RetiredReceiptCapsuleRegistry {
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
        capsule.invalidateForAuthorityLoss();
        capsule.clear();
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
};

type ActiveRegistration = {
  token: symbol;
  ownerId: string;
  operationId: string;
  generation: number;
  recovery: RecoveryStrategy;
  safety: Extract<TransitionSafety, { kind: "pending" | "unknown-outcome" }>;
  timer: TimerHandle | null;
};

export type GlobalSpaceTransitionCoordinator = TransitionSafetyRegistrationPort & {
  getSnapshot: () => TransitionSafety;
  subscribe: (listener: () => void) => () => void;
  invalidateForAuthorityLoss: () => void;
};

export function createGlobalSpaceTransitionCoordinator(
  options: CoordinatorOptions = {},
): GlobalSpaceTransitionCoordinator {
  const registry = options.registry ?? createRetiredReceiptCapsuleRegistry();
  const publication = options.publication;
  const now = options.now ?? Date.now;
  const setTimer = options.setTimer ?? ((callback, timeoutMs) => globalThis.setTimeout(callback, timeoutMs));
  const clearTimer = options.clearTimer ?? ((timer) => globalThis.clearTimeout(timer));
  const ownerGenerations = new Map<string, number>();
  const active = new Map<symbol, ActiveRegistration>();
  const dirty = new Map<symbol, { ownerId: string; message: string }>();
  const listeners = new Set<() => void>();
  let authorityAvailable = true;

  function emit() {
    for (const listener of listeners) listener();
  }

  function getSnapshot(): TransitionSafety {
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

  function clearReceipt(capsule: ReceiptRecoveryCapsule | null, state: { cleared: boolean }) {
    if (!capsule || state.cleared) return;
    state.cleared = true;
    capsule.clear();
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
      ownerGenerations.set(ownerId, (ownerGenerations.get(ownerId) ?? 0) + 1);
      emit();
    };
  }

  function beginPending(registration: PendingRegistration): PendingHandle {
    const generation = (ownerGenerations.get(registration.ownerId) ?? 0) + 1;
    ownerGenerations.set(registration.ownerId, generation);
    const token = Symbol(`${registration.ownerId}:${generation}`);
    const startedAt = now();
    const timeoutMs = normalizePendingTimeout(registration.timeoutMs);
    const entry: ActiveRegistration = {
      token,
      ownerId: registration.ownerId,
      operationId: registration.operationId,
      generation,
      recovery: registration.recovery,
      safety: {
        kind: "pending",
        ownerId: registration.ownerId,
        operationId: registration.operationId,
        generation,
        startedAt,
        timeoutAt: startedAt + timeoutMs,
        recovery: registration.recovery,
      },
      timer: null,
    };
    active.set(token, entry);
    const capsule = registration.recovery.kind === "receipt"
      ? registration.recovery.capsule
      : null;
    const capsuleState = { cleared: false };
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
      removeActive(entry);
      clearReceipt(capsule, capsuleState);
      retiredRemoval?.();
      retiredRemoval = null;
      emit();
      return "accepted";
    }

    function unregister() {
      if (unregistered) return;
      unregistered = true;
      if (current(entry)) {
        removeActive(entry);
        ownerGenerations.set(entry.ownerId, entry.generation + 1);
      }
      if (capsule && !capsuleState.cleared) {
        if (authorityAvailable) {
          retiredRemoval = registry.retain(entry.ownerId, entry.generation, capsule);
        }
      }
      emit();
      queueMicrotask(() => {
        void reconcile().catch(() => {
          // Detached reconciliation failure remains unknown and is never published.
        });
      });
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
        try {
          const observation = entry.recovery.kind === "receipt"
            ? await entry.recovery.capsule.reconcileOriginal()
            : await entry.recovery.reconcile();
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
          clearReceipt(capsule, capsuleState);
          retiredRemoval?.();
          retiredRemoval = null;
        }
      })();
      return reconciliation;
    }

    return { generation, settle, unregister, reconcile };
  }

  function invalidateForAuthorityLoss() {
    if (!authorityAvailable) return;
    authorityAvailable = false;

    for (const entry of active.values()) {
      if (entry.recovery.kind === "receipt") {
        entry.recovery.capsule.invalidateForAuthorityLoss();
        entry.recovery.capsule.clear();
      }
    }
    registry.invalidateAndClearAll();

    const affectedOwners = new Set<string>();
    for (const entry of active.values()) {
      affectedOwners.add(entry.ownerId);
      if (entry.timer !== null) clearTimer(entry.timer);
    }
    for (const entry of dirty.values()) affectedOwners.add(entry.ownerId);
    active.clear();
    dirty.clear();
    options.onAuthorityLossPurge?.();
    for (const ownerId of affectedOwners) {
      ownerGenerations.set(ownerId, (ownerGenerations.get(ownerId) ?? 0) + 1);
    }
    emit();
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
): GlobalSpaceDestination {
  const targetIdentity = input.availableIdentities.find((identity) =>
    sameSpaceIdentity(identity, input.targetIdentity)
  ) ?? input.availableIdentities[0] ?? input.targetIdentity;
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
    const authorizedWorkspaces = input.availableIdentities.flatMap((identity) =>
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
