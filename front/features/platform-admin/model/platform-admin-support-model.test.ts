import { describe, expect, it } from "vitest";
import {
  SUPPORT_REASON_PRESETS,
  buildSupportGrantRiskSummary,
  flattenSupportGrantLedgerPages,
  formatSupportGrantLedgerSentence,
  isSupportReasonPresetSafe,
  normalizeSupportGrantStatus,
  supportGrantCommandRecovery,
  type AdminSupportGrantLedgerPage,
  type AdminSupportSearchResult,
} from "./platform-admin-support-model";

const eligibleResult: AdminSupportSearchResult = {
  subjectId: "support-1",
  displayName: "지원관리자",
  maskedEmail: "a***@example.com",
  kind: "PLATFORM_ADMIN",
  platformAdminRole: "SUPPORT",
  platformAdminStatus: "ACTIVE",
  clubMembershipSummary: [],
  grantEligible: true,
  grantBlockedReason: null,
};

function summary(overrides: Partial<Parameters<typeof buildSupportGrantRiskSummary>[0]> = {}) {
  return buildSupportGrantRiskSummary({
    selectedResult: eligibleResult,
    selectedClubId: "club-1",
    canCreateGrant: true,
    reason: "고객 문의 재현 지원",
    expiresAt: "2026-05-27T11:00",
    now: new Date("2026-05-27T10:00"),
    ...overrides,
  });
}

describe("buildSupportGrantRiskSummary", () => {
  it("blocks grant creation until a subject is selected", () => {
    const result = summary({ selectedResult: null });

    expect(result.status).toBe("BLOCKED");
    expect(result.primaryMessage).toBe("지원 대상을 먼저 선택하세요.");
    expect(result.items.find((item) => item.id === "subject")?.state).toBe("BLOCKED");
  });

  it("blocks when a club is not selected", () => {
    const result = summary({ selectedClubId: null });

    expect(result.status).toBe("BLOCKED");
    expect(result.items.find((item) => item.id === "club")?.detail).toBe("클럽 선택이 필요합니다.");
  });

  it("blocks non-owner admins from issuing a grant", () => {
    const result = summary({ canCreateGrant: false });

    expect(result.status).toBe("BLOCKED");
    expect(result.items.find((item) => item.id === "permission")?.detail).toBe(
      "소유자만 지원 접근 권한을 발급할 수 있습니다.",
    );
  });

  it("uses the public-safe blocked reason for ineligible subjects", () => {
    const result = summary({
      selectedResult: {
        ...eligibleResult,
        grantEligible: false,
        grantBlockedReason: "이미 활성 grant가 있습니다.",
      },
    });

    expect(result.status).toBe("BLOCKED");
    expect(result.items.find((item) => item.id === "eligibility")?.detail).toBe("이미 활성 grant가 있습니다.");
  });

  it("blocks empty reasons and invalid expiry values", () => {
    const result = summary({ reason: " ", expiresAt: "not-a-date" });

    expect(result.status).toBe("BLOCKED");
    expect(result.items.find((item) => item.id === "reason")?.state).toBe("BLOCKED");
    expect(result.items.find((item) => item.id === "expiry")?.detail).toBe("만료 시각을 다시 확인하세요.");
  });

  it("warns when the expiry is longer than the short support window", () => {
    const result = summary({ expiresAt: "2026-05-29T11:00" });

    expect(result.status).toBe("WARNING");
    expect(result.primaryMessage).toBe("발급 가능하지만 만료 시간이 길어 검토가 필요합니다.");
    expect(result.items.find((item) => item.id === "expiry")?.state).toBe("WARNING");
  });

  it("returns ready when every support grant input is safe enough", () => {
    const result = summary();

    expect(result.status).toBe("READY");
    expect(result.primaryMessage).toBe("지원 접근 권한을 발급할 준비가 되었습니다.");
  });
});

