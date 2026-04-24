import { useEffect, useMemo, useState, type PropsWithChildren } from "react";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";
import { anonymousAuth, AuthActionsContext, AuthContext, type AuthState } from "@/src/app/auth-state";

export function AuthProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<AuthState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    fetch("/api/bff/api/auth/me", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) {
          throw new Error("Failed to fetch auth state");
        }
        return response.json() as Promise<AuthMeResponse>;
      })
      .then((auth) => {
        if (!cancelled) {
          setState({ status: "ready", auth });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setState({ status: "ready", auth: anonymousAuth });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const actions = useMemo(
    () => ({
      markLoggedOut: () => setState({ status: "ready", auth: anonymousAuth }),
    }),
    [],
  );

  return (
    <AuthActionsContext.Provider value={actions}>
      <AuthContext.Provider value={state}>{children}</AuthContext.Provider>
    </AuthActionsContext.Provider>
  );
}
