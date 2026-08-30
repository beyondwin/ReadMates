import { createContext, useContext, type PropsWithChildren } from "react";
import type { TransitionSafetyRegistrationPort } from "@/shared/model/global-space";

const SpaceTransitionSafetyContext = createContext<TransitionSafetyRegistrationPort | null>(null);

export function SpaceTransitionSafetyProvider({
  port,
  children,
}: PropsWithChildren<{ port: TransitionSafetyRegistrationPort }>) {
  return (
    <SpaceTransitionSafetyContext.Provider value={port}>
      {children}
    </SpaceTransitionSafetyContext.Provider>
  );
}

// This hook intentionally shares the provider's context module.
// eslint-disable-next-line react-refresh/only-export-components
export function useSpaceTransitionSafetyRegistration(): TransitionSafetyRegistrationPort {
  const port = useContext(SpaceTransitionSafetyContext);
  if (!port) {
    throw new Error("SPACE_TRANSITION_SAFETY_PROVIDER_REQUIRED");
  }
  return port;
}
