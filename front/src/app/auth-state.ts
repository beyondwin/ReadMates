import { createContext, useContext } from "react";
import type { AuthMeResponse, NormalizedAuthMeResponse } from "@/shared/auth/auth-contracts";
import { emptyAvailableSpaces } from "@/shared/auth/available-spaces";
import type { SessionExpiryCause } from "@/shared/auth/session-expiry";

export type AuthState =
  | { status: "loading" }
  | { status: "ready"; auth: AuthMeResponse }
  | {
      status: "session_expired";
      lastAuth?: AuthMeResponse;
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

export function useAuth() {
  return useContext(AuthContext);
}

export function useAuthActions() {
  return useContext(AuthActionsContext);
}
