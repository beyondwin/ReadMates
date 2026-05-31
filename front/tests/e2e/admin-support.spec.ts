import { expect, test, type Page, type Route } from "@playwright/test";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";

const CLUB_ID = "club-1";
const SUBJECT_ID = "support-1";

function platformAdminAuth(): AuthMeResponse {
  return {
    authenticated: true,
    userId: "owner-1",
    membershipId: null,
    clubId: null,
    email: "owner@example.com",
    displayName: "Owner admin",
    accountName: "Owner admin",
    role: null,
    membershipStatus: null,
    approvalState: "INACTIVE",
    currentMembership: null,
    joinedClubs: [],
    platformAdmin: { userId: "owner-1", email: "owner@example.com", role: "OWNER" },
    recommendedAppEntryUrl: "/admin",
  };
}

async function json(route: Route, status: number, body: unknown): Promise<void> {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function routeSupport(page: Page): Promise<void> {
  await page.route("**/api/bff/api/auth/me**", async (route) => json(route, 200, platformAdminAuth()));
  await page.route("**/api/bff/api/admin/summary", async (route) => json(route, 200, {
    platformRole: "OWNER",
    activeClubCount: 1,
    domainActionRequiredCount: 0,
    domains: [],
    domainsRequiringAction: [],
  }));
  await page.route("**/api/bff/api/admin/clubs", async (route) => json(route, 200, {
    items: [{
      clubId: CLUB_ID,
      slug: "reading-sai",
      name: "읽는사이",
      tagline: "",
      about: "",
      status: "ACTIVE",
      publicVisibility: "PUBLIC",
      domainCount: 0,
      domainActionRequiredCount: 0,
      firstHostOnboardingState: "ASSIGNED",
    }],
  }));
  await page.route("**/api/bff/api/admin/support/search**", async (route) => json(route, 200, [{
    subjectId: SUBJECT_ID,
    displayName: "지원관리자",
    maskedEmail: "a***@example.com",
    kind: "PLATFORM_ADMIN",
    platformAdminRole: "SUPPORT",
    platformAdminStatus: "ACTIVE",
    clubMembershipSummary: [],
    grantEligible: true,
    grantBlockedReason: null,
  }]));
  await page.route("**/api/bff/api/admin/support/grants**", async (route) => {
    if (route.request().method() === "DELETE") {
      await route.fallback();
      return;
    }
    if (route.request().method() === "POST") {
      await json(route, 200, {
        id: "grant-1",
        clubId: CLUB_ID,
        grantedByUserId: "owner-1",
        granteeUserId: SUBJECT_ID,
        scope: "HOST_SUPPORT_READ",
        reason: "ticket",
        expiresAt: "2026-05-27T12:00:00Z",
        revokedAt: null,
        createdAt: "2026-05-27T10:00:00Z",
      });
      return;
    }
    await json(route, 200, [{
      grantId: "grant-1",
      clubId: CLUB_ID,
      clubName: "읽는사이",
      granteeUserId: SUBJECT_ID,
      granteeDisplayName: "지원관리자",
      granteeMaskedEmail: "a***@example.com",
      scope: "HOST_SUPPORT_READ",
      reason: "ticket",
      expiresAt: "2026-05-27T12:00:00Z",
      createdAt: "2026-05-27T10:00:00Z",
      revokedAt: null,
      status: "ACTIVE",
      createdByRole: "OWNER",
    }]);
  });
  await page.route("**/api/bff/api/admin/support/grants/grant-1", async (route) => {
    await route.fulfill({ status: 204 });
  });
}

test("owner searches support subject then creates and revokes grant", async ({ page }) => {
  await routeSupport(page);

  await page.goto(`/admin/support?clubId=${CLUB_ID}`);

  await page.getByPlaceholder("이름 또는 이메일").fill("admin-support@example.com");
  await page.getByRole("button", { name: "검색" }).click();
  await expect(page.getByRole("button", { name: /지원관리자/ })).toBeVisible();
  await expect(page.getByText("admin-support@example.com")).toHaveCount(0);

  await page.getByRole("button", { name: /지원관리자/ }).click();
  await page.getByLabel("사유").fill("ticket");
  await page.getByRole("button", { name: "발급" }).click();
  await expect(page.getByRole("button", { name: "권한 취소" })).toBeVisible();
  await page.getByRole("button", { name: "권한 취소" }).click();
});
