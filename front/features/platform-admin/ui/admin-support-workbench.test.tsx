import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { AdminSupportWorkbench } from "@/features/platform-admin/ui/admin-support-workbench";
import type { AdminSupportSearchResult } from "@/features/platform-admin/model/platform-admin-support-model";

const result: AdminSupportSearchResult = {
  subjectId: "user-1",
  displayName: "지원관리자",
  maskedEmail: "a***@example.com",
  kind: "PLATFORM_ADMIN",
  platformAdminRole: "SUPPORT",
  platformAdminStatus: "ACTIVE",
  clubMembershipSummary: [],
  grantEligible: true,
  grantBlockedReason: null,
};

function renderWorkbench(overrides: Partial<ComponentProps<typeof AdminSupportWorkbench>> = {}) {
  return render(
    <AdminSupportWorkbench
      clubs={[{ clubId: "club-1", slug: "reading-sai", name: "읽는사이", tagline: "", about: "", status: "ACTIVE", publicVisibility: "PUBLIC", domainCount: 0, domainActionRequiredCount: 0, firstHostOnboardingState: "ASSIGNED" }]}
      selectedClubId="club-1"
      query=""
      results={[]}
      selectedResult={null}
      ledger={[]}
      reason=""
      expiresAt="2026-05-27T11:00"
      busy={false}
      error={null}
      canCreateGrant
      onQueryChange={vi.fn()}
      onSearch={vi.fn()}
      onSelectResult={vi.fn()}
      onClubChange={vi.fn()}
      onReasonChange={vi.fn()}
      onExpiresAtChange={vi.fn()}
      onCreateGrant={vi.fn()}
      onRevokeGrant={vi.fn()}
      {...overrides}
    />,
  );
}

describe("AdminSupportWorkbench", () => {
  it("renders search before grant form", () => {
    renderWorkbench();

    expect(screen.getByRole("heading", { name: "지원 대상 검색" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "지원 접근 권한 발급" })).not.toBeInTheDocument();
  });

  it("selecting an eligible result reveals grant form without raw id label", async () => {
    const onSelectResult = vi.fn();
    const user = userEvent.setup();
    renderWorkbench({ results: [result], onSelectResult });

    await user.click(screen.getByRole("button", { name: /지원관리자/ }));
    expect(onSelectResult).toHaveBeenCalledWith(result);

    renderWorkbench({ selectedResult: result });
    expect(screen.getByRole("heading", { name: "지원 접근 권한 발급" })).toBeInTheDocument();
    expect(screen.queryByText("Grantee User ID")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "발급" })).toBeDisabled();
  });

  it("revoke button calls callback with grant id", async () => {
    const onRevokeGrant = vi.fn();
    const user = userEvent.setup();
    renderWorkbench({
      onRevokeGrant,
      ledger: [{
        grantId: "grant-1",
        clubId: "club-1",
        clubName: "읽는사이",
        granteeUserId: "user-1",
        granteeDisplayName: "지원관리자",
        granteeMaskedEmail: "a***@example.com",
        scope: "HOST_SUPPORT_READ",
        reason: "ticket",
        expiresAt: "2026-05-27T11:00:00Z",
        createdAt: "2026-05-27T10:00:00Z",
        revokedAt: null,
        status: "ACTIVE",
        createdByRole: "OWNER",
      }],
    });

    await user.click(screen.getByRole("button", { name: "권한 취소" }));

    expect(onRevokeGrant).toHaveBeenCalledWith("grant-1");
  });

  it("renders support risk summary and reason presets for a selected result", async () => {
    const onReasonChange = vi.fn();
    const user = userEvent.setup();
    renderWorkbench({ selectedResult: result, onReasonChange });

    expect(screen.getByRole("heading", { name: "지원 접근 검토" })).toBeInTheDocument();
    expect(screen.getByText("지원 사유를 입력하세요.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "고객 문의 재현 지원" }));

    expect(onReasonChange).toHaveBeenCalledWith("고객 문의 재현 지원");
  });

  it("keeps grant creation disabled when the risk summary is blocked", () => {
    renderWorkbench({ selectedResult: result, reason: "", expiresAt: "2026-05-27T11:00" });

    expect(screen.getByText("지원 사유를 입력하세요.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "발급" })).toBeDisabled();
  });

  it("shows ready risk summary when reason and expiry are valid", () => {
    const oneHourFromNowDate = new Date(Date.now() + 60 * 60 * 1000);
    const pad = (value: number) => String(value).padStart(2, "0");
    const oneHourFromNow = `${oneHourFromNowDate.getFullYear()}-${pad(oneHourFromNowDate.getMonth() + 1)}-${pad(oneHourFromNowDate.getDate())}T${pad(oneHourFromNowDate.getHours())}:${pad(oneHourFromNowDate.getMinutes())}`;
    renderWorkbench({ selectedResult: result, reason: "고객 문의 재현 지원", expiresAt: oneHourFromNow });

    expect(screen.getByText("지원 접근 권한을 발급할 준비가 되었습니다.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "발급" })).not.toBeDisabled();
  });
});
