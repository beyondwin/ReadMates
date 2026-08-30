import { describe, expect, it } from "vitest";
import { HostInvitationLinkListSchema, HostInvitationLinkCreateResultSchema } from "./host-invitation-link-contracts";

describe("host invitation link contracts", () => {
  it("accepts the strict privacy-safe list and one-time create shapes", () => {
    const link = { linkId: "00000000-0000-0000-0000-000000000701", name: "신규 멤버", status: "ACTIVE", maxUses: 5, usedCount: 1, expiresAt: "2026-09-30T00:00:00Z", revision: 2, createdAt: "2026-08-30T00:00:00Z", updatedAt: "2026-08-30T00:00:00Z" };
    expect(HostInvitationLinkListSchema.parse({ items: [link], nextCursor: null }).items).toHaveLength(1);
    expect(HostInvitationLinkCreateResultSchema.parse({ link, oneTimeSharePath: "/clubs/reading-sai/invite/lnk_example", receipt: { receiptId: "00000000-0000-0000-0000-000000000702", action: "CREATED", linkId: link.linkId, revision: 2, replayed: false } }).oneTimeSharePath).toContain("/invite/lnk_");
  });

  it.each(["token", "tokenHash", "email", "oauthIdentity", "shareUrl"])("rejects forbidden %s from list rows", (key) => {
    const row = { linkId: "id", name: "name", status: "ACTIVE", maxUses: 1, usedCount: 0, expiresAt: "2026-09-30T00:00:00Z", revision: 0, createdAt: "2026-08-30T00:00:00Z", updatedAt: "2026-08-30T00:00:00Z", [key]: "forbidden" };
    expect(() => HostInvitationLinkListSchema.parse({ items: [row], nextCursor: null })).toThrow();
  });
});
