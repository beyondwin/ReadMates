import { describe, expect, it } from "vitest";
import type { TakedownReceipt } from "../api/platform-admin-takedown-contracts";
import type { PlatformAdminCapabilities } from "./platform-admin-capabilities";
import {
  canOperatePublicTakedown,
  initialConvergenceFromReceipt,
  normalizeTakedownReason,
  remoteCopyLimitationLabel,
} from "./platform-admin-takedown-model";

function caps(
  role: PlatformAdminCapabilities["role"],
  capabilities: PlatformAdminCapabilities["capabilities"],
): PlatformAdminCapabilities {
  return {
    schemaVersion: 1,
    role,
    status: "ACTIVE",
    capabilities,
    generatedAt: "2026-08-26T04:00:00Z",
  };
}

const receipt: TakedownReceipt = {
  schema: "admin.public_takedown.receipt.v1",
  receiptId: "50000000-0000-4000-8000-000000000005",
  convergenceId: "60000000-0000-4000-8000-000000000006",
  clubId: "10000000-0000-4000-8000-000000000001",
  sessionId: "20000000-0000-4000-8000-000000000002",
  publicationId: "30000000-0000-4000-8000-000000000003",
  originResult: "DENIED",
  committedGeneration: 18,
  committedClubGeneration: 9,
  reasonCategory: "PRIVACY",
  createdAt: "2026-08-26T04:01:00Z",
  limitationCode: "STORED_OR_OFFLINE_COPY_MAY_REMAIN",
};

describe("platform-admin takedown model", () => {
  it("allows only the exact EMERGENCY_PUBLIC_TAKEDOWN capability", () => {
    expect(canOperatePublicTakedown(caps("OWNER", ["EMERGENCY_PUBLIC_TAKEDOWN"]))).toBe(true);
    expect(canOperatePublicTakedown(caps("OPERATOR", ["EMERGENCY_PUBLIC_TAKEDOWN"]))).toBe(true);
    expect(canOperatePublicTakedown(caps("OWNER", ["VIEW_TODAY", "VIEW_CLUBS"]))).toBe(false);
    expect(canOperatePublicTakedown(caps("SUPPORT", ["VIEW_TODAY"]))).toBe(false);
    expect(canOperatePublicTakedown(null)).toBe(false);
  });

  it("requires a nonblank reason and trims the committed value", () => {
    expect(normalizeTakedownReason("  개인정보 삭제 요청 확인  ")).toBe("개인정보 삭제 요청 확인");
    expect(() => normalizeTakedownReason("  \n ")).toThrow("회수 사유를 입력해 주세요.");
  });

  it("keeps origin denial independent from provider convergence", () => {
    expect(initialConvergenceFromReceipt(receipt)).toEqual({
      schema: "admin.public_takedown.convergence.v1",
      convergenceId: receipt.convergenceId,
      originResult: "DENIED",
      committedGeneration: 18,
      status: "PENDING",
      lastAttemptAt: null,
      retryable: false,
      attempts: [],
    });
  });

  it("explains the stored or offline copy limitation without promising deletion", () => {
    expect(remoteCopyLimitationLabel("STORED_OR_OFFLINE_COPY_MAY_REMAIN")).toContain("저장하거나 오프라인으로 보관한 사본");
  });
});
