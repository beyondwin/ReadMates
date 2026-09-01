import { useCallback, useContext } from "react";
import { QueryClientContext } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import type { LogoutAcceptedHandler } from "@/features/auth/route/logout-button";
import { useAuthActions } from "@/src/app/auth-state";

export function useAuthenticatedLogoutPublications(): LogoutAcceptedHandler {
  const queryClient = useContext(QueryClientContext);
  const navigate = useNavigate();
  const { markLoggedOut } = useAuthActions();

  return useCallback(async (publish) => {
    await publish("cache", () => queryClient?.clear());
    await publish("navigation", () => {
      markLoggedOut();
      void navigate("/login", { replace: true });
    });
  }, [markLoggedOut, navigate, queryClient]);
}
