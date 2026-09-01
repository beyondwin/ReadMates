import { expect, test, type Page, type Route } from "@playwright/test";
import { routeEmptyAdminOperations } from "./admin-operations-e2e-fixtures";

const IDS = {
  club: "10000000-0000-4000-8000-000000000001",
  session: "20000000-0000-4000-8000-000000000002",
  publication: "30000000-0000-4000-8000-000000000003",
  preview: "40000000-0000-4000-8000-000000000004",
  receipt: "50000000-0000-4000-8000-000000000005",
  convergence: "60000000-0000-4000-8000-000000000006",
} as const;
const LIMITATION = "이미 표시되었거나 저장된 사본과 연결이 끊긴 오프라인 사본은 원격으로 삭제할 수 없습니다.";

async function json(route: Route, status: number, body: unknown) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function routeOwnerShell(page: Page) {
  await routeEmptyAdminOperations(page);
  await page.route("**/api/bff/api/auth/me**", (route) => json(route, 200, {
    authenticated: true, userId: "synthetic-owner", membershipId: null, clubId: null,
    email: "owner@example.test", displayName: "Synthetic owner", accountName: "Synthetic owner",
    role: null, membershipStatus: null, approvalState: "INACTIVE", currentMembership: null, joinedClubs: [],
    platformAdmin: { userId: "synthetic-owner", email: "owner@example.test", role: "OWNER" }, recommendedAppEntryUrl: "/admin",
    availableSpaces: { version: 1, kinds: ["PLATFORM"], clubs: [] },
  }));
  await page.route("**/api/bff/api/admin/summary", (route) => json(route, 200, {
    platformRole: "OWNER", activeClubCount: 0, domainActionRequiredCount: 0, domains: [], domainsRequiringAction: [],
  }));
  await page.route("**/api/bff/api/admin/capabilities**", (route) => json(route, 200, {
    schemaVersion: 1, role: "OWNER", status: "ACTIVE",
    capabilities: ["VIEW_TODAY", "VIEW_CLUBS", "EMERGENCY_PUBLIC_TAKEDOWN"], generatedAt: "2026-08-30T04:00:00Z",
  }));
  await page.route("**/api/bff/api/admin/clubs**", (route) => json(route, 200, { items: [] }));
  await page.route("**/api/bff/api/admin/health/snapshot", (route) => json(route, 200, {
    schema: "platform.health_snapshot.v1", generatedAt: "2026-08-30T04:00:00Z",
    lastSuccessfulAt: "2026-08-30T04:00:00Z", refreshState: "FRESH", staleAgeSeconds: 0, cards: [],
  }));
}

test("server-shaped receipt outcomes replace absent convergence GET and retry behavior", async ({ page }) => {
  await routeOwnerShell(page);
  const absentRouteRequests: string[] = [];
  await page.route("**/api/bff/api/admin/public-takedowns/preview", (route) => json(route, 200, {
    schema: "admin.public_takedown.preview.v1", previewId: IDS.preview, expiresAt: "2026-08-30T23:59:00Z",
    clubId: IDS.club, sessionId: IDS.session, publicationId: IDS.publication, targetGeneration: 17,
    currentSurfaces: ["ORIGIN", "BFF_CACHE", "CDN_CACHE", "BROWSER_CACHE"], confirmEnabled: true,
    activationBoundary: "ACTIVE", remoteCopyLimitation: LIMITATION,
  }));
  await page.route("**/api/bff/api/admin/public-takedowns/confirm", (route) => json(route, 200, {
    schema: "admin.public_takedown.receipt.v1", receiptId: IDS.receipt, convergenceId: IDS.convergence,
    clubId: IDS.club, sessionId: IDS.session, publicationId: IDS.publication, originResult: "DENIED",
    committedGeneration: 18, reasonCategory: "SECURITY_INCIDENT", reasonRedacted: true,
    createdAt: "2026-08-30T04:01:00Z", bffEvictionOutcome: "NOT_STARTED", cdnPurgeOutcome: "QUEUED",
    browserRevalidationOutcome: "BOUNDED_BY_CACHE_POLICY", remoteCopyLimitation: LIMITATION,
  }));
  await page.route("**/api/bff/api/admin/public-takedowns/**/convergence**", async (route) => {
    absentRouteRequests.push(route.request().url());
    await json(route, 404, { code: "NOT_FOUND" });
  });

  await page.goto("/admin/public-takedown");
  await page.getByLabel("클럽 ID").fill(IDS.club);
  await page.getByLabel("모임 ID").fill(IDS.session);
  await page.getByLabel("공개 기록 ID").fill(IDS.publication);
  await page.getByRole("button", { name: "대상 확인" }).click();
  await page.getByLabel("사유 분류").selectOption("SECURITY_INCIDENT");
  await page.getByLabel("회수 사유").fill("synthetic safety operation");
  await page.getByRole("button", { name: "긴급 회수 확인" }).click();

  const receipt = page.getByRole("region", { name: "변경 불가 회수 영수증" });
  await expect(receipt).toContainText("SECURITY_INCIDENT");
  await expect(receipt).toContainText("QUEUED");
  await expect(receipt).toContainText("BOUNDED_BY_CACHE_POLICY");
  await expect(page.getByRole("button", { name: /전파.*시도/ })).toHaveCount(0);
  expect(absentRouteRequests).toEqual([]);
});

