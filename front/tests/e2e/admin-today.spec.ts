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

async function routePlatformAdminToday(page: Page, role: PlatformAdminRole): Promise<void> {
  const actionRequiredDomain = {
    id: "domain-1",
    clubId: "club-domain",
    hostname: "domain.example.test",
    kind: "CUSTOM_DOMAIN",
    status: "ACTION_REQUIRED",
    desiredState: "ENABLED",
    manualAction: "CLOUDFLARE_PAGES_CUSTOM_DOMAIN",
    errorCode: null,
    isPrimary: true,
    verifiedAt: null,
    lastCheckedAt: null,
  };

  await page.route("**/api/bff/api/auth/me**", async (route) => {
    await json(route, 200, platformAdminAuth(role));
  });

  await page.route("**/api/bff/api/admin/summary", async (route) => {
    await json(route, 200, {
      platformRole: role,
      activeClubCount: 3,
      domainActionRequiredCount: 1,
      domains: [actionRequiredDomain],
      domainsRequiringAction: [actionRequiredDomain],
    });
  });

  await page.route("**/api/bff/api/admin/clubs", async (route) => {
    await json(route, 200, {
      items: [
        {
          clubId: "club-ready",
          slug: "ready-club",
          name: "Ready Club",
          tagline: "읽는 힘",
          about: "함께 읽는 공간",
          status: "ACTIVE",
          publicVisibility: "PRIVATE",
          domainCount: 0,
          domainActionRequiredCount: 0,
          firstHostOnboardingState: "ASSIGNED",
        },
        {
          clubId: "club-domain",
          slug: "domain-club",
          name: "Domain Club",
          tagline: "도메인 확인",
          about: "공개 소개",
          status: "ACTIVE",
          publicVisibility: "PRIVATE",
          domainCount: 1,
          domainActionRequiredCount: 1,
          firstHostOnboardingState: "ASSIGNED",
        },
        {
          clubId: "club-setup",
          slug: "setup-club",
          name: "Setup Club",
          tagline: "",
          about: "",
          status: "SETUP_REQUIRED",
          publicVisibility: "PRIVATE",
          domainCount: 0,
          domainActionRequiredCount: 0,
          firstHostOnboardingState: "MISSING",
        },
      ],
    });
  });

  await page.route("**/api/bff/api/admin/notifications/snapshot", async (route) => {
    await json(route, 200, {
      generatedAt: "2026-05-27T00:00:00Z",
      outboxSummary: { pending: 0, active: 0, failed: 1, dead: 0, sentOrPublishedLast24h: 3 },
      deliverySummary: { pending: 0, active: 0, failed: 0, dead: 0, sentOrPublishedLast24h: 3 },
      relaySummary: { publishing: 0, sending: 0, stalePublishing: 0, staleSending: 0 },
      failureClusters: [],
      clubHealth: [
        {
          clubId: "club-ready",
          slug: "ready-club",
          name: "Ready Club",
          pending: 0,
          failed: 1,
          dead: 0,
          lastSuccessAt: null,
        },
      ],
      recentManualDispatches: [],
    });
  });

  await page.route("**/api/bff/api/admin/ai-generation/summary", async (route) => {
    await json(route, 200, {
      activeJobCount: 0,
      failedLast24h: 1,
      monthToDateCostEstimateUsd: "0.1200",
      failureCodes: [{ errorCode: "MODEL_TIMEOUT", count: 1 }],
      providerCosts: [{ provider: "OPENAI", model: "gpt-model", costEstimateUsd: "0.1200" }],
      staleCandidateCount: 0,
    });
  });

  await page.route("**/api/bff/api/admin/ai-generation/jobs**", async (route) => {
    await json(route, 200, {
      items: [
        {
          jobId: "job-failed",
          club: { clubId: "club-ready", slug: "ready-club", name: "Ready Club" },
          session: { sessionId: "session-1", number: 7, bookTitle: "Mock Session" },
          status: "FAILED",
          stage: "FAILED",
          provider: "OPENAI",
          model: "gpt-model",
          errorCode: "MODEL_TIMEOUT",
          safeErrorMessage: null,
          costEstimateUsd: "0.1200",
          createdAt: "2026-05-27T00:00:00Z",
          lastUpdatedAt: "2026-05-27T00:01:00Z",
          expiresAt: "2026-05-27T06:00:00Z",
          staleCandidate: false,
          availableActions: [],
        },
      ],
      nextCursor: null,
    });
  });
}

test("owner sees the admin today operations ledger inside the admin shell", async ({ page }) => {
  await routePlatformAdminToday(page, "OWNER");

  await page.goto("/admin/today");

  await expect(page.getByRole("heading", { name: "오늘 할 일" })).toBeVisible();
  await expect(page.getByRole("region", { name: "운영 작업 큐" })).toBeVisible();
  await expect(page.getByRole("region", { name: "선택 항목 브리프" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Setup Club/ })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: /Domain Club/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /알림 실패 1건/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /AI 실패/ })).toBeVisible();
  await expect(page.getByText("페이지를 불러오지 못했습니다.")).toHaveCount(0);

  await page.getByRole("button", { name: /Ready Club[\s\S]*공개 전환/ }).click();

  await expect(page).toHaveURL(/selected=club-club-ready/);
  const brief = page.getByRole("region", { name: "선택 항목 브리프" });
  await expect(brief.getByRole("heading", { name: "Ready Club" })).toBeVisible();
  await expect(brief.getByRole("button", { name: "공개 전환" })).toBeEnabled();
});

test("support can read the ledger but cannot execute mutation actions", async ({ page }) => {
  await routePlatformAdminToday(page, "SUPPORT");

  await page.goto("/admin/today");
  await page.getByRole("button", { name: /Ready Club[\s\S]*공개 전환/ }).click();

  const brief = page.getByRole("region", { name: "선택 항목 브리프" });
  await expect(brief.getByRole("heading", { name: "Ready Club" })).toBeVisible();
  await expect(brief.getByRole("button", { name: "공개 전환" })).toBeDisabled();
  await expect(brief.getByText("현재 역할은 변경 작업을 실행할 수 없습니다.")).toBeVisible();
  await expect(page.getByText("페이지를 불러오지 못했습니다.")).toHaveCount(0);
});
