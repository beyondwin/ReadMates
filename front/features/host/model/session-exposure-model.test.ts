import { describe, expect, it } from "vitest";
import {
  buildSessionAccessScopeRequest,
  buildSessionPublicationRequest,
  resolvedSessionExposure,
  sessionExposureCopy,
} from "./session-exposure-model";

describe("session exposure model", () => {
  it("separates guest access from public-record placement", () => {
    expect(sessionExposureCopy("GUEST_READABLE", "HIDDEN")).toEqual({
      accessLabel: "게스트 공개",
      siteLabel: "공개 기록에 게시 안 함",
    });
    expect(sessionExposureCopy("GUEST_READABLE", "PUBLIC_RECORD").siteLabel).toBe("공개 기록에 게시");
  });

  it("builds canonical host requests without compatibility visibility", () => {
    expect(buildSessionAccessScopeRequest("GUEST_READABLE")).toEqual({ accessScope: "GUEST_READABLE" });
    expect(buildSessionPublicationRequest("공개 요약", "PUBLIC_RECORD")).toEqual({
      publicSummary: "공개 요약",
      siteVisibility: "PUBLIC_RECORD",
    });
  });

  it.each([
    {
      name: "falls back atomically when only canonical access is present",
      input: { state: "CLOSED" as const, visibility: "PUBLIC" as const, accessScope: "HOST_ONLY" as const },
      expected: { accessScope: "GUEST_READABLE", siteVisibility: "PUBLIC_RECORD" },
    },
    {
      name: "falls back atomically when only canonical placement is present",
      input: { state: "CLOSED" as const, visibility: "HOST_ONLY" as const, siteVisibility: "PUBLIC_RECORD" as const },
      expected: { accessScope: "HOST_ONLY", siteVisibility: "HIDDEN" },
    },
    {
      name: "hides public placement when the canonical pair denies guest access",
      input: {
        state: "CLOSED" as const,
        visibility: "PUBLIC" as const,
        accessScope: "HOST_ONLY" as const,
        siteVisibility: "PUBLIC_RECORD" as const,
      },
      expected: { accessScope: "HOST_ONLY", siteVisibility: "HIDDEN" },
    },
    {
      name: "hides public placement before the session closes",
      input: {
        state: "DRAFT" as const,
        visibility: "PUBLIC" as const,
        accessScope: "GUEST_READABLE" as const,
        siteVisibility: "PUBLIC_RECORD" as const,
      },
      expected: { accessScope: "GUEST_READABLE", siteVisibility: "HIDDEN" },
    },
  ])("$name", ({ input, expected }) => {
    expect(resolvedSessionExposure(input)).toEqual(expected);
  });
});
