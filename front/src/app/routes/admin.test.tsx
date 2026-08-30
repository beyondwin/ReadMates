import { renderHook } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { PropsWithChildren } from "react";
import { describe, expect, it } from "vitest";
import { useSpaceTransitionSafetyRegistration } from "@/shared/ui/space-transition-safety-context";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";
import { AdminTransitionBoundary } from "./admin";

const auth: AuthMeResponse = {
  authenticated: true,
  userId: "admin-1",
  membershipId: null,
  clubId: null,
  email: null,
  displayName: "운영자",
  accountName: "operator",
  role: null,
  membershipStatus: null,
  approvalState: "ANONYMOUS",
  availableSpaces: { version: 1, kinds: ["PLATFORM"], clubs: [] },
};

describe("AdminTransitionBoundary", () => {
  it("injects the app-owned safety registration port without a platform feature importing src/app", () => {
    const wrapper = ({ children }: PropsWithChildren) => (
      <MemoryRouter initialEntries={["/admin/today"]}>
        <AdminTransitionBoundary auth={auth}>{children}</AdminTransitionBoundary>
      </MemoryRouter>
    );

    const { result } = renderHook(() => useSpaceTransitionSafetyRegistration(), { wrapper });

    expect(result.current.registerDirty).toEqual(expect.any(Function));
    expect(result.current.beginPending).toEqual(expect.any(Function));
  });
});
