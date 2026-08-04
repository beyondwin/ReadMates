import { expect, test, type Page, type Route } from "@playwright/test";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";
import type { PlatformAdminRole } from "@/features/platform-admin/api/platform-admin-contracts";

const GENERATED_AT = "2026-08-04T10:00:00Z";

function platformAdminAuth(role: PlatformAdminRole): AuthMeResponse {
  const account = role.toLowerCase();
  return {
    authenticated: true,
    userId: `platform-${account}`,
    membershipId: null,
    clubId: null,
    email: `${account}@example.test`,
    displayName: `${role} admin`,
    accountName: `${role} admin`,
    role: null,
    membershipStatus: null,
    approvalState: "INACTIVE",
    currentMembership: null,
    joinedClubs: [],
    platformAdmin: {
      userId: `platform-${account}`,
      email: `${account}@example.test`,
      role,
    },
    recommendedAppEntryUrl: "/admin",
  };
}

async function json(route: Route, status: number, body: unknown): Promise<void> {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function routePlatformAdminToday(page: Page, role: PlatformAdminRole): Promise<void> {
  const source = {
    sourceType: "NOTIFICATION",
    status: "AVAILABLE",
    generatedAt: GENERATED_AT,
    lastSuccessfulAt: GENERATED_AT,
    authoritative: true,
  } as const;
  const item = {
    id: "case-notification",
    sourceType: "NOTIFICATION",
    clubId: null,
    state: "OPEN",
    severity: "CRITICAL",
    summaryCode: "NOTIFICATION_DELIVERY_FAILURE",
    firstObservedAt: "2026-08-04T08:00:00Z",
    lastObservedAt: GENERATED_AT,
    snoozedUntil: null,
    resolvedAt: null,
    assignedToMe: true,
    reopenCount: 0,
    version: 3,
    impactCount: 2,
    detailHref: "/admin/notifications",
    allowedActions: role === "SUPPORT" ? [] : ["ACKNOWLEDGE", "SNOOZE", "RESOLVE"],
    source,
  };

  await page.route("**/api/bff/api/auth/me**", (route) => json(route, 200, platformAdminAuth(role)));
  await page.route("**/api/bff/api/admin/summary", (route) => json(route, 200, {
    platformRole: role,
    activeClubCount: 2,
    domainActionRequiredCount: 0,
    domains: [],
    domainsRequiringAction: [],
  }));
  await page.route("**/api/bff/api/admin/clubs", (route) => json(route, 200, { items: [] }));
  await page.route("**/api/bff/api/admin/operations/cases**", (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.endsWith("/cases/case-notification")) {
      return json(route, 200, {
        schema: "admin.operation_cases.v1",
        item,
        history: [{
          fromState: null,
          toState: "OPEN",
          action: null,
          reasonCode: "SIGNAL_OPENED",
          occurredAt: "2026-08-04T08:00:00Z",
          caseVersion: 1,
        }],
      });
    }
    return json(route, 200, {
      schema: "admin.operation_cases.v1",
      generatedAt: GENERATED_AT,
      counts: { open: 1, critical: 1, assignedToMe: 1, snoozed: 0 },
      sources: [source],
      items: [item],
      nextCursor: null,
    });
  });
}

test("owner sees the durable operations queue inside the admin shell", async ({ page }) => {
  await routePlatformAdminToday(page, "OWNER");

  await page.goto("/admin/today?case=case-notification");

  await expect(page.getByRole("heading", { name: "오늘의 운영 케이스" })).toBeVisible();
  await expect(page.getByRole("region", { name: "운영 케이스 큐" })).toBeVisible();
  await expect(page.getByRole("region", { name: "운영 케이스 상세" })).toBeVisible();
  await expect(page.getByRole("button", { name: /알림 전달 실패가 반복되고 있습니다/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("button", { name: "확인 처리" })).toBeEnabled();
  await expect(page.getByRole("link", { name: "알림 운영에서 확인" })).toHaveAttribute(
    "href",
    "/admin/notifications",
  );
  await expect(page.getByText("페이지를 불러오지 못했습니다.")).toHaveCount(0);
});

test("support can inspect a case without lifecycle controls", async ({ page }) => {
  await routePlatformAdminToday(page, "SUPPORT");

  await page.goto("/admin/today?case=case-notification");

  await expect(page.getByRole("region", { name: "운영 케이스 상세" })).toBeVisible();
  await expect(page.getByText("현재 역할은 상태 변경 없이 운영 근거만 확인할 수 있습니다.")).toBeVisible();
  await expect(page.getByRole("button", { name: "확인 처리" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "해결 확인" })).toHaveCount(0);
});
