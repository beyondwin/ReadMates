import { expect, test, type Page, type Route } from "@playwright/test";
import { routeEmptyAdminOperations } from "./admin-operations-e2e-fixtures";

const CLUB_ID = "10000000-0000-4000-8000-000000000001";
const SESSION_ID = "20000000-0000-4000-8000-000000000002";
const PUBLICATION_ID = "30000000-0000-4000-8000-000000000003";
const PREVIEW_ID = "40000000-0000-4000-8000-000000000004";
const RECEIPT_ID = "50000000-0000-4000-8000-000000000005";
const CONVERGENCE_ID = "60000000-0000-4000-8000-000000000006";

async function json(route: Route, status: number, body: unknown) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function routeAdminShell(page: Page, role: "OWNER" | "SUPPORT") {
  await routeEmptyAdminOperations(page);
  await page.route("**/api/bff/api/auth/me**", (route) => json(route, 200, {
    authenticated: true,
    userId: "synthetic-admin",
    membershipId: null,
    clubId: null,
    email: "synthetic-admin@example.test",
    displayName: "Synthetic admin",
    accountName: "Synthetic admin",
    role: null,
    membershipStatus: null,
    approvalState: "INACTIVE",
    currentMembership: null,
    joinedClubs: [],
    platformAdmin: { userId: "synthetic-admin", email: "synthetic-admin@example.test", role },
    recommendedAppEntryUrl: "/admin",
  }));
  await page.route("**/api/bff/api/admin/summary", (route) => json(route, 200, {
    platformRole: role,
    activeClubCount: 0,
    domainActionRequiredCount: 0,
    domains: [],
    domainsRequiringAction: [],
  }));
  await page.route("**/api/bff/api/admin/capabilities", (route) => json(route, 200, {
    schemaVersion: 1,
    role,
    status: "ACTIVE",
    capabilities: role === "OWNER"
      ? ["VIEW_TODAY", "VIEW_CLUBS", "EMERGENCY_PUBLIC_TAKEDOWN"]
      : ["VIEW_TODAY", "VIEW_CLUBS"],
    generatedAt: "2026-08-26T04:00:00Z",
  }));
  await page.route("**/api/bff/api/admin/clubs", (route) => json(route, 200, { items: [] }));
}

test("owner confirms one exact target, response loss reconciles, and reload preserves the immutable receipt", async ({ page }) => {
  await routeAdminShell(page, "OWNER");
  let confirmCalls = 0;
  const idempotencyKeys: string[] = [];

  await page.route("**/api/bff/api/admin/public-takedowns/preview", (route) => json(route, 200, {
    schema: "admin.public_takedown.preview.v1",
    previewId: PREVIEW_ID,
    expiresAt: "2026-08-26T04:05:00Z",
    clubId: CLUB_ID,
    sessionId: SESSION_ID,
    publicationId: PUBLICATION_ID,
    targetGeneration: 17,
    currentSurfaces: ["PUBLIC_CLUB", "PUBLIC_SESSION"],
    limitationCode: "STORED_OR_OFFLINE_COPY_MAY_REMAIN",
  }));
  await page.route("**/api/bff/api/admin/public-takedowns/confirm", async (route) => {
    confirmCalls += 1;
    const request = route.request().postDataJSON() as { idempotencyKey: string };
    idempotencyKeys.push(request.idempotencyKey);
    if (confirmCalls === 1) {
      await route.abort("failed");
      return;
    }
    await json(route, 200, receipt());
  });
  await page.route(`**/api/bff/api/admin/public-takedowns/${RECEIPT_ID}/convergence`, (route) => json(route, 200, {
    schema: "admin.public_takedown.convergence.v1",
    convergenceId: CONVERGENCE_ID,
    originResult: "DENIED",
    committedGeneration: 18,
    status: "PENDING",
    lastAttemptAt: "2026-08-26T04:01:01Z",
    retryable: false,
    attempts: [{ attemptNo: 1, status: "PENDING", observedAt: "2026-08-26T04:01:01Z", resultCategory: null }],
  }));

  await page.goto("/admin/public-takedown");
  await page.getByLabel("클럽 ID").fill(CLUB_ID);
  await page.getByLabel("모임 ID").fill(SESSION_ID);
  await page.getByLabel("공개 기록 ID").fill(PUBLICATION_ID);
  await page.getByRole("button", { name: "대상 확인" }).click();
  await expect(page.getByText("PUBLIC_SESSION")).toBeVisible();
  await expect(page.getByText(/저장하거나 오프라인으로 보관한 사본/)).toBeVisible();
  await page.getByLabel("회수 사유").fill("synthetic privacy request");
  await page.getByRole("button", { name: "긴급 회수 확인" }).click();

  await expect(page.getByRole("region", { name: "변경 불가 회수 영수증" })).toContainText(RECEIPT_ID);
  expect(confirmCalls).toBe(2);
  expect(new Set(idempotencyKeys).size).toBe(1);
  await expect(page.getByRole("region", { name: "전파 수렴 타임라인" })).toContainText("시도 1");

  await page.getByRole("link", { name: "클럽", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/clubs$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/admin\/public-takedown$/);
  await expect(page.getByRole("region", { name: "변경 불가 회수 영수증" })).toContainText(RECEIPT_ID);
  await page.reload();
  await expect(page.getByRole("region", { name: "변경 불가 회수 영수증" })).toContainText(RECEIPT_ID);
  expect(confirmCalls).toBe(2);
});

test("SUPPORT is capability denied and cannot submit a takedown", async ({ page }) => {
  await routeAdminShell(page, "SUPPORT");
  let mutationCalls = 0;
  await page.route("**/api/bff/api/admin/public-takedowns/**", async (route) => {
    mutationCalls += 1;
    await json(route, 403, { code: "PERMISSION_DENIED", message: "denied", status: 403 });
  });

  await page.goto("/admin/public-takedown");
  await expect(page.getByText("긴급 회수 권한이 없습니다.")).toBeVisible();
  await expect(page.getByRole("link", { name: "긴급 공개 회수" })).toHaveCount(0);
  await expect(page.getByLabel("클럽 ID")).toHaveCount(0);
  expect(mutationCalls).toBe(0);
});

function receipt() {
  return {
    schema: "admin.public_takedown.receipt.v1",
    receiptId: RECEIPT_ID,
    convergenceId: CONVERGENCE_ID,
    clubId: CLUB_ID,
    sessionId: SESSION_ID,
    publicationId: PUBLICATION_ID,
    originResult: "DENIED",
    committedGeneration: 18,
    committedClubGeneration: 9,
    reasonCategory: "PRIVACY",
    createdAt: "2026-08-26T04:01:00Z",
    limitationCode: "STORED_OR_OFFLINE_COPY_MAY_REMAIN",
  };
}
