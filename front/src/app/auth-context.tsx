import { useCallback, useEffect, useMemo, useRef, useState, type PropsWithChildren } from "react";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";
import { anonymousAuth, AuthActionsContext, AuthContext, type AuthState } from "@/src/app/auth-state";

async function fetchAuthMe() {
  const response = await fetch("/api/bff/api/auth/me", { cache: "no-store" });

  if (!response.ok) {
    throw new Error("Failed to fetch auth state");
  }

  return response.json() as Promise<AuthMeResponse>;
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<AuthState>({ status: "loading" });
  const latestAuthRequestId = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const requestId = latestAuthRequestId.current + 1;
    latestAuthRequestId.current = requestId;

    fetchAuthMe()
      .then((auth) => {
        if (!cancelled && latestAuthRequestId.current === requestId) {
          setState({ status: "ready", auth });
        }
      })
      .catch(() => {
        if (!cancelled && latestAuthRequestId.current === requestId) {
          setState({ status: "ready", auth: anonymousAuth });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const markLoggedOut = useCallback(() => {
    latestAuthRequestId.current += 1;
    setState({ status: "ready", auth: anonymousAuth });
  }, []);

  const refreshAuth = useCallback(async () => {
    const requestId = latestAuthRequestId.current + 1;
    latestAuthRequestId.current = requestId;

    try {
      const auth = await fetchAuthMe();
      if (latestAuthRequestId.current === requestId) {
        setState({ status: "ready", auth });
      }
    } catch {
      if (latestAuthRequestId.current === requestId) {
        setState({ status: "ready", auth: anonymousAuth });
      }
    }
  }, []);

  const actions = useMemo(
    () => ({
      markLoggedOut,
      refreshAuth,
    }),
    [markLoggedOut, refreshAuth],
  );

  return (
    <AuthActionsContext.Provider value={actions}>
      <AuthContext.Provider value={state}>{children}</AuthContext.Provider>
    </AuthActionsContext.Provider>
  );
}
