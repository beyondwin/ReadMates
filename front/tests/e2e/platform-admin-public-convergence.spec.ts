import { expect, test, type Page, type Route } from "@playwright/test";
import { routeEmptyAdminOperations } from "./admin-operations-e2e-fixtures";
import { expectNoHorizontalOverflow } from "./support/visual-authority-contract";

const IDS = {
  club: "10000000-0000-4000-8000-000000000001",
  session: "20000000-0000-4000-8000-000000000002",
  publication: "30000000-0000-4000-8000-000000000003",
  preview: "40000000-0000-4000-8000-000000000004",
  receipt: "50000000-0000-4000-8000-000000000005",
  convergence: "60000000-0000-4000-8000-000000000006",
} as const;

async function json(route: Route, status: number, body: unknown) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function routeOwnerShell(page: Page) {
  await routeEmptyAdminOperations(page);
  await page.route("**/api/bff/api/auth/me**", (route) => json(route, 200, {
    authenticated: true, userId: "synthetic-owner", membershipId: null, clubId: null,
    email: "owner@example.test", displayName: "Synthetic owner", accountName: "Synthetic owner",
    role: null, membershipStatus: null, approvalState: "INACTIVE", currentMembership: null, joinedClubs: [],
    platformAdmin: { userId: "synthetic-owner", email: "owner@example.test", role: "OWNER" },
    recommendedAppEntryUrl: "/admin",
  }));
  await page.route("**/api/bff/api/admin/summary", (route) => json(route, 200, {
    platformRole: "OWNER", activeClubCount: 0, domainActionRequiredCount: 0, domains: [], domainsRequiringAction: [],
  }));
  await page.route("**/api/bff/api/admin/capabilities", (route) => json(route, 200, {
    schemaVersion: 1,
    role: "OWNER",
    status: "ACTIVE",
    capabilities: ["VIEW_TODAY", "VIEW_CLUBS", "EMERGENCY_PUBLIC_TAKEDOWN"],
    generatedAt: "2026-08-26T04:00:00Z",
  }));
  await page.route("**/api/bff/api/admin/clubs**", (route) => json(route, 200, { items: [] }));
}

test("provider retry appends a higher attempt under one convergence without repeating origin takedown", async ({ page }) => {
  await routeOwnerShell(page);
  let confirmCount = 0;
  let convergence = convergenceView([
    { attemptNo: 1, status: "FAILED", observedAt: "2026-08-26T04:02:00Z", resultCategory: "TEMPORARY_FAILURE" },
  ], "FAILED", true);

  await page.route("**/api/bff/api/admin/public-takedowns/preview", (route) => json(route, 200, {
    schema: "admin.public_takedown.preview.v1", previewId: IDS.preview, expiresAt: "2026-08-26T04:05:00Z",
    clubId: IDS.club, sessionId: IDS.session, publicationId: IDS.publication,
    targetGeneration: 17, currentSurfaces: ["PUBLIC_SESSION"], limitationCode: "STORED_OR_OFFLINE_COPY_MAY_REMAIN",
  }));
  await page.route("**/api/bff/api/admin/public-takedowns/confirm", async (route) => {
    confirmCount += 1;
    await json(route, 200, {
      schema: "admin.public_takedown.receipt.v1", receiptId: IDS.receipt, convergenceId: IDS.convergence,
      clubId: IDS.club, sessionId: IDS.session, publicationId: IDS.publication, originResult: "DENIED",
      committedGeneration: 18, committedClubGeneration: 9, reasonCategory: "SECURITY",
      createdAt: "2026-08-26T04:01:00Z", limitationCode: "STORED_OR_OFFLINE_COPY_MAY_REMAIN",
    });
  });
  await page.route(`**/api/bff/api/admin/public-takedowns/${IDS.receipt}/convergence/retry`, async (route) => {
    convergence = convergenceView([
      ...convergence.attempts,
      { attemptNo: 2, status: "PENDING", observedAt: "2026-08-26T04:03:00Z", resultCategory: null },
    ], "PENDING", false);
    await json(route, 200, convergence);
  });
  await page.route(`**/api/bff/api/admin/public-takedowns/${IDS.receipt}/convergence`, (route) => json(route, 200, convergence));

  await page.goto("/admin/public-takedown");
  await expectNoHorizontalOverflow(page);
  await page.getByLabel("클럽 ID").fill(IDS.club);
  await page.getByLabel("모임 ID").fill(IDS.session);
  await page.getByLabel("공개 기록 ID").fill(IDS.publication);
  await page.getByRole("button", { name: "대상 확인" }).click();
  await page.getByLabel("사유 분류").selectOption("SECURITY");
  await page.getByLabel("회수 사유").fill("synthetic safety operation");
  await page.getByRole("button", { name: "긴급 회수 확인" }).click();
  await expect(page.getByRole("button", { name: "전파 다시 시도" })).toBeVisible();
  await page.getByRole("button", { name: "전파 다시 시도" }).click();

  await expect(page.getByRole("region", { name: "전파 수렴 타임라인" })).toContainText("시도 2");
  await expect(page.getByRole("region", { name: "전파 수렴 타임라인" })).toContainText("PENDING");
  expect(confirmCount).toBe(1);
  expect(convergence.convergenceId).toBe(IDS.convergence);
});

