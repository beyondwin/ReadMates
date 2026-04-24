import { useEffect, useState } from "react";
import { READMATES_NAV_LABELS } from "./readmates-copy";

export type PublicAuthAction = {
  href: string;
  label: string;
};

const authenticatedAction: PublicAuthAction = {
  href: "/app",
  label: READMATES_NAV_LABELS.public.appEntry,
};

type AuthMeProbe = {
  authenticated?: boolean;
};

export function usePublicAuthenticated(authenticatedOverride?: boolean) {
  const [probedAuthenticated, setProbedAuthenticated] = useState(false);

  useEffect(() => {
    if (authenticatedOverride !== undefined) {
      return;
    }

    let cancelled = false;

    async function loadAuthState() {
      try {
        const response = await fetch("/api/bff/api/auth/me", {
          cache: "no-store",
          credentials: "same-origin",
        });

        if (!response.ok) {
          return;
        }

        const auth = (await response.json()) as AuthMeProbe;

        if (!cancelled) {
          setProbedAuthenticated(auth.authenticated === true);
        }
      } catch {
        // Keep the public login link when auth probing is unavailable.
      }
    }

    void loadAuthState();

    return () => {
      cancelled = true;
    };
  }, [authenticatedOverride]);

  return authenticatedOverride ?? probedAuthenticated;
}

export function usePublicAuthAction(fallbackAction: PublicAuthAction, authenticatedOverride?: boolean): PublicAuthAction {
  const authenticated = usePublicAuthenticated(authenticatedOverride);

  return authenticated ? authenticatedAction : fallbackAction;
}
