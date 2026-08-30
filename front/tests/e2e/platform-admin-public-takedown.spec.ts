import { expect, test, type Page, type Route } from "@playwright/test";
import { routeEmptyAdminOperations } from "./admin-operations-e2e-fixtures";
import { expectNoHorizontalOverflow } from "./support/visual-authority-contract";

const CLUB_ID = "10000000-0000-4000-8000-000000000001";
const SESSION_ID = "20000000-0000-4000-8000-000000000002";
const PUBLICATION_ID = "30000000-0000-4000-8000-000000000003";
const PREVIEW_ID = "40000000-0000-4000-8000-000000000004";
const RECEIPT_ID = "50000000-0000-4000-8000-000000000005";
const CONVERGENCE_ID = "60000000-0000-4000-8000-000000000006";
const LIMITATION = "이미 표시되었거나 저장된 사본과 연결이 끊긴 오프라인 사본은 원격으로 삭제할 수 없습니다.";

async function json(route: Route, status: number, body: unknown) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function routeAdminShell(page: Page, role: "OWNER" | "SUPPORT", capabilities?: string[]) {
  await routeEmptyAdminOperations(page);
  await page.route("**/api/bff/api/auth/me**", (route) => json(route, 200, {
    authenticated: true, userId: "synthetic-admin", membershipId: null, clubId: null,
    email: "synthetic-admin@example.test", displayName: "Synthetic admin", accountName: "Synthetic admin",
    role: null, membershipStatus: null, approvalState: "INACTIVE", currentMembership: null, joinedClubs: [],
    platformAdmin: { userId: "synthetic-admin", email: "synthetic-admin@example.test", role },
    availableSpaces: { version: 1, kinds: ["PLATFORM"], clubs: [] },
    recommendedAppEntryUrl: "/admin",
  }));
  await page.route("**/api/bff/api/admin/summary", (route) => json(route, 200, {
    platformRole: role, activeClubCount: 0, domainActionRequiredCount: 0, domains: [], domainsRequiringAction: [],
  }));
  await page.route("**/api/bff/api/admin/capabilities**", (route) => json(route, 200, {
    schemaVersion: 1, role, status: "ACTIVE",
    capabilities: capabilities ?? (role === "OWNER" ? ["VIEW_TODAY", "VIEW_CLUBS", "EMERGENCY_PUBLIC_TAKEDOWN"] : ["VIEW_TODAY", "VIEW_CLUBS"]),
    generatedAt: "2026-08-30T04:00:00Z",
  }));
  await page.route("**/api/bff/api/admin/clubs**", (route) => json(route, 200, { items: [] }));
  await page.route("**/api/bff/api/admin/health/snapshot", (route) => json(route, 200, {
    schema: "platform.health_snapshot.v1", generatedAt: "2026-08-30T04:00:00Z",
    lastSuccessfulAt: "2026-08-30T04:00:00Z", refreshState: "FRESH", staleAgeSeconds: 0, cards: [],
  }));
}

test("owner confirms one exact target once and renders server receipt outcomes", async ({ page }) => {
  await routeAdminShell(page, "OWNER");
  let confirmCalls = 0;
  const takedownRequests: string[] = [];
  await page.route("**/api/bff/api/admin/public-takedowns/preview", (route) => json(route, 200, {
    schema: "admin.public_takedown.preview.v1", previewId: PREVIEW_ID, expiresAt: "2026-08-30T23:59:00Z",
    clubId: CLUB_ID, sessionId: SESSION_ID, publicationId: PUBLICATION_ID, targetGeneration: 17,
    currentSurfaces: ["BFF_CACHE", "BROWSER_CACHE", "CDN_CACHE", "ORIGIN"], confirmEnabled: true,
    activationBoundary: "ACTIVE", remoteCopyLimitation: LIMITATION,
  }));
  await page.route("**/api/bff/api/admin/public-takedowns/confirm", async (route) => {
    confirmCalls += 1;
    takedownRequests.push(new URL(route.request().url()).pathname);
    await json(route, 200, receipt());
  });
  await page.route("**/api/bff/api/admin/public-takedowns/**/convergence**", async (route) => {
    takedownRequests.push(new URL(route.request().url()).pathname);
    await json(route, 404, { code: "NOT_FOUND" });
  });

  await page.goto("/admin/public-takedown");
  await page.getByLabel("클럽 ID").fill(CLUB_ID);
  await page.getByLabel("모임 ID").fill(SESSION_ID);
  await page.getByLabel("공개 기록 ID").fill(PUBLICATION_ID);
  await page.getByRole("button", { name: "대상 확인" }).click();
  await expect(page.getByText("ORIGIN")).toBeVisible();
  await expect(page.getByText(LIMITATION)).toBeVisible();
  await page.getByLabel("회수 사유").fill("synthetic private data request");
  await page.getByRole("button", { name: "긴급 회수 확인" }).click();

  const immutableReceipt = page.getByRole("region", { name: "변경 불가 회수 영수증" });
  await expect(immutableReceipt).toContainText(RECEIPT_ID);
  await expect(immutableReceipt).toContainText("NOT_STARTED");
  await expect(immutableReceipt).toContainText("QUEUED");
  await expect(immutableReceipt).toContainText("BOUNDED_BY_CACHE_POLICY");
  await expect(page.getByRole("button", { name: /전파.*시도/ })).toHaveCount(0);
  expect(confirmCalls).toBe(1);
  expect(takedownRequests).toEqual(["/api/bff/api/admin/public-takedowns/confirm"]);
});

for (const scenario of [
  { role: "OWNER" as const, capabilities: ["VIEW_TODAY", "VIEW_CLUBS"] },
  { role: "SUPPORT" as const, capabilities: undefined },
]) {
  test(`${scenario.role} without capability cannot submit a takedown`, async ({ page }) => {
    await routeAdminShell(page, scenario.role, scenario.capabilities);
    let mutationCalls = 0;
    await page.route("**/api/bff/api/admin/public-takedowns/**", async (route) => {
      mutationCalls += 1;
      await json(route, 403, { code: "PERMISSION_DENIED", message: "denied", status: 403 });
    });
    await page.goto("/admin/public-takedown");
    await expect(page.getByText("긴급 회수 권한이 없습니다.")).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expect(page.getByLabel("클럽 ID")).toHaveCount(0);
    expect(mutationCalls).toBe(0);
  });
}

function receipt() {
  return {
    schema: "admin.public_takedown.receipt.v1", receiptId: RECEIPT_ID, convergenceId: CONVERGENCE_ID,
    clubId: CLUB_ID, sessionId: SESSION_ID, publicationId: PUBLICATION_ID, originResult: "DENIED",
    committedGeneration: 18, reasonCategory: "PRIVATE_DATA", reasonRedacted: true,
    createdAt: "2026-08-30T04:01:00Z", bffEvictionOutcome: "NOT_STARTED", cdnPurgeOutcome: "QUEUED",
    browserRevalidationOutcome: "BOUNDED_BY_CACHE_POLICY", remoteCopyLimitation: LIMITATION,
  };
}
