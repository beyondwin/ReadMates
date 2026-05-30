import { expect, test, type Page, type Route } from "@playwright/test";
import type { PlatformAdminRole } from "@/features/platform-admin/api/platform-admin-contracts";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";

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
}

async function routeAudit(page: Page): Promise<void> {
  await page.route("**/api/bff/api/admin/audit/events**", async (route) => {
    await json(route, 200, {
      generatedAt: "2026-05-31T00:00:00Z",
      filters: { range: "7d" },
      summary: { visibleCount: 1, sourceUnavailableCount: 0, metadataUnavailableCount: 0, unavailableSources: [] },
      nextCursor: null,
      items: [
        {
          id: "platform_audit_events:event-ai",
          occurredAt: "2026-05-31T00:01:00Z",
          sourceSlice: "S6",
          sourceTable: "platform_audit_events",
          actionCategory: "AI_OPS",
          actionType: "ADMIN_AI_OPS_RETRY_COMMIT",
          outcome: "SUCCESS",
          actor: { userId: "platform-owner-user", role: "OWNER", displayLabel: "OWNER" },
          target: { clubId: "club-1", userId: null, jobId: "job-1", eventId: null, label: "AI job" },
          summary: "AI 커밋 재시도를 실행했습니다.",
          safeMetadata: [{ label: "previousStatus", value: "COMMITTING", kind: "code" }],
          metadataState: "AVAILABLE",
        },
      ],
    });
  });
}

function aiJob(clubId: string) {
  return {
    jobId: "job-1",
    club: { clubId, slug: "club-one", name: "Club One" },
    session: { sessionId: "session-1", number: 7, bookTitle: "Book" },
    status: "SUCCEEDED",
    stage: "READY",
    provider: "OPENAI",
    model: "gpt-model",
    errorCode: null,
    safeErrorMessage: null,
    costEstimateUsd: "0.1000",
    createdAt: "2026-05-31T00:00:00Z",
    lastUpdatedAt: "2026-05-31T00:01:00Z",
    expiresAt: null,
    staleCandidate: false,
    availableActions: [],
  };
}

async function routeAiOps(page: Page, opts: { matchClubId: string }): Promise<void> {
  await page.route("**/api/bff/api/admin/ai-generation/summary**", async (route) => {
    await json(route, 200, {
      activeJobCount: 0,
      failedLast24h: 0,
      monthToDateCostEstimateUsd: "0.1000",
      failureCodes: [],
      providerCosts: [],
      staleCandidateCount: 0,
      costTrend: {
        window: "30d",
        currentCostUsd: "0.1000",
        priorCostUsd: "0.0000",
        currentJobCount: 1,
        priorJobCount: 0,
        deltaDirection: "NONE",
        availability: "NOT_ENOUGH_DATA",
      },
    });
  });
  await page.route("**/api/bff/api/admin/ai-generation/jobs**", async (route) => {
    const url = new URL(route.request().url());
    const clubId = url.searchParams.get("clubId");
    const items = clubId === opts.matchClubId ? [aiJob(opts.matchClubId)] : [];
    await json(route, 200, { items, nextCursor: null });
  });
}

test("owner drills from an AI_OPS audit row into the affected club's ai-ops jobs", async ({ page }) => {
  await routeShell(page, "OWNER");
  await routeAudit(page);
  await routeAiOps(page, { matchClubId: "club-1" });

  await page.goto("/admin/audit");

  await page.getByRole("button", { name: /AI 커밋 재시도를 실행했습니다/ }).click();

  const detail = page.getByRole("region", { name: "감사 이벤트 상세" });
  await detail.getByRole("link", { name: /AI Ops에서 보기/ }).click();

  await expect(page).toHaveURL(/\/admin\/ai-ops\?clubId=club-1/);
  await expect(page.getByRole("heading", { name: "AI Ops", level: 1 })).toBeVisible();
  await expect(page.getByText("Club One")).toBeVisible();
  await expect(page.getByRole("button", { name: "전체 보기" })).toBeVisible();

  await page.getByRole("button", { name: "전체 보기" }).click();
  await expect(page).not.toHaveURL(/clubId=/);

  await expect(page.getByText("@example.com")).toHaveCount(0);
  await expect(page.getByText("{\"")).toHaveCount(0);
});

test("ai-ops drilldown shows an honest empty state when the club has no jobs", async ({ page }) => {
  await routeShell(page, "OWNER");
  await routeAudit(page);
  await routeAiOps(page, { matchClubId: "club-other" });

  await page.goto("/admin/audit");
  await page.getByRole("button", { name: /AI 커밋 재시도를 실행했습니다/ }).click();
  await page.getByRole("region", { name: "감사 이벤트 상세" }).getByRole("link", { name: /AI Ops에서 보기/ }).click();

  await expect(page).toHaveURL(/\/admin\/ai-ops\?clubId=club-1/);
  await expect(page.getByText("이 필터에 해당하는 AI job이 없습니다.")).toBeVisible();
  await expect(page.getByRole("button", { name: "전체 보기" })).toBeVisible();
});
