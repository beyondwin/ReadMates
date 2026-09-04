import { expect, test, type Page, type Route } from "@playwright/test";
import {
  ADMIN_APPROVED_SAMPLE_CLUB,
  buildAdminApprovedAuth,
  buildMemberAuthWithoutPlatformAdmin,
  installAdminApprovedRoutes,
} from "./support/admin-approved-route-fixtures";
import {
  HOST_APPROVED_CLUB,
  buildHostApprovedAuth,
  buildMemberAuthWithoutHostPerspective,
  installHostApprovedRoutes,
} from "./support/host-approved-route-fixtures";
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

  for (const path of [
    "/admin/today",
    "/admin/clubs",
    "/admin/health",
    "/admin/audit",
    "/admin/notifications",
    "/admin/ai-ops",
    "/admin/analytics",
    "/admin/support",
    "/admin/clubs/club-sample-reading",
  ]) {
    await page.goto(path, { waitUntil: "domcontentloaded" });
    await expect(page).not.toHaveURL(/\/admin(?:\/|$|\?)/);
    expect(adminDataRecords(requestAudit), path).toEqual([]);
  }
  await expect(page.getByRole("button", { name: "공간 전환, 현재 플랫폼 운영" })).toHaveCount(0);
  await expect(page.getByRole("menuitemradio", { name: /플랫폼 운영/ })).toHaveCount(0);
});

const HOST_DASHBOARD_PATH = `/clubs/${HOST_APPROVED_CLUB.clubSlug}/app/host`;
const OTHER_CLUB = {
  clubId: "club-other-room",
  clubSlug: "other-club",
  clubName: "다른 모임",
} as const;

function hostBffRequests(page: Page) {
  const requests: URL[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/bff/api/host/")) {
      requests.push(url);
    }
  });
  return requests;
}

function hostDataRecords(requestAudit: ReturnType<typeof createApprovedRouteRequestAudit>) {
  return requestAudit.records().filter((record) => record.path.startsWith("/api/bff/api/host/"));
}

async function installHostAuthScopeFixtures(page: Page, requestAudit: ReturnType<typeof createApprovedRouteRequestAudit>) {
  const installFixtures = (
    nextPage: Page,
    fixtureKey: Parameters<typeof installHostApprovedRoutes>[1],
    nextAudit: typeof requestAudit,
  ) => installHostApprovedRoutes(nextPage, fixtureKey, nextAudit, { workboxItems: 12 });
  await installFixtures(page, "host-operating-room", requestAudit);
}

test("approved host route requests carry clubSlug=visual-authority", async ({ page }) => {
  const requestAudit = createApprovedRouteRequestAudit();
  const hostRequests = hostBffRequests(page);
  await installApprovedRouteCatchAllAudit(page, requestAudit);
  await installHostAuthScopeFixtures(page, requestAudit);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(HOST_DASHBOARD_PATH, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("region", { name: "작업함" })).toBeVisible();
  expect(hostRequests.length).toBeGreaterThan(0);
  for (const url of hostRequests) {
    expect(url.searchParams.get("clubSlug"), url.pathname).toBe(HOST_APPROVED_CLUB.clubSlug);
  }
  requestAudit.assertNoUnmatchedOrEffecting();
});

