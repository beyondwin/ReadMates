import { describe, expect, it } from "vitest";
import receiptFixture from "../../../tests/unit/__fixtures__/platform-admin-takedown-receipt.server.json";
import type { PlatformAdminCapabilities } from "./platform-admin-capabilities";
import {
  canOperatePublicTakedown,
  normalizeTakedownReason,
  remoteCopyLimitationLabel,
  stateFromReceipt,
} from "./platform-admin-takedown-model";
import { parseAdminTakedownReceipt } from "../api/platform-admin-takedown-contracts";

function caps(
  role: PlatformAdminCapabilities["role"],
  capabilities: PlatformAdminCapabilities["capabilities"],
): PlatformAdminCapabilities {
  return { schemaVersion: 1, role, status: "ACTIVE", capabilities, generatedAt: "2026-08-30T04:00:00Z" };
}

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

  it("projects the immutable server receipt without inventing convergence state", () => {
    const receipt = parseAdminTakedownReceipt(receiptFixture);
    expect(stateFromReceipt(receipt)).toEqual({ kind: "origin-denied", receipt });
  });

  it("renders the server-authoritative remote-copy limitation verbatim", () => {
    expect(remoteCopyLimitationLabel(receiptFixture.remoteCopyLimitation)).toBe(receiptFixture.remoteCopyLimitation);
  });
});
