import { createContext, useContext } from "react";
import type { AuthMeResponse, NormalizedAuthMeResponse } from "@/shared/auth/auth-contracts";
import { emptyAvailableSpaces, normalizeAuthAvailableSpaces } from "@/shared/auth/available-spaces";
import type { SpaceIdentity } from "@/shared/model/global-space";
import type { SessionExpiryCause } from "@/shared/auth/session-expiry";

export type AuthState =
  | { status: "loading" }
  | { status: "ready"; auth: NormalizedAuthMeResponse }
  | {
      status: "session_expired";
      lastAuth?: NormalizedAuthMeResponse;
      cause?: SessionExpiryCause;
      episode?: number;
    };

export type AuthActions = {
  markLoggedOut: () => void;
  refreshAuth: () => Promise<void>;
};

export const anonymousAuth: NormalizedAuthMeResponse = {
  authenticated: false,
  userId: null,
  membershipId: null,
  clubId: null,
  email: null,
  displayName: null,
  accountName: null,
  role: null,
  membershipStatus: null,
  approvalState: "ANONYMOUS",
  availableSpaces: emptyAvailableSpaces(),
};

export const AuthContext = createContext<AuthState>({ status: "loading" });
export const AuthActionsContext = createContext<AuthActions>({
  markLoggedOut: () => {},
  refreshAuth: async () => {},
});

export function projectedSpaceIdentities(auth: AuthMeResponse | null | undefined): SpaceIdentity[] {
  if (!auth) return [];
  const projection = normalizeAuthAvailableSpaces(auth).availableSpaces;
  const identities: SpaceIdentity[] = [];
  if (projection.kinds.includes("PLATFORM")) identities.push({ productSpace: "platform" });
  if (projection.kinds.includes("CLUBS")) {
    for (const club of projection.clubs) {
      for (const perspective of club.perspectives) {
        identities.push({
          productSpace: "clubs",
          clubId: club.clubId,
          clubSlug: club.clubSlug,
          perspective: perspective === "HOST" ? "host" : "member",
        });
      }
    }
  }
  return identities;
}

export function safeProjectionFallback(auth: AuthMeResponse | null | undefined): string {
  return auth?.authenticated ? "/app" : "/login";
}

export function useAuth() {
  return useContext(AuthContext);
}

export function useAuthActions() {
  return useContext(AuthActionsContext);
}
