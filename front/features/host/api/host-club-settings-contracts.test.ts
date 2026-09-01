import { describe, expect, it } from "vitest";
import { HostClubClosePreviewSchema, HostClubSettingsSchema } from "./host-club-settings-contracts";

describe("host club settings contracts", () => {
  it("accepts canonical settings and allowlisted close effects", () => {
    expect(HostClubSettingsSchema.parse({ clubId: "00000000-0000-0000-0000-000000000001", clubSlug: "reading-sai", name: "읽는사이", approvalPolicy: "HOST_APPROVAL", defaultTimezone: "Asia/Seoul", scheduleReminderEnabled: true, recordPublicationDefault: "HOST_ONLY", revision: 3, status: "ACTIVE" }).revision).toBe(3);
    expect(HostClubClosePreviewSchema.parse({ previewId: "00000000-0000-0000-0000-000000000703", clubId: "00000000-0000-0000-0000-000000000001", actorMembershipId: "00000000-0000-0000-0000-000000000201", clubRevision: 3, effectHash: "a".repeat(64), effects: { clubStatus: "ARCHIVED", memberAccess: "ENDED", publicRecords: "UNCHANGED" }, expiresAt: "2026-08-30T00:15:00Z" }).effects.publicRecords).toBe("UNCHANGED");
  });

  it("rejects user identity and page-history fields", () => {
    expect(() => HostClubSettingsSchema.parse({ clubId: "id", clubSlug: "slug", name: "name", approvalPolicy: "HOST_APPROVAL", defaultTimezone: "Asia/Seoul", scheduleReminderEnabled: true, recordPublicationDefault: "HOST_ONLY", revision: 0, status: "ACTIVE", userId: "forbidden" })).toThrow();
  });
});
