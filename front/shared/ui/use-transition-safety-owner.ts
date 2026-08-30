import { useCallback, useEffect, useMemo, useRef } from "react";
import type {
  PendingHandle,
  ReceiptRecoveryCapsule,
  RecoveryObservation,
  TransitionSafetyRegistrationPort,
} from "@/shared/model/global-space";
import type { TransitionPublicationSurface } from "@/shared/model/global-space";
import { useOptionalSpaceTransitionSafetyRegistration } from "./space-transition-safety-context";

const TEST_LEAF_FALLBACK: TransitionSafetyRegistrationPort = {
  registerDirty: () => () => undefined,
  beginPending: ({ operationId }) => ({
    generation: 0,
    settle: async () => "accepted" as const,
    isAcceptedPublicationCurrent: () => true,
    publishAccepted: ({ publish }: { publish: (observation: RecoveryObservation) => void }) => {
      publish({ operationId, outcome: "succeeded" });
      return "published" as const;
    },
    unregister: () => undefined,
    reconcile: async () => ({ operationId, outcome: "still-unknown" as const }),
  }),
};

export class TransitionOwnerObsoleteError extends Error {
  constructor() {
    super("TRANSITION_OWNER_OBSOLETE");
    this.name = "TransitionOwnerObsoleteError";
  }
}

export function isTransitionOwnerObsoleteError(error: unknown): error is TransitionOwnerObsoleteError {
  return error instanceof TransitionOwnerObsoleteError;
}

export type TransitionOwnerHandle = PendingHandle & {
  isPublicationCurrent: () => boolean;
  retainPublication: () => () => void;
  completePublication: () => void;
};

export async function publishTransitionAction<T>(
  handle: Pick<PendingHandle, "publishAccepted"> & Partial<Pick<TransitionOwnerHandle, "isPublicationCurrent" | "retainPublication">>,
  surface: TransitionPublicationSurface,
  publish: () => T | Promise<T>,
): Promise<T> {
  if (handle.isPublicationCurrent && !handle.isPublicationCurrent()) {
    throw new TransitionOwnerObsoleteError();
  }
  const releasePublication = handle.retainPublication?.();
  let publication: T | Promise<T> | undefined;
  try {
    const outcome = handle.publishAccepted({
      surface,
      publish: () => {
        publication = publish();
      },
    });
    if (outcome !== "published") throw new TransitionOwnerObsoleteError();
    const result = await publication!;
    if (handle.isPublicationCurrent && !handle.isPublicationCurrent()) {
      throw new TransitionOwnerObsoleteError();
    }
    return result;
  } finally {
    releasePublication?.();
  }
}

export function useTransitionSafetyOwner(
  ownerId: string,
  dirty = false,
  dirtyMessage = "저장되지 않은 변경이 있습니다.",
) {
  const registration = useOptionalSpaceTransitionSafetyRegistration() ?? TEST_LEAF_FALLBACK;
  const active = useRef(new Set<TransitionOwnerHandle>());

  useEffect(() => {
    if (!dirty) return;
    return registration.registerDirty(ownerId, dirtyMessage);
  }, [dirty, dirtyMessage, ownerId, registration]);

  useEffect(() => () => {
    for (const handle of active.current) handle.unregister();
    active.current.clear();
  }, []);

  const track = useCallback((handle: PendingHandle): TransitionOwnerHandle => {
    let accepted = false;
    let released = false;
    let activePublications = 0;
    let releaseTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
    const cancelRelease = () => {
      if (releaseTimer !== null) globalThis.clearTimeout(releaseTimer);
      releaseTimer = null;
    };
    const releaseLocally = () => {
      if (released) return;
      released = true;
      cancelRelease();
      active.current.delete(wrapped);
    };
    const scheduleRelease = () => {
      if (!accepted || released || activePublications > 0) return;
      cancelRelease();
      releaseTimer = globalThis.setTimeout(releaseLocally, 0);
    };
    const isPublicationCurrent = () => !released
      && (handle.isAcceptedPublicationCurrent?.() ?? true);
    const wrapped: TransitionOwnerHandle = {
      generation: handle.generation,
      isAcceptedPublicationCurrent: handle.isAcceptedPublicationCurrent,
      isPublicationCurrent,
      publishAccepted(action) {
        if (!isPublicationCurrent()) return "rejected";
        cancelRelease();
        const outcome = handle.publishAccepted(action);
        scheduleRelease();
        return outcome;
      },
      reconcile: handle.reconcile,
      async settle(result) {
        const outcome = await handle.settle(result);
        if (outcome === "accepted") {
          accepted = true;
          scheduleRelease();
        } else {
          releaseLocally();
        }
        return outcome;
      },
      retainPublication() {
        if (!isPublicationCurrent()) return () => undefined;
        cancelRelease();
        activePublications += 1;
        let retained = true;
        return () => {
          if (!retained) return;
          retained = false;
          activePublications -= 1;
          scheduleRelease();
        };
      },
      completePublication: releaseLocally,
      unregister() {
        if (released) return;
        const wasAccepted = accepted;
        releaseLocally();
        if (!wasAccepted) handle.unregister();
      },
    };
    active.current.add(wrapped);
    return wrapped;
  }, []);

  const begin = useCallback((
    operationId: string,
    _recoveryClass: "L1" | "L2" | "L3",
    reconcile: () => Promise<RecoveryObservation>,
  ) => track(registration.beginPending({
    ownerId,
    operationId,
    recovery: { kind: "authoritative-history", operationId, reconcile },
  })), [ownerId, registration, track]);

  const beginReceipt = useCallback((capsule: ReceiptRecoveryCapsule) => track(
    registration.beginPending({
      ownerId,
      operationId: capsule.operationId,
      recovery: { kind: "receipt", capsule },
    }),
  ), [ownerId, registration, track]);

  return useMemo(() => ({ begin, beginReceipt }), [begin, beginReceipt]);
}
