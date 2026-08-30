import { useCallback, useEffect, useMemo, useRef } from "react";
import type {
  PendingHandle,
  ReceiptRecoveryCapsule,
  RecoveryObservation,
  TransitionSafetyRegistrationPort,
} from "@/shared/model/global-space";
import { useOptionalSpaceTransitionSafetyRegistration } from "./space-transition-safety-context";

const TEST_LEAF_FALLBACK: TransitionSafetyRegistrationPort = {
  registerDirty: () => () => undefined,
  beginPending: ({ operationId }) => ({
    generation: 0,
    settle: async () => "accepted" as const,
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

export function useTransitionSafetyOwner(
  ownerId: string,
  dirty = false,
  dirtyMessage = "저장되지 않은 변경이 있습니다.",
) {
  const registration = useOptionalSpaceTransitionSafetyRegistration() ?? TEST_LEAF_FALLBACK;
  const active = useRef(new Set<PendingHandle>());

  useEffect(() => {
    if (!dirty) return;
    return registration.registerDirty(ownerId, dirtyMessage);
  }, [dirty, dirtyMessage, ownerId, registration]);

  useEffect(() => () => {
    for (const handle of active.current) handle.unregister();
    active.current.clear();
  }, []);

  const track = useCallback((handle: PendingHandle): PendingHandle => {
    active.current.add(handle);
    return {
      generation: handle.generation,
      publishAccepted: handle.publishAccepted,
      reconcile: handle.reconcile,
      async settle(result) {
        const outcome = await handle.settle(result);
        if (outcome === "accepted") active.current.delete(handle);
        return outcome;
      },
      unregister() {
        active.current.delete(handle);
        handle.unregister();
      },
    };
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
