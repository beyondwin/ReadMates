import { expect, test, type Page, type Route } from "@playwright/test";
import type { PlatformAdminRole } from "@/features/platform-admin/api/platform-admin-contracts";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";

function platformAdminAuth(role: PlatformAdminRole): AuthMeResponse {
  const email = `${role.toLowerCase()}@example.com`;
  return {
    authenticated: true,
    userId: `platform-${role.toLowerCase()}-user`,
    membershipId: null,
    clubId: null,
    email,
    displayName: `${role} admin`,
    accountName: `${role} admin`,
    role: null,
    membershipStatus: null,
    approvalState: "INACTIVE",
    currentMembership: null,
    joinedClubs: [],
    platformAdmin: { userId: `platform-${role.toLowerCase()}-user`, email, role },
    recommendedAppEntryUrl: "/admin",
  };
}

async function json(route: Route, status: number, body: unknown): Promise<void> {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function routePlatformAdminShell(page: Page, role: PlatformAdminRole): Promise<void> {
  await page.route("**/api/bff/api/auth/me**", async (route) => {
    await json(route, 200, platformAdminAuth(role));
  });
  await page.route("**/api/bff/api/admin/summary", async (route) => {
    await json(route, 200, {
      platformRole: role,
      activeClubCount: 1,
      domainActionRequiredCount: 0,
      domains: [],
      domainsRequiringAction: [],
    });
  });
  await page.route("**/api/bff/api/admin/clubs", async (route) => {
    await json(route, 200, { items: [] });
  });
}

async function routeAudit(page: Page): Promise<void> {
  await page.route("**/api/bff/api/admin/audit/events**", async (route) => {
    await json(route, 200, {
      generatedAt: "2026-05-27T00:00:00Z",
      filters: { range: "7d" },
      summary: { visibleCount: 2, sourceUnavailableCount: 0, metadataUnavailableCount: 0, unavailableSources: [] },
      nextCursor: null,
      items: [
        {
          id: "platform_audit_events:event-1",
          occurredAt: "2026-05-27T00:01:00Z",
          sourceSlice: "S5",
          sourceTable: "platform_audit_events",
          actionCategory: "NOTIFICATION",
          actionType: "ADMIN_NOTIFICATION_REPLAY_CONFIRMED",
          outcome: "SUCCESS",
          actor: { userId: "platform-owner-user", role: "OWNER", displayLabel: "OWNER" },
          target: { clubId: "club-1", userId: null, jobId: null, eventId: "preview-1", label: "Replay preview" },
          summary: "알림 재처리가 확정되었습니다.",
          safeMetadata: [{ label: "selectionHashPrefix", value: "aaaaaaaa", kind: "fingerprint" }],
          metadataState: "AVAILABLE",
        },
        {
          id: "platform_audit_events:event-2",
          occurredAt: "2026-05-27T00:00:00Z",
          sourceSlice: "S4",
          sourceTable: "platform_audit_events",
          actionCategory: "SUPPORT",
          actionType: "SUPPORT_ACCESS_GRANT_CREATED",
          outcome: "SUCCESS",
          actor: { userId: "platform-owner-user", role: "OWNER", displayLabel: "OWNER" },
          target: { clubId: "club-1", userId: null, jobId: null, eventId: null, label: "사용자 숨김" },
          summary: "support grant가 생성되었습니다.",
          safeMetadata: [{ label: "scope", value: "METADATA_READ", kind: "code" }],
          metadataState: "AVAILABLE",
        },
      ],
    });
  });
}

test("owner reviews admin audit ledger without raw private fields", async ({ page }) => {
  await routePlatformAdminShell(page, "OWNER");
  await routeAudit(page);

  await page.goto("/admin/audit");

  await expect(page.getByRole("heading", { name: "감사" })).toBeVisible();
  await expect(page.getByLabel("감사 이벤트 목록").getByText("알림 재처리가 확정되었습니다.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "알림 재처리가 확정되었습니다." })).toBeVisible();
  await expect(page.getByLabel("감사 이벤트 목록").getByText("support grant가 생성되었습니다.")).toBeVisible();
  await expect(page.getByText("member1@example.com")).toHaveCount(0);
  await expect(page.getByText("{\"")).toHaveCount(0);
});
