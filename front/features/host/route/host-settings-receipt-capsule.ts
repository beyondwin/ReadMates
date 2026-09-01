import type { ReceiptRecoveryCapsule, RecoveryObservation } from "@/shared/model/global-space";

export type HostSettingsReceiptCapsule<TRequest extends object> = ReceiptRecoveryCapsule & {
  retainedRequest: () => TRequest | null;
  replayCount: () => number;
};

export function createHostSettingsReceiptCapsule<TRequest extends object>({
  operationId,
  request,
  replayLookup,
}: {
  operationId: string;
  request: TRequest;
  replayLookup: (request: TRequest) => Promise<unknown>;
}): HostSettingsReceiptCapsule<TRequest> {
  let retained: TRequest | null = { ...request };
  let invalidated = false;
  let lookup: Promise<RecoveryObservation> | null = null;
  let replays = 0;

  const clear = () => {
    retained = null;
  };

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
