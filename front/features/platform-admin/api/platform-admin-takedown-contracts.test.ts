import { describe, expect, it } from "vitest";
import {
  parseAdminTakedownConvergence,
  parseAdminTakedownPreview,
  parseAdminTakedownReceipt,
} from "./platform-admin-takedown-contracts";

const target = {
  clubId: "10000000-0000-4000-8000-000000000001",
  sessionId: "20000000-0000-4000-8000-000000000002",
  publicationId: "30000000-0000-4000-8000-000000000003",
};

describe("platform-admin public takedown contracts", () => {
  it("parses an exact preview target with current surfaces, generation, and limitation", () => {
    expect(parseAdminTakedownPreview({
      schema: "admin.public_takedown.preview.v1",
      previewId: "40000000-0000-4000-8000-000000000004",
      expiresAt: "2026-08-26T04:05:00Z",
      ...target,
      targetGeneration: 17,
      currentSurfaces: ["PUBLIC_CLUB", "PUBLIC_SESSION"],
      limitationCode: "STORED_OR_OFFLINE_COPY_MAY_REMAIN",
    })).toMatchObject({ targetGeneration: 17, currentSurfaces: ["PUBLIC_CLUB", "PUBLIC_SESSION"] });
  });

  it("parses immutable receipt identity without a raw operator reason", () => {
    const receipt = parseAdminTakedownReceipt({
      schema: "admin.public_takedown.receipt.v1",
      receiptId: "50000000-0000-4000-8000-000000000005",
      convergenceId: "60000000-0000-4000-8000-000000000006",
      ...target,
      originResult: "DENIED",
      committedGeneration: 18,
      committedClubGeneration: 9,
      reasonCategory: "PRIVACY",
      createdAt: "2026-08-26T04:01:00Z",
      limitationCode: "STORED_OR_OFFLINE_COPY_MAY_REMAIN",
    });

    expect(receipt.receiptId).toBe("50000000-0000-4000-8000-000000000005");
    expect(receipt).not.toHaveProperty("reason");
  });

  it.each(["SAFETY", "OTHER"])("rejects noncanonical reason category %s", (reasonCategory) => {
    expect(() => parseAdminTakedownReceipt({
      schema: "admin.public_takedown.receipt.v1",
      receiptId: "50000000-0000-4000-8000-000000000005",
      convergenceId: "60000000-0000-4000-8000-000000000006",
      ...target,
      originResult: "DENIED",
      committedGeneration: 18,
      committedClubGeneration: 9,
      reasonCategory,
      createdAt: "2026-08-26T04:01:00Z",
      limitationCode: "STORED_OR_OFFLINE_COPY_MAY_REMAIN",
    })).toThrow();
  });

  it("rejects unknown fields and malformed convergence attempts", () => {
    expect(() => parseAdminTakedownPreview({
      schema: "admin.public_takedown.preview.v1",
      previewId: "40000000-0000-4000-8000-000000000004",
      expiresAt: "2026-08-26T04:05:00Z",
      ...target,
      targetGeneration: 17,
      currentSurfaces: [],
      limitationCode: "STORED_OR_OFFLINE_COPY_MAY_REMAIN",
      privateBody: "must not cross the contract",
    })).toThrow();

    expect(() => parseAdminTakedownConvergence({
      schema: "admin.public_takedown.convergence.v1",
      convergenceId: "60000000-0000-4000-8000-000000000006",
      originResult: "DENIED",
      committedGeneration: 18,
      status: "FAILED",
      lastAttemptAt: "2026-08-26T04:02:00Z",
      retryable: true,
      attempts: [{ attemptNo: 0, status: "FAILED", observedAt: "bad-date", resultCategory: "RAW_PROVIDER_ERROR" }],
    })).toThrow();
  });
});
