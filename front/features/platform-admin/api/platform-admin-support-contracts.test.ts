import { describe, expect, it } from "vitest";
import {
  parseAdminSupportGrantPreview,
  parseAdminSupportGrantReceipt,
} from "./platform-admin-support-contracts";

const serverCreatePreview = {
  previewId: "00000000-0000-4000-8000-000000006101",
  commandType: "CREATE",
  grantId: null,
  clubId: "00000000-0000-4000-8000-000000006102",
  scope: "HOST_SUPPORT_READ",
  grantExpiresAt: "2026-08-25T12:00:00Z",
  reasonCategory: "MEMBER_ASSISTANCE",
  notePresent: true,
  impactCodes: ["SUPPORT_ACCESS_WILL_BECOME_ACTIVE"],
  expiresAt: "2026-08-25T10:10:00Z",
  fingerprintPrefix: "00112233",
};

describe("platform admin support wire contracts", () => {
  it("strictly parses server-shaped create and revoke previews", () => {
    expect(parseAdminSupportGrantPreview(serverCreatePreview).impactCodes).toEqual([
      "SUPPORT_ACCESS_WILL_BECOME_ACTIVE",
    ]);
    expect(parseAdminSupportGrantPreview({
      ...serverCreatePreview,
      commandType: "REVOKE",
      grantId: "00000000-0000-4000-8000-000000006103",
      impactCodes: ["SUPPORT_ACCESS_WILL_BE_REVOKED"],
    }).impactCodes).toEqual(["SUPPORT_ACCESS_WILL_BE_REVOKED"]);
    expect(() => parseAdminSupportGrantPreview({
      ...serverCreatePreview,
      impactCodes: ["GRANT_SUPPORT_ACCESS"],
    })).toThrow();
  });

  it("strictly parses the server receipt without inventing convergence fields", () => {
    const receipt = parseAdminSupportGrantReceipt({
      receiptId: "00000000-0000-4000-8000-000000006104",
      previewId: serverCreatePreview.previewId,
      commandType: "CREATE",
      grantId: "00000000-0000-4000-8000-000000006103",
      clubId: serverCreatePreview.clubId,
      scope: "HOST_SUPPORT_READ",
      grantExpiresAt: "2026-08-25T12:00:00Z",
      reasonCategory: "MEMBER_ASSISTANCE",
      notePresent: true,
      beforeStatus: "ABSENT",
      afterStatus: "ACTIVE",
      outcome: "SUCCEEDED",
      createdAt: "2026-08-25T10:00:00Z",
    });
    expect(receipt.outcome).toBe("SUCCEEDED");
    expect(receipt).not.toHaveProperty("convergenceId");
  });
});
