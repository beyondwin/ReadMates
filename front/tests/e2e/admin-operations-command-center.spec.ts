import { expect, test, type Page, type Route } from "@playwright/test";
import type { PlatformAdminRole } from "@/features/platform-admin/api/platform-admin-contracts";
import type {
  AdminOperationCase,
  AdminOperationCaseEvent,
  AdminOperationSourceFreshness,
} from "@/features/platform-admin/api/platform-admin-operations-contracts";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";

const GENERATED_AT = "2026-08-04T10:00:00Z";
const FORBIDDEN_TEXT = [
  "PRIVATE_SENTINEL_TOKEN",
  "ops-owner@example.test",
  "PROVIDER_RAW_FAILURE",
  "raw provider exception",
] as const;

type HarnessOptions = {
  role?: PlatformAdminRole;
  conflictOnce?: boolean;
  unavailableAi?: boolean;
};

type OperationsHarness = {
  get listRequests(): number;
  get detailRequests(): number;
  get mutationRequests(): number;
  get item(): AdminOperationCase;
  get history(): readonly AdminOperationCaseEvent[];
  mutationBodies: Array<{ action: string; body: Record<string, unknown> }>;
};

function platformAdminAuth(role: PlatformAdminRole): AuthMeResponse {
  const account = role.toLowerCase();
  return {
    authenticated: true,
    userId: `platform-${account}`,
    membershipId: null,
    clubId: null,
    email: `ops-${account}@example.test`,
    displayName: `${role} admin`,
    accountName: `${role} admin`,
    role: null,
    membershipStatus: null,
    approvalState: "INACTIVE",
    currentMembership: null,
    joinedClubs: [],
    platformAdmin: {
      userId: `platform-${account}`,
      email: `ops-${account}@example.test`,
      role,
    },
    recommendedAppEntryUrl: "/admin",
  };
}

function source(
  sourceType: AdminOperationSourceFreshness["sourceType"],
  status: AdminOperationSourceFreshness["status"] = "AVAILABLE",
): AdminOperationSourceFreshness {
  return {
    sourceType,
    status,
    generatedAt: GENERATED_AT,
    lastSuccessfulAt: status === "AVAILABLE" ? GENERATED_AT : "2026-08-04T09:30:00Z",
    authoritative: status === "AVAILABLE",
  };
}

function operationCase(
  role: PlatformAdminRole,
  overrides: Partial<AdminOperationCase> = {},
): AdminOperationCase {
  const sourceType = overrides.sourceType ?? "NOTIFICATION";
  return {
    id: "case-notification",
    sourceType,
    clubId: "club-reading-room",
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
    source: source(sourceType),
    ...overrides,
  };
}

