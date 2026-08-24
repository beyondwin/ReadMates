import { describe, expect, it } from "vitest";
import {
  hostAuthorityLossMessage,
  hostAuthoritySafeDestination,
  isHostSecurityPurgeCode,
  requireHostClubContext,
} from "./host-authority-loss";

describe("host authority loss", () => {
  it.each([
    "HOST_AUTHORITY_REVOKED",
    "MEMBERSHIP_SUSPENDED",
    "CROSS_CLUB_SCOPE",
  ] as const)("classifies %s as a host security purge code", (code) => {
    expect(isHostSecurityPurgeCode(code)).toBe(true);
    expect(hostAuthorityLossMessage(code)).toMatch(/권한|멤버십|모임/);
  });

  it.each(["REVISION_CONFLICT", "NETWORK_RESPONSE_LOST", "PERMISSION_DENIED"])(
    "does not classify %s as authority loss",
    (code) => expect(isHostSecurityPurgeCode(code)).toBe(false),
  );

  it("builds the safe member destination from the owning canonical club slug", () => {
    expect(hostAuthoritySafeDestination("reading-sai")).toBe("/clubs/reading-sai/app");
  });

  it("rejects missing canonical host scope instead of inferring it from the location", () => {
    expect(requireHostClubContext("reading-sai")).toEqual({ clubSlug: "reading-sai" });
    expect(() => requireHostClubContext(undefined)).toThrow("HOST_API_CONTEXT_REQUIRED");
  });
});
