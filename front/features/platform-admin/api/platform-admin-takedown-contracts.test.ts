import { describe, expect, it } from "vitest";
import {
  parseAdminTakedownPreview,
  parseAdminTakedownReceipt,
} from "./platform-admin-takedown-contracts";
import previewFixture from "../../../tests/unit/__fixtures__/platform-admin-takedown-preview.server.json";
import receiptFixture from "../../../tests/unit/__fixtures__/platform-admin-takedown-receipt.server.json";

describe("platform-admin public takedown contracts", () => {
  it("strictly parses the server-shaped preview activation contract", () => {
    expect(parseAdminTakedownPreview(previewFixture)).toMatchObject({
      confirmEnabled: false,
      activationBoundary: "PROTECTED_CACHE_SAFETY_EVIDENCE_REQUIRED",
      remoteCopyLimitation: expect.stringContaining("원격으로 삭제할 수 없습니다"),
    });
  });

  it("parses immutable receipt identity without a raw operator reason", () => {
    const receipt = parseAdminTakedownReceipt(receiptFixture);

    expect(receipt.receiptId).toBe("50000000-0000-4000-8000-000000000005");
    expect(receipt).not.toHaveProperty("reason");
    expect(receipt).not.toHaveProperty("committedClubGeneration");
    expect(receipt).not.toHaveProperty("limitationCode");
    expect(receipt).toMatchObject({
      reasonRedacted: true,
      bffEvictionOutcome: "NOT_STARTED",
      cdnPurgeOutcome: "QUEUED",
      browserRevalidationOutcome: "BOUNDED_BY_CACHE_POLICY",
      remoteCopyLimitation: expect.stringContaining("원격으로 삭제할 수 없습니다"),
    });
  });

  it.each(["PRIVACY", "SECURITY", "LEGAL", "CONTENT_POLICY", "OTHER"])("rejects non-server reason category %s", (reasonCategory) => {
    expect(() => parseAdminTakedownReceipt({ ...receiptFixture, reasonCategory })).toThrow();
  });

  it("rejects invented client fields on both strict server DTOs", () => {
    expect(() => parseAdminTakedownPreview({ ...previewFixture, limitationCode: "INVENTED" })).toThrow();
    expect(() => parseAdminTakedownReceipt({ ...receiptFixture, committedClubGeneration: 9 })).toThrow();
  });
});
