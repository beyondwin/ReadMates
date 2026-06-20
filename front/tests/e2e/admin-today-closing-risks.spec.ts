import { expect, test, type Page, type Route } from "@playwright/test";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";

const CLUB_ID = "club-ready";
const SESSION_ID = "11111111-2222-3333-4444-555555555555";

function platformAdminAuth(): AuthMeResponse {
  return {
    authenticated: true,
    userId: "platform-owner-user",
    membershipId: null,
    clubId: null,
    email: "owner@example.com",
    displayName: "OWNER admin",
    accountName: "OWNER admin",
    role: null,
    membershipStatus: null,
    approvalState: "INACTIVE",
    currentMembership: null,
    joinedClubs: [],
    platformAdmin: { userId: "platform-owner-user", email: "owner@example.com", role: "OWNER" },
    recommendedAppEntryUrl: "/admin",
  };
}

async function json(route: Route, status: number, body: unknown): Promise<void> {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function routeAdminTodayClosingRisks(page: Page): Promise<void> {
  await page.route("**/api/bff/api/auth/me**", async (route) => {
    await json(route, 200, platformAdminAuth());
  });
  await page.route("**/api/bff/api/admin/summary", async (route) => {
    await json(route, 200, {
      platformRole: "OWNER",
      activeClubCount: 1,
      domainActionRequiredCount: 0,
      domains: [],
      domainsRequiringAction: [],
    });
  });
  await page.route("**/api/bff/api/admin/clubs", async (route) => {
    await json(route, 200, {
      items: [{
        clubId: CLUB_ID,
        slug: "ready-club",
        name: "Ready Club",
        tagline: "읽는 힘",
        about: "함께 읽는 공간",
        status: "ACTIVE",
        publicVisibility: "PUBLIC",
        domainCount: 0,
        domainActionRequiredCount: 0,
        firstHostOnboardingState: "ASSIGNED",
      }],
    });
  });
  await page.route("**/api/bff/api/admin/notifications/snapshot", async (route) => {
    await json(route, 200, {
      generatedAt: "2026-06-20T00:00:00Z",
      outboxSummary: { pending: 0, active: 0, failed: 0, dead: 0, sentOrPublishedLast24h: 1 },
      deliverySummary: { pending: 0, active: 0, failed: 0, dead: 0, sentOrPublishedLast24h: 1 },
      relaySummary: { publishing: 0, sending: 0, stalePublishing: 0, staleSending: 0 },
      failureClusters: [],
      clubHealth: [],
      recentManualDispatches: [],
    });
  });
  await page.route("**/api/bff/api/admin/ai-generation/summary", async (route) => {
    await json(route, 200, {
      activeJobCount: 0,
      failedLast24h: 0,
      monthToDateCostEstimateUsd: "0.0000",
      failureCodes: [],
      providerCosts: [],
      staleCandidateCount: 0,
    });
  });
  await page.route("**/api/bff/api/admin/ai-generation/jobs**", async (route) => {
    await json(route, 200, { items: [], nextCursor: null });
  });
  await page.route("**/api/bff/api/admin/today/closing-risks", async (route) => {
    await json(route, 200, {
      schema: "admin.today_closing_risks.v1",
      generatedAt: "2026-06-20T00:00:00Z",
      items: [{
        clubId: CLUB_ID,
        clubSlug: "ready-club",
        clubName: "Ready Club",
        sessionId: SESSION_ID,
        sessionNumber: 12,
        bookTitle: "모던 자바스크립트",
        meetingDate: "2026-06-20",
        overallState: "RAW_PRIVATE_STATE",
        primaryBlocker: "RAW_MEMBER_EMAIL_SENTINEL PRIVATE_DOMAIN_SENTINEL RAW_JSON_SENTINEL ADMIN_ROUTE_SENTINEL",
        hostClosingHref: `/clubs/ready-club/app/host/sessions/${SESSION_ID}/closing`,
      }],
    });
  });
}

test("owner sees safe admin today closing risk row with host closing board link", async ({ page }) => {
  await routeAdminTodayClosingRisks(page);

  await page.goto(`/admin/today?selected=closing-risk-${SESSION_ID}`);

  await expect(page.getByRole("heading", { name: "오늘 할 일" })).toBeVisible();
  await expect(page.getByRole("button", { name: /모던 자바스크립트/ })).toBeVisible();
  await expect(page.getByText("확인 필요").first()).toBeVisible();
  await expect(page.getByText(/RAW_MEMBER_EMAIL_SENTINEL|PRIVATE_DOMAIN_SENTINEL|RAW_JSON_SENTINEL|ADMIN_ROUTE_SENTINEL/))
    .toHaveCount(0);

  const brief = page.getByRole("region", { name: "선택 항목 브리프" });
  await expect(brief.getByRole("heading", { name: "Ready Club · No.12" })).toBeVisible();
  await expect(brief.getByRole("link", { name: "호스트 클로징 보드" }).first()).toHaveAttribute(
    "href",
    `/clubs/ready-club/app/host/sessions/${SESSION_ID}/closing`,
  );
});
