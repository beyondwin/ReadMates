import { expect, test, type Route } from "@playwright/test";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";

const GENERATED_AT = "2026-08-04T10:00:00Z";

function platformAdminAuth(): AuthMeResponse {
  return {
    authenticated: true,
    userId: "platform-owner",
    membershipId: null,
    clubId: null,
    email: "owner@example.test",
    displayName: "OWNER admin",
    accountName: "OWNER admin",
    role: null,
    membershipStatus: null,
    approvalState: "INACTIVE",
    currentMembership: null,
    joinedClubs: [],
    platformAdmin: { userId: "platform-owner", email: "owner@example.test", role: "OWNER" },
    recommendedAppEntryUrl: "/admin",
  };
}

async function json(route: Route, status: number, body: unknown): Promise<void> {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

test("owner sees a safe closing-risk case and follows its host board link", async ({ page }) => {
  const source = {
    sourceType: "CLOSING_RISK",
    status: "AVAILABLE",
    generatedAt: GENERATED_AT,
    lastSuccessfulAt: GENERATED_AT,
    authoritative: true,
  } as const;
  const item = {
    id: "case-closing-risk",
    sourceType: "CLOSING_RISK",
    clubId: "club-reading-room",
    state: "OPEN",
    severity: "WARNING",
    summaryCode: "SESSION_CLOSING_BLOCKED",
    firstObservedAt: "2026-08-01T10:00:00Z",
    lastObservedAt: GENERATED_AT,
    snoozedUntil: null,
    resolvedAt: null,
    assignedToMe: true,
    reopenCount: 0,
    version: 2,
    impactCount: 1,
    detailHref: "/clubs/reading-room/app/host/sessions/session-closing/closing",
    allowedActions: ["ACKNOWLEDGE", "SNOOZE", "RESOLVE"],
    source,
  };

  await page.route("**/api/bff/api/auth/me**", (route) => json(route, 200, platformAdminAuth()));
  await page.route("**/api/bff/api/admin/summary", (route) => json(route, 200, {
    platformRole: "OWNER",
    activeClubCount: 1,
    domainActionRequiredCount: 0,
    domains: [],
    domainsRequiringAction: [],
  }));
  await page.route("**/api/bff/api/admin/clubs", (route) => json(route, 200, { items: [] }));
  await page.route("**/api/bff/api/admin/operations/cases**", (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.endsWith("/cases/case-closing-risk")) {
      return json(route, 200, {
        schema: "admin.operation_cases.v1",
        item,
        history: [{
          fromState: null,
          toState: "OPEN",
          action: null,
          reasonCode: "SIGNAL_OPENED",
          occurredAt: "2026-08-01T10:00:00Z",
          caseVersion: 1,
        }],
      });
    }
    return json(route, 200, {
      schema: "admin.operation_cases.v1",
      generatedAt: GENERATED_AT,
      counts: { open: 1, critical: 0, assignedToMe: 1, snoozed: 0 },
      sources: [source],
      items: [item],
      nextCursor: null,
    });
  });

  await page.goto("/admin/today?case=case-closing-risk");

  await expect(page.getByRole("button", { name: /회차 마감이 완료되지 않았습니다/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "마감 운영에서 확인" })).toHaveAttribute(
    "href",
    "/clubs/reading-room/app/host/sessions/session-closing/closing",
  );
  await expect(page.getByText("UNKNOWN_PRIVATE_BLOCKER_CODE")).toHaveCount(0);
});
