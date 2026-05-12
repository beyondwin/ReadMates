import { useCallback, useEffect, useMemo, useRef, useState, type PropsWithChildren } from "react";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";
import { anonymousAuth, AuthActionsContext, AuthContext, type AuthState } from "@/src/app/auth-state";

type FetchAuthMeOutcome =
  | { kind: "ok"; auth: AuthMeResponse }
  | { kind: "expired" }
  | { kind: "error" };

async function fetchAuthMeOutcome(): Promise<FetchAuthMeOutcome> {
  try {
    const response = await fetch("/api/bff/api/auth/me", { cache: "no-store" });
    if (response.status === 401) return { kind: "expired" };
    if (!response.ok) return { kind: "error" };
    return { kind: "ok", auth: (await response.json()) as AuthMeResponse };
  } catch {
    return { kind: "error" };
  }
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<AuthState>({ status: "loading" });
  const latestAuthRequestId = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const requestId = latestAuthRequestId.current + 1;
    latestAuthRequestId.current = requestId;

    fetchAuthMeOutcome().then((outcome) => {
      if (!cancelled && latestAuthRequestId.current === requestId) {
        if (outcome.kind === "ok") {
          setState({ status: "ready", auth: outcome.auth });
        } else if (outcome.kind === "expired") {
          setState({ status: "session_expired" });
        } else {
          setState({ status: "ready", auth: anonymousAuth });
        }
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

    const outcome = await fetchAuthMeOutcome();
    if (latestAuthRequestId.current === requestId) {
      if (outcome.kind === "ok") {
        setState({ status: "ready", auth: outcome.auth });
      } else if (outcome.kind === "expired") {
        setState((prev) => ({
          status: "session_expired",
          lastAuth: prev.status === "ready" ? prev.auth : undefined,
        }));
      } else {
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
