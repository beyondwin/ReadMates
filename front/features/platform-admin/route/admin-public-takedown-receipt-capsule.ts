import type {
  ReceiptRecoveryCapsule,
  RecoveryObservation,
} from "@/shared/model/global-space";
import type {
  ConfirmTakedownRequest,
  TakedownReceipt,
} from "../api/platform-admin-takedown-contracts";

export type AdminTakedownReceiptCapsule = ReceiptRecoveryCapsule & {
  retainedRequest: () => ConfirmTakedownRequest | null;
  replayCount: () => number;
};

export function createAdminTakedownReceiptCapsule({
  request,
  replayLookup,
}: {
  request: ConfirmTakedownRequest;
  replayLookup: (request: ConfirmTakedownRequest) => Promise<TakedownReceipt>;
}): AdminTakedownReceiptCapsule {
  const operationId = request.idempotencyKey;
  let retained: ConfirmTakedownRequest | null = { ...request };
  let invalidated = false;
  let lookup: Promise<RecoveryObservation> | null = null;
  let replays = 0;

  function clear() {
    retained = null;
  }

  return {
    operationId,
    retainedRequest: () => retained == null ? null : { ...retained },
    replayCount: () => replays,
    invalidateForAuthorityLoss() {
      invalidated = true;
      clear();
    },
    clear,
    reconcileOriginal() {
      if (invalidated || retained === null) {
        return Promise.resolve({ operationId, outcome: "authority-lost" });
      }
      if (lookup) return lookup;
      const original = { ...retained };
      replays += 1;
      lookup = (async () => {
        try {
          await replayLookup(original);
          return { operationId, outcome: "succeeded" } as const;
        } catch {
          return invalidated
            ? { operationId, outcome: "authority-lost" } as const
            : { operationId, outcome: "still-unknown" } as const;
        } finally {
          clear();
        }
      })();
      return lookup;
    },
  };
}
