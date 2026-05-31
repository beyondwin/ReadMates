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
}

async function routeNotifications(page: Page): Promise<void> {
  await page.route("**/api/bff/api/admin/notifications/snapshot", async (route) => {
    await json(route, 200, {
      generatedAt: "2026-05-27T00:00:00Z",
      outboxSummary: { pending: 3, active: 0, failed: 1, dead: 1, sentOrPublishedLast24h: 7 },
      deliverySummary: { pending: 1, active: 0, failed: 1, dead: 1, sentOrPublishedLast24h: 6 },
      relaySummary: { publishing: 0, sending: 0, stalePublishing: 1, staleSending: 0 },
      failureClusters: [{ safeErrorCode: "mailbox_unavailable", status: "DEAD", count: 2, latestAt: "2026-05-27T00:00:00Z" }],
      clubHealth: [],
      recentManualDispatches: [],
    });
  });
  await page.route("**/api/bff/api/admin/notifications/events**", async (route) => {
    await json(route, 200, {
      items: [
        {
          eventId: "event-1",
          club: { clubId: "club-1", slug: "reading-sai", name: "읽는사이" },
          eventType: "SESSION_REMINDER_DUE",
          source: "AUTOMATIC",
          status: "FAILED",
          attemptCount: 2,
          nextAttemptAt: null,
          createdAt: "2026-05-27T00:00:00Z",
          updatedAt: "2026-05-27T00:01:00Z",
          safeErrorCode: "mailbox_unavailable",
          manualDispatch: null,
        },
      ],
      nextCursor: null,
    });
  });
  await page.route("**/api/bff/api/admin/notifications/deliveries**", async (route) => {
    await json(route, 200, {
      items: [
        {
          deliveryId: "delivery-1",
          eventId: "event-1",
          club: { clubId: "club-1", slug: "reading-sai", name: "읽는사이" },
          channel: "EMAIL",
          status: "DEAD",
          maskedRecipient: "m***@example.com",
          attemptCount: 2,
          createdAt: "2026-05-27T00:00:00Z",
          updatedAt: "2026-05-27T00:01:00Z",
          safeErrorCode: "mailbox_unavailable",
        },
      ],
      nextCursor: null,
    });
  });
  await page.route("**/api/bff/api/admin/notifications/replay-preview", async (route) => {
    await json(route, 200, {
      previewId: "preview-1",
      selectionHash: "a".repeat(64),
      matchedCount: 2,
      excludedCount: 0,
      estimatedByStatus: { DEAD: 2 },
      warnings: [],
      expiresAt: "2026-05-27T00:10:00Z",
    });
  });
  await page.route("**/api/bff/api/admin/notifications/replay-confirm", async (route) => {
    await json(route, 200, {
      replayedCount: 2,
      skippedCount: 0,
      selectionHash: "a".repeat(64),
    });
  });
}

test("owner operates admin notification ledgers and replay", async ({ page }) => {
  await routePlatformAdminShell(page, "OWNER");
  await routeNotifications(page);

  await page.goto("/admin/notifications?focus=outbox_backlog");

  await expect(page.getByRole("heading", { name: "알림 / Outbox 운영" })).toBeVisible();
  await expect(page.getByText(/Health outbox backlog/)).toBeVisible();
  await expect(page.getByText("Outbox pending")).toBeVisible();
  await expect(page.getByText(/SESSION_REMINDER_DUE/)).toBeVisible();
  await expect(page.getByText(/m\*\*\*@example.com/)).toBeVisible();
  await expect(page.getByText("member1@example.com")).toHaveCount(0);

  await expect(page.getByRole("button", { name: "재처리 확정" })).toBeDisabled();
  await page.getByRole("button", { name: "대상 확인" }).click();
  await expect(page.getByText(/대상 2건/)).toBeVisible();
  await expect(page.getByRole("button", { name: "재처리 확정" })).toBeDisabled();
  await page.getByLabel("처리 사유").fill("provider recovered");
  await expect(page.getByRole("button", { name: "재처리 확정" })).toBeEnabled();
  await page.getByRole("button", { name: "재처리 확정" }).click();
  await expect(page.getByText("2건 재처리를 기록했습니다.")).toBeVisible();
});
