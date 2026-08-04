import type { Page, Route } from "@playwright/test";

const GENERATED_AT = "2026-08-04T00:00:00Z";

async function fulfillEmptyOperations(route: Route): Promise<void> {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      schema: "admin.operation_cases.v1",
      generatedAt: GENERATED_AT,
      counts: { open: 0, critical: 0, assignedToMe: 0, snoozed: 0 },
      sources: ["CLUB_READINESS", "NOTIFICATION", "AI_JOB", "CLOSING_RISK"].map((sourceType) => ({
        sourceType,
        status: "AVAILABLE",
        generatedAt: GENERATED_AT,
        lastSuccessfulAt: GENERATED_AT,
        authoritative: true,
      })),
      items: [],
      nextCursor: null,
    }),
  });
}

export async function routeEmptyAdminOperations(page: Page): Promise<void> {
  await page.route("**/api/bff/api/admin/operations/cases**", fulfillEmptyOperations);
}