test("a user without a host perspective is redirected and does not request host data", async ({ page }) => {
  const requestAudit = createApprovedRouteRequestAudit();
  const hostRequests = hostBffRequests(page);
  await installApprovedRouteCatchAllAudit(page, requestAudit);
  await installHostAuthScopeFixtures(page, requestAudit);
  await page.route("**/api/bff/api/auth/me**", (route) => json(route, 200, buildMemberAuthWithoutHostPerspective()));

  await page.goto(HOST_DASHBOARD_PATH, { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(new RegExp(`/clubs/${HOST_APPROVED_CLUB.clubSlug}/app(?:\\?|$)`));
  await expect(page).not.toHaveURL(/\/app\/host(?:\/|$|\?)/);
  expect(hostRequests).toEqual([]);
  expect(hostDataRecords(requestAudit)).toEqual([]);
});

test("a host URL and auth club mismatch fails closed", async ({ page }) => {
  const requestAudit = createApprovedRouteRequestAudit();
  const hostRequests = hostBffRequests(page);
  await installApprovedRouteCatchAllAudit(page, requestAudit);
  await installHostAuthScopeFixtures(page, requestAudit);
  await page.route("**/api/bff/api/auth/me**", (route) => {
    const clubSlug = new URL(route.request().url()).searchParams.get("clubSlug");
    if (clubSlug === HOST_APPROVED_CLUB.clubSlug) {
      return json(route, 200, buildHostApprovedAuth());
    }
    return json(route, 200, {
      authenticated: true,
      userId: "user-host-visual",
      membershipId: "membership-other-room",
      clubId: OTHER_CLUB.clubId,
      email: "member-other@example.test",
      displayName: "다른 모임 멤버",
      accountName: "다른 모임 멤버",
      role: "MEMBER",
      membershipStatus: "ACTIVE",
      approvalState: "ACTIVE",
      currentMembership: {
        membershipId: "membership-other-room",
        clubId: OTHER_CLUB.clubId,
        clubSlug: OTHER_CLUB.clubSlug,
        displayName: "다른 모임 멤버",
        role: "MEMBER",
        membershipStatus: "ACTIVE",
        approvalState: "ACTIVE",
        avatarKey: "apple-green-book",
      },
      joinedClubs: [
        {
          clubId: OTHER_CLUB.clubId,
          clubSlug: OTHER_CLUB.clubSlug,
          clubName: OTHER_CLUB.clubName,
          membershipId: "membership-other-room",
          role: "MEMBER",
          status: "ACTIVE",
          approvalState: "ACTIVE",
          primaryHost: null,
        },
        {
          clubId: HOST_APPROVED_CLUB.clubId,
          clubSlug: HOST_APPROVED_CLUB.clubSlug,
          clubName: HOST_APPROVED_CLUB.clubName,
          membershipId: "membership-host-visual",
          role: "HOST",
          status: "ACTIVE",
          approvalState: "ACTIVE",
          primaryHost: null,
        },
      ],
      platformAdmin: null,
      availableSpaces: {
        version: 1,
        kinds: ["CLUBS"],
        clubs: [
          {
            clubId: OTHER_CLUB.clubId,
            clubSlug: OTHER_CLUB.clubSlug,
            clubName: OTHER_CLUB.clubName,
            perspectives: ["MEMBER"],
          },
          {
            clubId: HOST_APPROVED_CLUB.clubId,
            clubSlug: HOST_APPROVED_CLUB.clubSlug,
            clubName: HOST_APPROVED_CLUB.clubName,
            perspectives: ["MEMBER", "HOST"],
          },
        ],
      },
      recommendedAppEntryUrl: `/clubs/${OTHER_CLUB.clubSlug}/app`,
    });
  });

  await page.goto(`/clubs/${OTHER_CLUB.clubSlug}/app/host`, { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(new RegExp(`/clubs/${OTHER_CLUB.clubSlug}/app(?:\\?|$)`));
  await expect(page).not.toHaveURL(/\/app\/host(?:\/|$|\?)/);
  expect(hostRequests).toEqual([]);
  expect(hostDataRecords(requestAudit)).toEqual([]);
});

test("host data is not requested before authorization completes", async ({ page }) => {
  const requestAudit = createApprovedRouteRequestAudit();
  await installApprovedRouteCatchAllAudit(page, requestAudit);
  await installHostAuthScopeFixtures(page, requestAudit);

  let releaseAuth: () => void = () => undefined;
  const authGate = new Promise<void>((resolve) => {
    releaseAuth = () => resolve();
  });
  let authCompleted = false;
  const hostBeforeAuth: string[] = [];
  page.on("request", (request) => {
    const pathname = new URL(request.url()).pathname;
    if (pathname.startsWith("/api/bff/api/host/") && !authCompleted) {
      hostBeforeAuth.push(pathname);
    }
  });
  await page.route("**/api/bff/api/auth/me**", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }
    await authGate;
    authCompleted = true;
    await json(route, 200, buildHostApprovedAuth());
  });

  const authStarted = page.waitForRequest((request) => (
    request.method() === "GET" && new URL(request.url()).pathname === "/api/bff/api/auth/me"
  ));
  await page.goto(HOST_DASHBOARD_PATH, { waitUntil: "domcontentloaded" });
  await authStarted;
  expect(hostBeforeAuth).toEqual([]);
  releaseAuth();
  await expect(page.getByRole("region", { name: "작업함" })).toBeVisible();
  requestAudit.assertNoUnmatchedOrEffecting();
});
