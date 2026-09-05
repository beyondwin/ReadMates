import { describe, expect, it } from "vitest";
import {
  ADMIN_APPROVED_SAMPLE_CLUB,
  buildAdminApprovedAuditEvents,
  buildAdminApprovedAuth,
  buildAdminApprovedClubs,
  buildAdminTodayOperationCases,
  buildMemberAuthWithoutPlatformAdmin,
} from "./admin-approved-route-fixtures";

const GENERATED_AT = "2026-08-26T10:00:00Z";

describe("admin approved Today fixtures", () => {
  it("freezes the first three firstObservedAt values against generatedAt", () => {
    const items = buildAdminTodayOperationCases();
    expect(items.slice(0, 3).map((item) => item.firstObservedAt)).toEqual([
      "2026-08-26T09:50:00.000Z",
      "2026-08-26T09:25:00.000Z",
      "2026-08-26T09:00:00.000Z",
    ]);
    expect(items[0]?.firstObservedAt).not.toEqual(new Date(Date.now() - 10 * 60_000).toISOString());
    expect(Date.parse(GENERATED_AT) - Date.parse(items[0]!.firstObservedAt)).toBe(10 * 60_000);
  });

  it("puts the public-safe sample club in availableSpaces instead of flattening it into auth-only fields", () => {
    const auth = buildAdminApprovedAuth();
    expect(auth.availableSpaces).toEqual({
      version: 1,
      kinds: ["PLATFORM", "CLUBS"],
      clubs: [{
        clubId: ADMIN_APPROVED_SAMPLE_CLUB.clubId,
        clubSlug: ADMIN_APPROVED_SAMPLE_CLUB.clubSlug,
        clubName: "샘플 독서모임",
        perspectives: ["MEMBER", "HOST"],
      }],
    });
    expect(auth.joinedClubs?.map((club) => club.clubName)).toEqual(["샘플 독서모임"]);
    expect(buildMemberAuthWithoutPlatformAdmin().platformAdmin).toBeNull();
    expect(buildMemberAuthWithoutPlatformAdmin().availableSpaces?.kinds).toEqual(["CLUBS"]);
  });
});

describe("admin approved Clubs, Health, and Audit fixtures", () => {
  it("freezes the clubs row that the selected-club URL names", () => {
    const page = buildAdminApprovedClubs();
    expect(page.items).toHaveLength(24);
    expect(page.items[0]?.clubId).toBe("club-sample");
    expect(page.items[0]?.name).toBe("샘플 독서모임");
    expect(page.items[0]?.domainCount).toBe(1);
    expect(page.items[0]?.firstHostOnboardingState).toBe("ASSIGNED");
    expect(page.items.filter((club) => club.domainActionRequiredCount > 0)).toHaveLength(2);
    expect(page.nextCursor).toEqual("clubs-visual-next");
  });

  it("freezes the audit row that the selected-event URL names", () => {
    const page = buildAdminApprovedAuditEvents();
    expect(page.items[0]?.id).toBe("audit-visual-1");
    expect(page.nextCursor).toEqual("audit-visual-next");
  });
});
