import { createContext, useContext, type ReactNode } from "react";
import type { ClubAppAccess } from "./club-app-audience-loader";

const ClubAppAudienceContext = createContext<ClubAppAccess | null>(null);

export function ClubAppAudienceProvider({ value, children }: { value: ClubAppAccess; children: ReactNode }) {
  return <ClubAppAudienceContext.Provider value={value}>{children}</ClubAppAudienceContext.Provider>;
}

// This hook intentionally lives beside its provider so guest route consumers share one typed boundary.
// eslint-disable-next-line react-refresh/only-export-components
export function useClubAppAudience() {
  const access = useContext(ClubAppAudienceContext);

  if (!access) {
    throw new Error("ClubAppAudienceProvider is required for scoped club app routes.");
  }

  return access;
}