test("fake clock proves activation and browser-edge convergence bounds without real waits or live provider", async ({ page }) => {
  await routeOwnerShell(page);
  let now = 0;
  let emergencyCommitAt: number | null = null;
  let generalChangeAt: number | null = null;
  let bffEvicted = false;
  let providerAttempts = 0;
  const safeEvidence: unknown[] = [];

  await page.route("**/api/bff/__c4-edge/**", async (route) => {
    const url = new URL(route.request().url());
    const action = url.pathname.split("/").at(-1);
    if (action === "advance") now += Number(url.searchParams.get("seconds") ?? 0);
    if (action === "general-change") generalChangeAt = now;
    if (action === "emergency-confirm") {
      if (now < 720) return json(route, 503, { code: "ACTIVATION_NOT_VERIFIED" });
      emergencyCommitAt = now;
      bffEvicted = true;
      providerAttempts += 1;
    }
    if (action === "read") {
      const kind = url.searchParams.get("kind");
      const surface = url.searchParams.get("surface");
      const denied = emergencyCommitAt !== null;
      const emergencyElapsed = denied ? now - emergencyCommitAt : 0;
      const generalElapsed = generalChangeAt === null ? 0 : now - generalChangeAt;
      const status = kind === "general"
        ? (generalChangeAt !== null && generalElapsed >= 120 ? 404 : 200)
        : (surface === "origin" || (surface === "bff" && bffEvicted) || emergencyElapsed >= 60 ? 404 : 200);
      const body = { status, marker: status === 404 ? "DENIED" : "PUBLIC_SYNTHETIC_OLD", now, surface };
      safeEvidence.push(body);
      return json(route, status, body);
    }
    await json(route, 200, { now, activationReady: now >= 720, bffEvicted, providerAttempts });
  });

  await page.goto("/admin/public-takedown");
  const call = (path: string) => page.evaluate(async (value) => {
    const response = await fetch(value);
    return { status: response.status, body: await response.json() };
  }, path);

  expect((await call("/api/bff/__c4-edge/emergency-confirm")).status).toBe(503);
  await call("/api/bff/__c4-edge/advance?seconds=719");
  expect((await call("/api/bff/__c4-edge/emergency-confirm")).status).toBe(503);
  await call("/api/bff/__c4-edge/advance?seconds=1");
  expect((await call("/api/bff/__c4-edge/emergency-confirm")).status).toBe(200);
  expect((await call("/api/bff/__c4-edge/read?kind=emergency&surface=origin")).status).toBe(404);
  expect((await call("/api/bff/__c4-edge/read?kind=emergency&surface=bff")).status).toBe(404);
  expect(providerAttempts).toBe(1);
  await call("/api/bff/__c4-edge/advance?seconds=60");
  expect((await call("/api/bff/__c4-edge/read?kind=emergency&surface=cdn")).status).toBe(404);
  expect((await call("/api/bff/__c4-edge/read?kind=emergency&surface=browser")).status).toBe(404);

  await call("/api/bff/__c4-edge/general-change");
  await call("/api/bff/__c4-edge/advance?seconds=119");
  expect((await call("/api/bff/__c4-edge/read?kind=general&surface=browser")).status).toBe(200);
  await call("/api/bff/__c4-edge/advance?seconds=1");
  expect((await call("/api/bff/__c4-edge/read?kind=general&surface=browser")).status).toBe(404);

  const serialized = JSON.stringify(safeEvidence);
  expect(serialized).not.toContain("PRIVATE_BODY");
  expect(serialized).not.toContain("provider stack");
  expect(serialized).not.toContain("meeting-passcode");
});

function convergenceView(
  attempts: Array<{ attemptNo: number; status: "PENDING" | "FAILED"; observedAt: string; resultCategory: "TEMPORARY_FAILURE" | null }>,
  status: "PENDING" | "FAILED",
  retryable: boolean,
) {
  return {
    schema: "admin.public_takedown.convergence.v1" as const,
    convergenceId: IDS.convergence,
    originResult: "DENIED" as const,
    committedGeneration: 18,
    status,
    lastAttemptAt: attempts.at(-1)?.observedAt ?? null,
    retryable,
    attempts,
  };
}