test("fake clock proves activation and browser-edge bounds without real waits or live provider", async ({ page }) => {
  await routeOwnerShell(page);
  let now = 0;
  let emergencyCommitAt: number | null = null;
  let generalChangeAt: number | null = null;
  let bffEvicted = false;
  let providerAttempts = 0;
  await page.route("**/api/bff/__c4-edge/**", async (route) => {
    const url = new URL(route.request().url());
    const action = url.pathname.split("/").at(-1);
    if (action === "advance") now += Number(url.searchParams.get("seconds") ?? 0);
    if (action === "general-change") generalChangeAt = now;
    if (action === "emergency-confirm") {
      if (now < 720) return json(route, 503, { code: "ACTIVATION_NOT_VERIFIED" });
      emergencyCommitAt = now; bffEvicted = true; providerAttempts += 1;
    }
    if (action === "read") {
      const kind = url.searchParams.get("kind");
      const surface = url.searchParams.get("surface");
      const emergencyElapsed = emergencyCommitAt === null ? 0 : now - emergencyCommitAt;
      const generalElapsed = generalChangeAt === null ? 0 : now - generalChangeAt;
      const status = kind === "general"
        ? (generalChangeAt !== null && generalElapsed >= 120 ? 404 : 200)
        : (surface === "origin" || (surface === "bff" && bffEvicted) || emergencyElapsed >= 60 ? 404 : 200);
      return json(route, status, { status, marker: status === 404 ? "DENIED" : "PUBLIC_SYNTHETIC_OLD", now, surface });
    }
    await json(route, 200, { now, activationReady: now >= 720, bffEvicted, providerAttempts });
  });
  await page.goto("/admin/public-takedown");
  const call = (path: string) => page.evaluate(async (value) => {
    const response = await fetch(value); return { status: response.status, body: await response.json() };
  }, path);
  expect((await call("/api/bff/__c4-edge/emergency-confirm")).status).toBe(503);
  await call("/api/bff/__c4-edge/advance?seconds=720");
  expect((await call("/api/bff/__c4-edge/emergency-confirm")).status).toBe(200);
  expect((await call("/api/bff/__c4-edge/read?kind=emergency&surface=origin")).status).toBe(404);
  expect((await call("/api/bff/__c4-edge/read?kind=emergency&surface=bff")).status).toBe(404);
  expect(providerAttempts).toBe(1);
  await call("/api/bff/__c4-edge/advance?seconds=60");
  expect((await call("/api/bff/__c4-edge/read?kind=emergency&surface=browser")).status).toBe(404);
  await call("/api/bff/__c4-edge/general-change");
  await call("/api/bff/__c4-edge/advance?seconds=119");
  expect((await call("/api/bff/__c4-edge/read?kind=general&surface=browser")).status).toBe(200);
  await call("/api/bff/__c4-edge/advance?seconds=1");
  expect((await call("/api/bff/__c4-edge/read?kind=general&surface=browser")).status).toBe(404);
});
