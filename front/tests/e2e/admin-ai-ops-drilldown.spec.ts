import { expect, test, type Page, type Route } from "@playwright/test";
import type { PlatformAdminRole } from "@/features/platform-admin/api/platform-admin-contracts";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";
import { routeEmptyAdminOperations } from "./admin-operations-e2e-fixtures";

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

async function routeShell(page: Page, role: PlatformAdminRole): Promise<void> {
  await routeEmptyAdminOperations(page);
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
  await page.route("**/api/bff/api/admin/capabilities", async (route) => {
    await json(route, 200, {
      schemaVersion: 1,
      role,
      status: "ACTIVE",
      capabilities: ["VIEW_TODAY", "VIEW_AI_OPERATIONS", "MANAGE_AI_OPERATIONS"],
      generatedAt: "2026-08-25T00:00:00Z",
    });
  });
  await page.route("**/api/bff/api/admin/clubs", async (route) => {
    await json(route, 200, { items: [] });
  });
}

function job(overrides: Record<string, unknown>) {
  return {
    jobId: "job-1",
    club: { clubId: "club-1", slug: "club-one", name: "Club One" },
    session: { sessionId: "session-1", number: 7, bookTitle: "Book" },
    status: "FAILED",
    stage: null,
    provider: "OPENAI",
    model: "gpt-model",
    errorCode: "PROVIDER_RATE_LIMITED",
    safeErrorMessage: "rate limited",
    costEstimateUsd: "0.1000",
    createdAt: "2026-05-30T00:00:00Z",
    lastUpdatedAt: "2026-05-30T00:01:00Z",
    expiresAt: null,
    staleCandidate: false,
    availableActions: [],
    ...overrides,
  };
}

async function routeAiOps(page: Page): Promise<void> {
  await page.route("**/api/bff/api/admin/ai-generation/summary**", async (route) => {
    await json(route, 200, {
      activeJobCount: 0,
      failedLast24h: 2,
      monthToDateCostEstimateUsd: "0.2000",
      failureCodes: [{ code: "PROVIDER_RATE_LIMITED", count: 2 }],
      providerCosts: [],
      staleCandidateCount: 0,
      costTrend: {
        window: "30d",
        currentCostUsd: "0.2000",
        priorCostUsd: "0.1000",
        currentJobCount: 2,
        priorJobCount: 1,
        deltaDirection: "UP",
        availability: "AVAILABLE",
      },
    });
  });
  await page.route("**/api/bff/api/admin/ai-generation/jobs**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/jobs/job-1")) {
      await json(route, 200, job({ revision: 4 }));
      return;
    }
    const errorCode = url.searchParams.get("errorCode");
    const items = errorCode === "PROVIDER_RATE_LIMITED" ? [job({})] : [];
    await json(route, 200, { items, nextCursor: null });
  });
}

test("owner drills from a failure code into the affected jobs", async ({ page }) => {
  await routeShell(page, "OWNER");
  await routeAiOps(page);

  await page.goto("/admin/ai-ops");

  await expect(page.getByRole("heading", { name: "AI 작업", level: 1 })).toBeVisible();
  await expect(page.getByText("표시할 AI job이 없습니다.")).toBeVisible();

  await page.getByRole("button", { name: /PROVIDER_RATE_LIMITED/ }).click();

  await expect(page).toHaveURL(/errorCode=PROVIDER_RATE_LIMITED/);
  await expect(page.getByText("Club One")).toBeVisible();
  await expect(page.getByRole("button", { name: "전체 보기" })).toBeVisible();

  await page.getByRole("button", { name: "상세 보기" }).click();
  await expect(page).toHaveURL(/jobId=job-1/);
  await expect(page.getByRole("dialog", { name: "AI 작업 상세" })).toContainText("revision 4");
  await page.getByRole("button", { name: "닫기" }).click();
  await expect(page).not.toHaveURL(/jobId=/);

  await page.getByRole("button", { name: "전체 보기" }).click();
  await expect(page).not.toHaveURL(/errorCode=/);

  await expect(page.getByText("@example.com")).toHaveCount(0);
  await expect(page.getByText("{\"")).toHaveCount(0);
});
