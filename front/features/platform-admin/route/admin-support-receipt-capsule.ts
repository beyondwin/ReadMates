import type {
  ReceiptRecoveryCapsule,
  RecoveryObservation,
} from "@/shared/model/global-space";
import type {
  AdminSupportGrantCreateConfirmRequest,
  AdminSupportGrantReceipt,
} from "@/features/platform-admin/model/platform-admin-support-model";

export type AdminSupportReceiptCapsule = ReceiptRecoveryCapsule & {
  retainedRequest: () => AdminSupportGrantCreateConfirmRequest | null;
  replayCount: () => number;
};

export function createAdminSupportReceiptCapsule({
  operationId,
  request,
  replayLookup,
}: {
  operationId: string;
  request: AdminSupportGrantCreateConfirmRequest;
  replayLookup: (request: AdminSupportGrantCreateConfirmRequest) => Promise<AdminSupportGrantReceipt>;
}): AdminSupportReceiptCapsule {
  let retained: AdminSupportGrantCreateConfirmRequest | null = { ...request };
  let invalidated = false;
  let lookup: Promise<RecoveryObservation> | null = null;
  let replays = 0;

  function clear() {
    retained = null;
  }

  return {
    operationId,
    retainedRequest: () => retained === null ? null : { ...retained },
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
