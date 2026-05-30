import { expect, test, type Page, type Route } from "@playwright/test";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";
import type { PlatformAdminRole } from "@/features/platform-admin/api/platform-admin-contracts";

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
    platformAdmin: {
      userId: `platform-${role.toLowerCase()}-user`,
      email,
      role,
    },
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

  await page.route("**/api/bff/api/admin/ai-generation/summary**", async (route) => {
    const requestedWindow = new URL(route.request().url()).searchParams.get("window");
    const costTrend =
      requestedWindow === "7d"
        ? {
            window: "7d",
            currentCostUsd: "0.0000",
            priorCostUsd: "0.0000",
            currentJobCount: 0,
            priorJobCount: 0,
            deltaDirection: "NONE",
            availability: "NOT_ENOUGH_DATA",
          }
        : {
            window: "30d",
            currentCostUsd: "2.0000",
            priorCostUsd: "1.0000",
            currentJobCount: 5,
            priorJobCount: 4,
            deltaDirection: "UP",
            availability: "AVAILABLE",
          };
    await json(route, 200, {
      activeJobCount: 1,
      failedLast24h: 0,
      monthToDateCostEstimateUsd: "0.1200",
      failureCodes: [],
      providerCosts: [{ provider: "OPENAI", model: "gpt-model", costEstimateUsd: "0.1200" }],
      staleCandidateCount: 1,
      costTrend,
    });
  });

  await page.route("**/api/bff/api/admin/ai-generation/jobs", async (route) => {
    await json(route, 200, {
      items: [
        {
          jobId: "job-1",
          club: { clubId: "club-1", slug: "reading-sai", name: "읽는사이" },
          session: { sessionId: "session-1", number: 7, bookTitle: "Book" },
          status: "RUNNING",
          stage: "GENERATING_SUMMARY",
          provider: "OPENAI",
          model: "gpt-model",
          errorCode: null,
          safeErrorMessage: null,
          costEstimateUsd: "0.1200",
          createdAt: "2026-05-18T00:00:00Z",
          lastUpdatedAt: "2026-05-18T00:01:00Z",
          expiresAt: "2026-05-18T06:00:00Z",
          staleCandidate: true,
          availableActions: ["FORCE_CANCEL"],
        },
      ],
      nextCursor: null,
    });
  });
}

test("platform support can read AI Ops but cannot force cancel", async ({ page }) => {
  await routePlatformAdminShell(page, "SUPPORT");

  await page.goto("/admin/ai-ops");

  await expect(page.getByRole("heading", { name: "AI 운영" })).toBeVisible();
  await expect(page.getByText("Book")).toBeVisible();
  await expect(page.getByRole("button", { name: "Force cancel" })).toHaveCount(0);
});

test("platform owner sees AI Ops action affordance when job is actionable", async ({ page }) => {
  await routePlatformAdminShell(page, "OWNER");

  await page.goto("/admin/ai-ops");

  await expect(page.getByRole("heading", { name: "AI 운영" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Force cancel" })).toBeVisible();
});

test("cost window toggle updates the rendered trend", async ({ page }) => {
  await routePlatformAdminShell(page, "SUPPORT");

  await page.goto("/admin/ai-ops");

  const windowGroup = page.getByRole("group", { name: "cost window" });
  await expect(windowGroup).toBeVisible();

  const trend = page.getByLabel("cost trend");
  await expect(trend.getByText("$2.0000")).toBeVisible();
  await expect(trend.getByLabel("cost trend direction")).toHaveText("▲");

  await windowGroup.getByRole("button", { name: "7d" }).click();

  await expect(page).toHaveURL(/window=7d/);
  await expect(trend.getByText("데이터 부족")).toBeVisible();
});