describe("SUPPORT_REASON_PRESETS", () => {
  it("uses only public-safe preset labels", () => {
    expect(SUPPORT_REASON_PRESETS).toEqual([
      "고객 문의 재현 지원",
      "호스트 온보딩 상태 확인",
      "알림 전달 상태 확인",
      "클럽 공개 준비 지원",
    ]);
    expect(SUPPORT_REASON_PRESETS.every(isSupportReasonPresetSafe)).toBe(true);
  });

  it("rejects preset text that looks private or token-shaped", () => {
    expect(isSupportReasonPresetSafe("ticket #1234")).toBe(false);
    expect(isSupportReasonPresetSafe("member@example.com")).toBe(false);
    expect(isSupportReasonPresetSafe("secret-token")).toBe(false);
  });
});

describe("support grant ledger", () => {
  it("accumulates cursor pages and removes duplicate boundary grants", () => {
    const grant = {
      grantId: "grant-1",
      clubId: "club-1",
      clubName: "읽는사이",
      granteeDisplayName: "지원 대상",
      granteeMaskedEmail: "s***@example.com",
      scope: "HOST_SUPPORT_READ" as const,
      reasonCategory: "MEMBER_ASSISTANCE" as const,
      notePresent: true,
      expiresAt: "2026-08-25T12:00:00Z",
      createdAt: "2026-08-25T10:00:00Z",
      revokedAt: null,
      status: "ACTIVE" as const,
      createdByRole: "OWNER",
    };
    const pages: AdminSupportGrantLedgerPage[] = [
      { items: [grant], nextCursor: "next" },
      { items: [grant, { ...grant, grantId: "grant-2" }], nextCursor: null },
    ];

    expect(flattenSupportGrantLedgerPages(pages).map((item) => item.grantId)).toEqual(["grant-1", "grant-2"]);
  });

  it("sentence-izes a grant row with Korean status and reason labels", () => {
    const grant = {
      grantId: "grant-1",
      clubId: "club-1",
      clubName: "읽는사이",
      granteeDisplayName: "지원 대상",
      granteeMaskedEmail: "s***@example.com",
      scope: "HOST_SUPPORT_READ" as const,
      reasonCategory: "MEMBER_ASSISTANCE" as const,
      notePresent: true,
      expiresAt: "2026-08-25T12:00:00Z",
      createdAt: "2026-08-25T10:00:00Z",
      revokedAt: null,
      status: "ACTIVE" as const,
      createdByRole: "OWNER",
    };

    expect(formatSupportGrantLedgerSentence(grant)).toMatch(/읽는사이에서 지원 대상에게 지원 접근을 발급함 · 사유: 회원 지원 · 활성/);
    expect(formatSupportGrantLedgerSentence(grant)).not.toMatch(/\bACTIVE\b/);
    expect(formatSupportGrantLedgerSentence(grant)).toContain("처리 역할: 소유자");
    expect(formatSupportGrantLedgerSentence(grant)).not.toMatch(/\bOWNER\b/);
    expect(formatSupportGrantLedgerSentence({ ...grant, status: "REVOKED" })).toMatch(/지원 접근을 취소함 · 사유: 회원 지원 · 취소됨/);
  });

  it("allows only share-safe status values in the URL", () => {
    expect(normalizeSupportGrantStatus("EXPIRING")).toBe("EXPIRING");
    expect(normalizeSupportGrantStatus("grantee@example.com")).toBeUndefined();
    expect(normalizeSupportGrantStatus(null)).toBeUndefined();
  });
});

describe("support grant command recovery", () => {
  it.each(["COMMAND_IN_PROGRESS", "NETWORK_UNKNOWN"])("keeps the same intent for %s", (code) => {
    expect(supportGrantCommandRecovery({ code }).kind).toBe("SAME_INTENT");
  });

  it.each(["PREVIEW_EXPIRED", "PREVIEW_CONSUMED", "PREVIEW_MISMATCH", "IDEMPOTENCY_CONFLICT"])(
    "requires a fresh preview for %s",
    (code) => {
      expect(supportGrantCommandRecovery({ code }).kind).toBe("RESTART_PREVIEW");
    },
  );
});
