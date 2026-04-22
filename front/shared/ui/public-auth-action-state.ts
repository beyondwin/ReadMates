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

export function usePublicAuthenticated() {
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
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

        if (!cancelled && auth.authenticated === true) {
          setAuthenticated(true);
        }
      } catch {
        // Keep the public login link when auth probing is unavailable.
      }
    }

    void loadAuthState();

    return () => {
      cancelled = true;
    };
  }, []);

  return authenticated;
}

export function usePublicAuthAction(fallbackAction: PublicAuthAction): PublicAuthAction {
  const authenticated = usePublicAuthenticated();

  return authenticated ? authenticatedAction : fallbackAction;
}
