import { createContext, useContext } from "react";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";

export type AuthState = { status: "loading" } | { status: "ready"; auth: AuthMeResponse };

export type AuthActions = {
  markLoggedOut: () => void;
  refreshAuth: () => Promise<void>;
};

export const anonymousAuth: AuthMeResponse = {
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
