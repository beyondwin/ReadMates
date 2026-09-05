import { expect, test } from "@playwright/test";
import {
  AUDIT_REVIEW_CAPABILITIES,
  CLUBS_LEDGER_CAPABILITIES,
  HEALTH_READ_CAPABILITIES,
  NOTIFICATION_REPLAY_CAPABILITIES,
  NOTIFICATION_VIEW_ONLY_CAPABILITIES,
  TODAY_ACKNOWLEDGE_ONLY,
  TODAY_VIEW_CAPABILITIES,
  routeAdminAuditLedger,
  routeAdminClubsLedger,
  routeAdminEditorialLedgerShell,
  routeAdminHealthSnapshot,
  routeAdminNotificationsLedger,
  routeAdminTodayCases,
} from "./admin-editorial-ledger-e2e-fixtures";
import {
  VISUAL_AUTHORITY_VIEWPORTS,
  expectMinimumTargetSize,
  expectNoHorizontalOverflow,
  expectReducedMotion,
  expectVisibleFocus,
} from "./support/visual-authority-contract";

test("Today L1 uses explicit allowedActions rather than role", async ({ page }) => {
  await page.setViewportSize(VISUAL_AUTHORITY_VIEWPORTS.desktopWide);
  await routeAdminEditorialLedgerShell(page, {
    capabilities: TODAY_VIEW_CAPABILITIES,
    authRole: "OWNER",
  });
  await routeAdminTodayCases(page, { allowedActions: TODAY_ACKNOWLEDGE_ONLY });
  await page.goto("/admin/today?case=case-notification");
  await expectReducedMotion(page);

  await expect(page.getByRole("heading", { name: "오늘 할 일", level: 1 })).toBeVisible();
  await expect(page.getByRole("region", { name: "운영 케이스 큐" })).toBeVisible();
  await expect(page.getByRole("region", { name: "운영 케이스 상세" })).toBeVisible();
  const actions = page.getByRole("group", { name: "작업" });
  await expect(actions.getByRole("button")).toHaveCount(1);
  await expect(actions.getByRole("button", { name: "확인함" })).toBeEnabled();
  await expect(page.locator(".admin-receipt-timeline")).toHaveCount(0);
  await expectNoHorizontalOverflow(page);

  const acknowledge = actions.getByRole("button", { name: "확인함" });
  await acknowledge.focus();
  await expectVisibleFocus(acknowledge);
  await expectMinimumTargetSize(acknowledge);
});

test("Today with empty allowedActions keeps OWNER read-only", async ({ page }) => {
  await page.setViewportSize(VISUAL_AUTHORITY_VIEWPORTS.desktopWide);
  await routeAdminEditorialLedgerShell(page, {
    capabilities: TODAY_VIEW_CAPABILITIES,
    authRole: "OWNER",
  });
  await routeAdminTodayCases(page, { allowedActions: [] });
  await page.goto("/admin/today?case=case-notification");

  await expect(page.getByRole("region", { name: "운영 케이스 상세" })).toBeVisible();
  await expect(page.getByText("현재 역할은 상태 변경 없이 운영 근거만 확인할 수 있습니다.")).toBeVisible();
  await expect(page.getByRole("button", { name: "확인 처리" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "해결 확인" })).toHaveCount(0);
});

