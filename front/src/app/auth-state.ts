import { createContext, useContext } from "react";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";

export type AuthState = { status: "loading" } | { status: "ready"; auth: AuthMeResponse };

export type AuthActions = {
  markLoggedOut: () => void;
};

export const anonymousAuth: AuthMeResponse = {
  authenticated: false,
  userId: null,
  membershipId: null,
  clubId: null,
  email: null,
  displayName: null,
  shortName: null,
  role: null,
  membershipStatus: null,
  approvalState: "ANONYMOUS",
};

export const AuthContext = createContext<AuthState>({ status: "loading" });
export const AuthActionsContext = createContext<AuthActions>({
  markLoggedOut: () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export function useAuthActions() {
  return useContext(AuthActionsContext);
}
