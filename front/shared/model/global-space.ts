export type ProductSpace = "platform" | "clubs";

export type ClubPerspective = "member" | "host";

export type SpaceIdentity =
  | { productSpace: "platform" }
  | {
      productSpace: "clubs";
      clubId: string;
      clubSlug: string;
      perspective: ClubPerspective;
    };

export type ReturnTarget = {
  pathname: string;
  search: string;
  hash: string;
  focusId: string | null;
  scrollTop: number;
};

export type RecoveryObservation = {
  operationId: string;
  outcome: "succeeded" | "failed" | "still-unknown" | "authority-lost";
};

export type ReceiptRecoveryCapsule = {
  operationId: string;
  reconcileOriginal: () => Promise<RecoveryObservation>;
  invalidateForAuthorityLoss: () => void;
  clear: () => void;
};

export type RetiredReceiptCapsuleRegistry = {
  retain: (
    ownerId: string,
    generation: number,
    capsule: ReceiptRecoveryCapsule,
  ) => () => void;
  invalidateAndClearAll: () => void;
  size: () => number;
};

export type RecoveryStrategy =
  | { kind: "receipt"; capsule: ReceiptRecoveryCapsule }
  | {
      kind: "authoritative-history";
      operationId: string;
      reconcile: () => Promise<RecoveryObservation>;
    };

export type TransitionSafety =
  | { kind: "clean" }
  | { kind: "dirty"; message: string }
  | {
      kind: "pending";
      ownerId: string;
      operationId: string;
      generation: number;
      startedAt: number;
      timeoutAt: number;
      recovery: RecoveryStrategy;
    }
  | {
      kind: "unknown-outcome";
      operationId: string;
      generation: number;
      recovery: RecoveryStrategy;
    };

export type PendingRegistration = {
  ownerId: string;
  operationId: string;
  recovery: RecoveryStrategy;
  timeoutMs?: number;
};

export type PendingHandle = {
  generation: number;
  settle: (result: "succeeded" | "failed") => Promise<"accepted" | "obsolete">;
  unregister: () => void;
  reconcile: () => Promise<RecoveryObservation>;
};

export type TransitionSafetyRegistrationPort = {
  registerDirty: (ownerId: string, message: string) => () => void;
  beginPending: (registration: PendingRegistration) => PendingHandle;
};

export type TransitionPublicationPort = {
  currentOwnerRefetch: (observation: RecoveryObservation) => void;
};

/**
 * Generation-authorized publication opportunities at the eight product
 * boundaries named by the transition contract. These callbacks carry only
 * operation identity/outcome and intentionally know nothing about QueryClient
 * or concrete UI/router/storage implementations.
 */
export type TransitionPublicationBoundaryPort = {
  ui: (observation: RecoveryObservation) => void;
  cache: (observation: RecoveryObservation) => void;
  receiptCallback: (observation: RecoveryObservation) => void;
  successCopy: (observation: RecoveryObservation) => void;
  errorCopy: (observation: RecoveryObservation) => void;
  navigation: (observation: RecoveryObservation) => void;
  returnTarget: (observation: RecoveryObservation) => void;
  sessionStorage: (observation: RecoveryObservation) => void;
};

export function spaceIdentityKey(identity: SpaceIdentity): string {
  return identity.productSpace === "platform"
    ? "platform"
    : `clubs:${identity.clubId}:${identity.clubSlug}:${identity.perspective}`;
}

export function sameSpaceIdentity(left: SpaceIdentity, right: SpaceIdentity): boolean {
  if (left.productSpace !== right.productSpace) return false;
  if (left.productSpace === "platform" || right.productSpace === "platform") {
    return left.productSpace === right.productSpace;
  }
  return left.clubId === right.clubId
    && left.clubSlug === right.clubSlug
    && left.perspective === right.perspective;
}

export function representativeSpaceReturnTarget(identity: SpaceIdentity): ReturnTarget {
  const pathname = identity.productSpace === "platform"
    ? "/admin/today"
    : identity.perspective === "host"
      ? `/clubs/${encodeURIComponent(identity.clubSlug)}/app/host`
      : `/clubs/${encodeURIComponent(identity.clubSlug)}/app`;
  return { pathname, search: "", hash: "", focusId: null, scrollTop: 0 };
}
