import { renderHook } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { describe, expect, it, vi } from "vitest";
import type { TransitionSafetyRegistrationPort } from "@/shared/model/global-space";
import {
  SpaceTransitionSafetyProvider,
  useSpaceTransitionSafetyRegistration,
} from "./space-transition-safety-context";

describe("space transition safety context", () => {
  it("provides only the registration port supplied by the app coordinator", () => {
    const port: TransitionSafetyRegistrationPort = {
      registerDirty: vi.fn(() => vi.fn()),
      beginPending: vi.fn(),
    };
    const wrapper = ({ children }: PropsWithChildren) => (
      <SpaceTransitionSafetyProvider port={port}>{children}</SpaceTransitionSafetyProvider>
    );

    const { result } = renderHook(() => useSpaceTransitionSafetyRegistration(), { wrapper });

    expect(result.current).toBe(port);
  });

  it("fails closed when a mutation producer is mounted outside the coordinator", () => {
    expect(() => renderHook(() => useSpaceTransitionSafetyRegistration())).toThrow(
      "SPACE_TRANSITION_SAFETY_PROVIDER_REQUIRED",
    );
  });
});
