import { expect, test } from "@playwright/experimental-ct-react";
import { AdminSupportWorkbench, type AdminSupportWorkbenchProps } from "./admin-support-workbench";

const selectedSupportProps: AdminSupportWorkbenchProps = {
  clubs: [
    { clubId: "00000000-0000-0000-0000-000000000001", name: "읽는사이" },
    { clubId: "00000000-0000-0000-0000-000000000002", name: "밤의 독서실" },
  ],
  selectedClubId: "00000000-0000-0000-0000-000000000001",
  query: "지원 대상",
  results: [
    {
      subjectId: "00000000-0000-0000-0000-00000000a001",
      displayName: "지원 대상",
      maskedEmail: "su***@example.com",
      kind: "USER",
      platformAdminRole: null,
      platformAdminStatus: null,
      clubMembershipSummary: [
        {
          clubId: "00000000-0000-0000-0000-000000000001",
          clubName: "읽는사이",
          role: "HOST",
          status: "ACTIVE",
        },
      ],
      grantEligible: true,
      grantBlockedReason: null,
    },
  ],
  selectedResult: {
    subjectId: "00000000-0000-0000-0000-00000000a001",
    displayName: "지원 대상",
    maskedEmail: "su***@example.com",
    kind: "USER",
    platformAdminRole: null,
    platformAdminStatus: null,
    clubMembershipSummary: [
      {
        clubId: "00000000-0000-0000-0000-000000000001",
        clubName: "읽는사이",
        role: "HOST",
        status: "ACTIVE",
      },
    ],
    grantEligible: true,
    grantBlockedReason: null,
  },
  hasSearched: true,
  ledger: [
    {
      grantId: "00000000-0000-0000-0000-00000000b001",
      clubId: "00000000-0000-0000-0000-000000000001",
      clubName: "읽는사이",
      granteeUserId: "00000000-0000-0000-0000-00000000a001",
      granteeDisplayName: "지원 대상",
      granteeMaskedEmail: "su***@example.com",
      scope: "HOST_SUPPORT_READ",
      reason: "고객 문의 재현 지원",
      expiresAt: "2026-06-25T12:00:00Z",
      createdAt: "2026-06-25T09:00:00Z",
      revokedAt: null,
      status: "ACTIVE",
      createdByRole: "OWNER",
    },
  ],
  reason: "고객 문의 재현 지원",
  expiresAt: "2026-06-25T18:00",
  busy: false,
  error: null,
  canCreateGrant: true,
  onQueryChange: () => undefined,
  onSearch: async () => undefined,
  onSelectResult: () => undefined,
  onClubChange: () => undefined,
  onReasonChange: () => undefined,
  onExpiresAtChange: () => undefined,
  onCreateGrant: async () => undefined,
  onRevokeGrant: async () => undefined,
};

test("AdminSupportWorkbench renders selected support grant risk review", async ({ mount, page }) => {
  await page.clock.setFixedTime(new Date("2026-06-25T09:30:00Z"));

  const component = await mount(
    <div style={{ width: 480 }}>
      <AdminSupportWorkbench {...selectedSupportProps} />
    </div>,
  );

  await expect(component).toHaveScreenshot("admin-support-workbench-selected.png");
});