async function json(route: Route, status: number, body: unknown): Promise<void> {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function installOperationsHarness(
  page: Page,
  options: HarnessOptions = {},
): Promise<OperationsHarness> {
  const role = options.role ?? "OWNER";
  let conflictPending = options.conflictOnce ?? false;
  let listRequests = 0;
  let detailRequests = 0;
  let mutationRequests = 0;
  let item = operationCase(role);
  const aiSource = source("AI_JOB", options.unavailableAi ? "UNAVAILABLE" : "AVAILABLE");
  const notificationSource = source("NOTIFICATION");
  const history: AdminOperationCaseEvent[] = [{
    fromState: null,
    toState: "OPEN",
    action: null,
    reasonCode: "SIGNAL_OPENED",
    occurredAt: "2026-08-04T08:00:00Z",
    caseVersion: 1,
  }];
  const mutationBodies: Array<{ action: string; body: Record<string, unknown> }> = [];

  await page.route("**/api/bff/api/auth/me**", (route) => json(route, 200, platformAdminAuth(role)));
  await page.route("**/api/bff/api/admin/summary", (route) => json(route, 200, {
    platformRole: role,
    activeClubCount: 2,
    domainActionRequiredCount: 0,
    domains: [],
    domainsRequiringAction: [],
  }));
  await page.route("**/api/bff/api/admin/clubs", (route) => json(route, 200, { items: [] }));

  await page.route("**/api/bff/api/admin/operations/cases**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const parts = url.pathname.split("/").filter(Boolean);
    const casesIndex = parts.lastIndexOf("cases");
    const caseId = parts[casesIndex + 1] ?? null;
    const action = parts[casesIndex + 2] ?? null;

    if (request.method() === "POST" && caseId && action) {
      mutationRequests += 1;
      const body = request.postDataJSON() as Record<string, unknown>;
      mutationBodies.push({ action, body });
      if (role === "SUPPORT") {
        await json(route, 403, { code: "FORBIDDEN", message: "변경 권한이 없습니다.", status: 403 });
        return;
      }
      if (action === "acknowledge" && conflictPending) {
        conflictPending = false;
        item = {
          ...item,
          state: "ACKNOWLEDGED",
          version: item.version + 1,
          allowedActions: ["SNOOZE", "RESOLVE"],
        };
        history.push({
          fromState: "OPEN",
          toState: "ACKNOWLEDGED",
          action: "ACKNOWLEDGE",
          reasonCode: "OPERATOR_ACKNOWLEDGED",
          occurredAt: "2026-08-04T10:01:00Z",
          caseVersion: item.version,
        });
        await json(route, 409, {
          code: "CASE_VERSION_CONFLICT",
          message: "다른 운영자가 먼저 상태를 변경했습니다.",
          status: 409,
        });
        return;
      }

      const previousState = item.state;
      const nextVersion = item.version + 1;
      if (action === "acknowledge") {
        item = { ...item, state: "ACKNOWLEDGED", version: nextVersion, allowedActions: ["SNOOZE", "RESOLVE"] };
        history.push({
          fromState: previousState,
          toState: "ACKNOWLEDGED",
          action: "ACKNOWLEDGE",
          reasonCode: "OPERATOR_ACKNOWLEDGED",
          occurredAt: "2026-08-04T10:01:00Z",
          caseVersion: nextVersion,
        });
      } else if (action === "snooze") {
        item = {
          ...item,
          state: "SNOOZED",
          snoozedUntil: String(body.snoozedUntil),
          version: nextVersion,
          allowedActions: ["ACKNOWLEDGE", "RESOLVE"],
        };
        history.push({
          fromState: previousState,
          toState: "SNOOZED",
          action: "SNOOZE",
          reasonCode: "OPERATOR_SNOOZED",
          occurredAt: "2026-08-04T10:01:00Z",
          caseVersion: nextVersion,
        });
      }

      const core: Partial<AdminOperationCase> = { ...item };
      delete core.allowedActions;
      delete core.source;
      await json(route, 200, { schema: "admin.operation_cases.v1", ...core });
      return;
    }

    if (request.method() === "GET" && caseId) {
      detailRequests += 1;
      await json(route, 200, { schema: "admin.operation_cases.v1", item, history });
      return;
    }

    listRequests += 1;
    await json(route, 200, {
      schema: "admin.operation_cases.v1",
      generatedAt: GENERATED_AT,
      counts: {
        open: item.state === "RESOLVED" ? 0 : 1,
        critical: item.severity === "CRITICAL" ? 1 : 0,
        assignedToMe: item.assignedToMe ? 1 : 0,
        snoozed: item.state === "SNOOZED" ? 1 : 0,
      },
      sources: [notificationSource, aiSource],
      items: [item],
      nextCursor: null,
    });
  });

  return {
    get listRequests() { return listRequests; },
    get detailRequests() { return detailRequests; },
    get mutationRequests() { return mutationRequests; },
    get item() { return item; },
    get history() { return history; },
    mutationBodies,
  };
}

