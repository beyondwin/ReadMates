import { describe, expect, it } from "vitest";
import receiptFixture from "../../../tests/unit/__fixtures__/platform-admin-takedown-receipt.server.json";
import type { PlatformAdminCapabilities } from "./platform-admin-capabilities";
import {
  canOperatePublicTakedown,
  normalizeTakedownReason,
  remoteCopyLimitationLabel,
  stateFromReceipt,
  takedownReceiptOutcomePresentation,
  takedownReasonRecordLabel,
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

  it("translates only each channel's exact server snapshot without inventing progress", () => {
    expect(takedownReceiptOutcomePresentation("bff", "NOT_STARTED")).toEqual({
      label: "브라우저 앞단 캐시 회수는 아직 시작되지 않았습니다.",
      state: "unknown",
    });
    expect(takedownReceiptOutcomePresentation("cdn", "QUEUED")).toEqual({
      label: "공개 캐시 회수가 대기열에 등록되었습니다.",
      state: "pending",
    });
    expect(takedownReceiptOutcomePresentation("browser", "BOUNDED_BY_CACHE_POLICY")).toEqual({
      label: "브라우저 캐시는 정책이 허용하는 범위에서 다시 확인됩니다.",
      state: "unknown",
    });
  });

  it("fails closed for cross-channel or unknown outcomes", () => {
    expect(takedownReceiptOutcomePresentation("bff", "QUEUED")).toEqual({
      label: "브라우저 앞단 캐시 결과를 확인해야 합니다.",
      state: "unknown",
    });
    expect(takedownReceiptOutcomePresentation("cdn", "SUCCEEDED")).toEqual({
      label: "공개 캐시 결과를 확인해야 합니다.",
      state: "unknown",
    });
    expect(takedownReceiptOutcomePresentation("browser", "UNRECOGNIZED")).toEqual({
      label: "브라우저 캐시 결과를 확인해야 합니다.",
      state: "unknown",
    });
  });

  it("states whether the immutable server receipt redacted the operator reason", () => {
    expect(takedownReasonRecordLabel(receiptFixture.reasonRedacted)).toBe(
      "회수 사유 원문은 영수증에 남기지 않았습니다.",
    );
    expect(takedownReasonRecordLabel(false)).toBe(
      "회수 사유 원문이 영수증에 포함될 수 있습니다.",
    );
  });
});
