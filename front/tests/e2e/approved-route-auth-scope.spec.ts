import { expect, test, type Route } from "@playwright/test";
import {
  ADMIN_APPROVED_SAMPLE_CLUB,
  buildAdminApprovedAuth,
  buildMemberAuthWithoutPlatformAdmin,
  installAdminApprovedRoutes,
} from "./support/admin-approved-route-fixtures";
import {
  createApprovedRouteRequestAudit,
  installApprovedRouteCatchAllAudit,
} from "./support/approved-route-request-audit";

const FRONTEND_OBSERVABILITY_PATH = "/api/bff/observability/frontend-events";
const LEGACY_CLUB_NAME = "레거시 모임";

async function json(route: Route, status: number, body: unknown): Promise<void> {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

function adminDataRecords(requestAudit: ReturnType<typeof createApprovedRouteRequestAudit>) {
  return requestAudit.records().filter((record) => record.path.startsWith("/api/bff/api/admin/"));
}

test("Admin switcher options come only from availableSpaces", async ({ page }) => {
  const requestAudit = createApprovedRouteRequestAudit();
  await installApprovedRouteCatchAllAudit(page, requestAudit);
  await installAdminApprovedRoutes(page, "admin-today", requestAudit);
  const sampleMembership = {
    clubId: ADMIN_APPROVED_SAMPLE_CLUB.clubId,
    clubSlug: ADMIN_APPROVED_SAMPLE_CLUB.clubSlug,
    clubName: ADMIN_APPROVED_SAMPLE_CLUB.clubName,
    membershipId: "membership-sample-reading",
    role: "HOST" as const,
    status: "ACTIVE" as const,
    approvalState: "ACTIVE" as const,
    primaryHost: null,
  };
  await page.route("**/api/bff/api/auth/me**", (route) => json(route, 200, buildAdminApprovedAuth({
    joinedClubs: [
      sampleMembership,
      {
        clubId: "club-legacy-room",
        clubSlug: "legacy-room",
        clubName: LEGACY_CLUB_NAME,
        membershipId: "membership-legacy-room",
        role: "HOST",
        status: "ACTIVE",
        approvalState: "ACTIVE",
        primaryHost: null,
      },
    ],
    availableSpaces: {
      version: 1,
      kinds: ["PLATFORM", "CLUBS"],
      clubs: [{
        clubId: ADMIN_APPROVED_SAMPLE_CLUB.clubId,
        clubSlug: ADMIN_APPROVED_SAMPLE_CLUB.clubSlug,
        clubName: ADMIN_APPROVED_SAMPLE_CLUB.clubName,
        perspectives: ["MEMBER"],
      }],
    },
  })));

  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/admin/today", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "공간 전환, 현재 플랫폼 운영" }).click();
  await expect(page.getByRole("menu")).toBeVisible();
  await expect(page.getByRole("menuitemradio", { name: /플랫폼 운영/ })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "내 클럽" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: new RegExp(LEGACY_CLUB_NAME) })).toHaveCount(0);
  await expect(page.getByRole("menuitem", { name: /샘플 독서모임/ })).toHaveCount(0);

  await page.getByRole("menuitem", { name: "내 클럽" }).click();
  await expect(page.getByRole("group", { name: "샘플 독서모임" })).toBeVisible();
  await expect(page.getByText(LEGACY_CLUB_NAME)).toHaveCount(0);
  await expect(page.getByRole("menuitemradio", { name: "샘플 독서모임 멤버로 보기" })).toBeVisible();
  await expect(page.getByRole("menuitemradio", { name: /호스트로 운영/ })).toHaveCount(0);
  requestAudit.assertNoUnmatchedOrEffecting();
});

test("a user without platform-admin capability does not see Admin or request protected Admin data", async ({ page }) => {
  const requestAudit = createApprovedRouteRequestAudit();
  await installApprovedRouteCatchAllAudit(page, requestAudit);
  requestAudit.allowFixture({ method: "GET", path: "/api/bff/api/auth/me" });
  requestAudit.allowFixture({ method: "POST", path: FRONTEND_OBSERVABILITY_PATH });
  await page.route("**/api/bff/api/auth/me**", (route) => json(route, 200, buildMemberAuthWithoutPlatformAdmin()));
  await page.route("**/api/bff/observability/frontend-events", (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    return route.fulfill({ status: 204 });
  });

  await page.goto("/admin/today", { waitUntil: "domcontentloaded" });
  await expect(page).not.toHaveURL(/\/admin(?:\/|$|\?)/);
  await expect(page.getByRole("button", { name: "공간 전환, 현재 플랫폼 운영" })).toHaveCount(0);
  await expect(page.getByRole("menuitemradio", { name: /플랫폼 운영/ })).toHaveCount(0);
  expect(adminDataRecords(requestAudit)).toEqual([]);
});