async function openSelectedCase(page: Page, query = "case=case-notification") {
  await page.goto(`/admin/today?${query}`);
  await expect(page.getByRole("heading", { name: "오늘의 운영 케이스" })).toBeVisible();
  await expect(page.getByRole("region", { name: "운영 케이스 상세" })).toBeVisible();
}

async function expectNoUnsafeText(page: Page) {
  const text = await page.locator("body").innerText();
  for (const forbidden of FORBIDDEN_TEXT) expect(text).not.toContain(forbidden);
  expect(text).not.toMatch(/\b[A-Za-z0-9_-]{40,}\b/);
}

test("OWNER deep link acknowledges with optimistic version and records history", async ({ page }) => {
  const harness = await installOperationsHarness(page);
  await openSelectedCase(page);

  await page.getByRole("button", { name: "확인 처리" }).click();

  await expect(page.getByRole("region", { name: "운영 케이스 상세" }).getByText("현재 상태 · 확인됨")).toBeVisible();
  await expect(page.getByText("운영자가 확인함")).toBeVisible();
  expect(harness.mutationBodies).toEqual([{ action: "acknowledge", body: { expectedVersion: 3 } }]);
  expect(harness.item.version).toBe(4);
  expect(harness.history.at(-1)?.caseVersion).toBe(4);
  await expectNoUnsafeText(page);
});

test("OPERATOR snoozes with a preset while preserving selection and filters", async ({ page }) => {
  const harness = await installOperationsHarness(page, { role: "OPERATOR" });
  await openSelectedCase(page, "case=case-notification&state=open&source=notification");

  await page.getByRole("button", { name: "4시간 보류", exact: true }).click();

  await expect(page.getByRole("region", { name: "운영 케이스 상세" }).getByText("현재 상태 · 보류됨")).toBeVisible();
  await expect(page).toHaveURL(/case=case-notification/);
  await expect(page).toHaveURL(/state=open/);
  await expect(page).toHaveURL(/source=notification/);
  expect(harness.mutationBodies).toHaveLength(1);
  expect(harness.mutationBodies[0]?.action).toBe("snooze");
  expect(harness.mutationBodies[0]?.body.expectedVersion).toBe(3);
  expect(String(harness.mutationBodies[0]?.body.snoozedUntil)).toMatch(/^\d{4}-\d{2}-\d{2}T/);
});

test("SUPPORT reads list and detail without controls and direct lifecycle POST is forbidden", async ({ page }) => {
  const harness = await installOperationsHarness(page, { role: "SUPPORT" });
  await openSelectedCase(page);

  await expect(page.getByRole("button", { name: "확인 처리" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "해결 확인" })).toHaveCount(0);
  await expect(page.getByText("현재 역할은 상태 변경 없이 운영 근거만 확인할 수 있습니다.")).toBeVisible();

  const response = await page.evaluate(async () => {
    const direct = await fetch("/api/bff/api/admin/operations/cases/case-notification/acknowledge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expectedVersion: 3 }),
    });
    return { status: direct.status, body: await direct.json() };
  });

  expect(response).toMatchObject({ status: 403, body: { code: "FORBIDDEN", status: 403 } });
  expect(harness.mutationRequests).toBe(1);
});

test("typed version conflict announces refresh and loads the latest detail", async ({ page }) => {
  const harness = await installOperationsHarness(page, { conflictOnce: true });
  await openSelectedCase(page);
  const detailBefore = harness.detailRequests;

  await page.getByRole("button", { name: "확인 처리" }).click();

  await expect(page.getByRole("alert")).toContainText(
    "최신 상태를 다시 불러왔습니다. 내용을 확인한 뒤 다시 시도해 주세요.",
  );
  await expect(page.getByRole("region", { name: "운영 케이스 상세" }).getByText("현재 상태 · 확인됨")).toBeVisible();
  expect(harness.detailRequests).toBe(detailBefore + 1);
  expect(harness.item.version).toBe(4);
});

