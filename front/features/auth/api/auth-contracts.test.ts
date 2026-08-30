import { describe, expect, it } from "vitest";
import { InvitationPreviewResponseSchema } from "./auth-contracts";

const legacyToken = "e".repeat(43);
const namedToken = `lnk_${"n".repeat(43)}`;
const common = { clubSlug: "reading-sai", clubName: "읽는사이", status: "PENDING", expiresAt: "2026-09-30T00:00:00Z", canAccept: true };

describe("InvitationPreviewResponseSchema", () => {
  it("accepts exact email and redacted named-link families", () => {
    expect(InvitationPreviewResponseSchema.parse({ ...common, invitationType: "EMAIL", canonicalPath: `/clubs/reading-sai/invite/${legacyToken}`, email: "member@example.com", name: "멤버", emailHint: "m***@example.com" }).invitationType).toBe("EMAIL");
    expect(InvitationPreviewResponseSchema.parse({ ...common, invitationType: "NAMED_LINK", canonicalPath: `/clubs/reading-sai/invite/${namedToken}`, email: null, name: null, emailHint: null }).invitationType).toBe("NAMED_LINK");
  });

  it("rejects mixed disclosure, short named tokens, and mismatched club paths", () => {
    expect(() => InvitationPreviewResponseSchema.parse({ ...common, invitationType: "NAMED_LINK", canonicalPath: `/clubs/reading-sai/invite/${namedToken}`, email: "leak@example.com", name: null, emailHint: null })).toThrow();
    expect(() => InvitationPreviewResponseSchema.parse({ ...common, invitationType: "NAMED_LINK", canonicalPath: "/clubs/reading-sai/invite/lnk_short", email: null, name: null, emailHint: null })).toThrow();
    expect(() => InvitationPreviewResponseSchema.parse({ ...common, invitationType: "EMAIL", canonicalPath: `/clubs/other-club/invite/${legacyToken}`, email: "member@example.com", name: "멤버", emailHint: "m***@example.com" })).toThrow();
  });
});
