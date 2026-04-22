import { createContext, useContext } from "react";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";

export type AuthState = { status: "loading" } | { status: "ready"; auth: AuthMeResponse };

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

export function useAuth() {
  return useContext(AuthContext);
}