test("Clubs list-detail-return restores focus inside /admin", async ({ page }) => {
  await page.setViewportSize(VISUAL_AUTHORITY_VIEWPORTS.tablet);
  await routeAdminEditorialLedgerShell(page, { capabilities: CLUBS_LEDGER_CAPABILITIES });
  await routeAdminClubsLedger(page);
  await page.goto("/admin/clubs");
  await expectReducedMotion(page);

  await expect(page.getByRole("heading", { name: "클럽 찾기" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Broken Club" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expectMinimumTargetSize(page.getByRole("link", { name: "새 클럽" }));

  await page.getByRole("link", { name: "Broken Club" }).click();
  await expect(page).toHaveURL(/\/admin\/clubs\/club-1$/);
  await expect(page.getByRole("link", { name: "← 클럽 목록" })).toBeVisible();

  const backToList = page.getByRole("link", { name: "← 클럽 목록" });
  await backToList.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/admin\/clubs/);
  await expect(page.locator("#admin-club-row-club-1")).toBeFocused();
});

test("Health is read-only evidence without commands", async ({ page }) => {
  await page.setViewportSize(VISUAL_AUTHORITY_VIEWPORTS.tabletNarrow);
  await routeAdminEditorialLedgerShell(page, { capabilities: HEALTH_READ_CAPABILITIES });
  await routeAdminHealthSnapshot(page);
  await page.goto("/admin/health");
  await expectReducedMotion(page);

  await expect(page.getByRole("heading", { name: "서비스 건강" })).toHaveCount(0);
  await expect(page.getByRole("table", { name: "서비스 상태" })).toBeVisible();
  await expect(page.getByRole("region", { name: "서비스 신호" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "AI 작업 대기열" })).toBeVisible();
  await expect(page.locator(".admin-case-docket")).toHaveCount(0);
  await expect(page.locator(".admin-action-dock")).toHaveCount(0);
  await expect(page.locator(".admin-receipt-timeline")).toHaveCount(0);
  await expectNoHorizontalOverflow(page);

  const refresh = page.getByRole("button", { name: "새로 확인" }).first();
  await refresh.focus();
  await expectVisibleFocus(refresh);
  await expectMinimumTargetSize(refresh);
});

test("Audit URL owns the review docket", async ({ page }) => {
  await page.setViewportSize(VISUAL_AUTHORITY_VIEWPORTS.mobile);
  await routeAdminEditorialLedgerShell(page, { capabilities: AUDIT_REVIEW_CAPABILITIES });
  await routeAdminAuditLedger(page);
  await page.goto("/admin/audit");
  await expectReducedMotion(page);

  await expect(page.getByRole("heading", { name: "처리 기록" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.getByRole("listitem", { name: /지원 접근 권한을 부여했습니다/ }).click();
  await expect(page).toHaveURL(/event=platform_audit_events%3Aevent-2|event=platform_audit_events:event-2/);
  await expect(page).toHaveURL(/mode=detail/);
  await expect(page.getByRole("region", { name: "감사 이벤트 상세" })).toBeVisible();
  await expect(page.getByText("member1@example.com")).toHaveCount(0);

  const back = page.getByRole("button", { name: "목록으로" });
  await expectMinimumTargetSize(back);
  await back.click();
  await expect(page).not.toHaveURL(/mode=detail/);
  await expect(
    page.getByRole("button", { name: /지원 접근 권한을 부여했습니다/ }),
  ).toBeFocused();
});

test("Notifications L2 replay requires exact REPLAY_NOTIFICATIONS", async ({ page }) => {
  await routeAdminEditorialLedgerShell(page, {
    capabilities: NOTIFICATION_VIEW_ONLY_CAPABILITIES,
    authRole: "OWNER",
  });
  const denied = await routeAdminNotificationsLedger(page);
  await page.goto("/admin/notifications");
  await expectReducedMotion(page);

  await expect(page.getByRole("heading", { name: "알림 전달 상태" })).toBeVisible();
  await expect(page.getByText("현재 권한으로는 재처리를 실행할 수 없습니다.")).toBeVisible();
  await expect(page.getByRole("button", { name: "대상 확인" })).toBeDisabled();
  await page.getByRole("button", { name: "대상 확인" }).click({ force: true });
  expect(denied.previewCount).toBe(0);
  await expectNoHorizontalOverflow(page);

  await routeAdminEditorialLedgerShell(page, {
    capabilities: NOTIFICATION_REPLAY_CAPABILITIES,
    authRole: "OPERATOR",
  });
  const allowed = await routeAdminNotificationsLedger(page);
  await page.goto("/admin/notifications");
  await expect(page.getByRole("button", { name: "대상 확인" })).toBeEnabled();
  await expectMinimumTargetSize(page.getByRole("button", { name: "대상 확인" }));
  await page.getByRole("button", { name: "대상 확인" }).click();
  await expect(page.getByText(/대상 2건/)).toBeVisible();
  expect(allowed.previewCount).toBe(1);
  await expect(page.locator(".admin-receipt-timeline")).toHaveCount(0);
});