test("partial source failure leaves available cases usable", async ({ page }) => {
  await installOperationsHarness(page, { unavailableAi: true });
  await openSelectedCase(page);

  await expect(page.getByText("일부 신호 확인 불가").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "AI 작업 다시 확인" })).toBeVisible();
  await expect(page.getByRole("button", { name: "확인 처리" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "알림 다시 확인" })).toHaveCount(0);
});

test("unavailable-source retry performs exactly one list refetch and no lifecycle mutation", async ({ page }) => {
  const harness = await installOperationsHarness(page, { unavailableAi: true });
  await openSelectedCase(page);
  const listsBefore = harness.listRequests;

  await page.getByRole("button", { name: "AI 작업 다시 확인" }).click();
  await expect.poll(() => harness.listRequests).toBe(listsBefore + 1);

  expect(harness.mutationRequests).toBe(0);
  await page.waitForTimeout(250);
  expect(harness.listRequests).toBe(listsBefore + 1);
});

test("mobile presents list then detail then restores the list", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installOperationsHarness(page);
  await page.goto("/admin/today?case=case-notification&source=notification");

  await expect(page.getByRole("region", { name: "운영 케이스 큐" })).toBeVisible();
  await page.getByRole("button", { name: /알림 전달 실패가 반복되고 있습니다/ }).click();
  await expect(page.getByRole("button", { name: "목록으로" })).toBeFocused();
  await expect(page.getByRole("region", { name: "운영 케이스 상세" })).toBeVisible();

  await page.getByRole("button", { name: "목록으로" }).click();
  await expect(page.getByRole("region", { name: "운영 케이스 큐" })).toBeVisible();
  await expect(page).toHaveURL(/case=case-notification/);
  await expect(page).toHaveURL(/source=notification/);
});

test("Escape close backdrop and navigation never confirm resolution", async ({ page }) => {
  const harness = await installOperationsHarness(page);
  await openSelectedCase(page);

  await page.getByRole("button", { name: "해결 확인" }).click();
  await expect(page.getByRole("dialog", { name: "해결 상태 확인" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "해결 상태 확인" })).toHaveCount(0);

  await page.getByRole("button", { name: "해결 확인" }).click();
  await page.getByRole("button", { name: "닫기" }).click();
  await expect(page.getByRole("dialog", { name: "해결 상태 확인" })).toHaveCount(0);

  await page.getByRole("button", { name: "해결 확인" }).click();
  const backdrop = await page.getByTestId("resolve-backdrop").boundingBox();
  expect(backdrop).not.toBeNull();
  await page.mouse.click(
    (backdrop?.x ?? 0) + (backdrop?.width ?? 16) - 8,
    (backdrop?.y ?? 0) + (backdrop?.height ?? 16) - 8,
  );
  await expect(page.getByRole("dialog", { name: "해결 상태 확인" })).toHaveCount(0);

  await page.getByRole("button", { name: "해결 확인" }).click();
  await page.goto("/admin/clubs");
  await expect(page).toHaveURL(/\/admin\/clubs$/);
  expect(harness.mutationRequests).toBe(0);
});

test("responsive command-center screenshots are non-empty and public-safe", async ({ page }) => {
  await installOperationsHarness(page, { unavailableAi: true });
  const viewports = [
    { name: "desktop", width: 1440, height: 1000 },
    { name: "compact", width: 900, height: 900 },
    { name: "mobile", width: 390, height: 844 },
  ] as const;

  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto("/admin/today?case=case-notification");
    await expect(page.getByRole("heading", { name: "오늘의 운영 케이스" })).toBeVisible();
    await expectNoUnsafeText(page);
    const screenshot = await page.screenshot({
      path: `../output/playwright/task-13/admin-operations-${viewport.width}x${viewport.height}.png`,
      fullPage: true,
    });
    expect(screenshot.byteLength).toBeGreaterThan(1_000);
  }
});
