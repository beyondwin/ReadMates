import { expect, test } from "@playwright/test";
import { installAdminApprovedRoutes } from "./support/admin-approved-route-fixtures";
import {
  CANONICAL_RENDERER_IMAGE,
  resolveApprovedRendererImage,
} from "./support/approved-mockup-contract";
import { runActualRouteAuthority } from "./support/approved-route-harness";
import { createApprovedRouteRequestAudit } from "./support/approved-route-request-audit";
import {
  visualAuthorityScenario,
  visualAuthoritySelected,
} from "./support/approved-route-scenarios";

test.skip(
  resolveApprovedRendererImage() !== CANONICAL_RENDERER_IMAGE,
  `actual-route visual authority requires renderer ${CANONICAL_RENDERER_IMAGE}`,
);

async function assertQueueRowsReachable(
  page: Parameters<typeof runActualRouteAuthority>[0]["page"],
  expectedCount: number,
): Promise<void> {
  const rows = page.locator(".admin-operations-queue__row");
  await expect(rows).toHaveCount(expectedCount);
  const clipped = await rows.evaluateAll((nodes) => nodes.map((node) => {
    let ancestor = node.parentElement;
    while (ancestor) {
      const style = getComputedStyle(ancestor);
      const clips = style.overflowY === "hidden" || style.overflowY === "clip";
      if (clips) {
        const row = node.getBoundingClientRect();
        const box = ancestor.getBoundingClientRect();
        const unreachable = row.bottom - box.bottom > 1 || box.top - row.top > 1;
        const hiddenOverflow = ancestor.scrollHeight - ancestor.clientHeight > 1
          && style.overflowY !== "auto"
          && style.overflowY !== "scroll";
        if (unreachable || hiddenOverflow) return true;
      }
      ancestor = ancestor.parentElement;
    }
    return false;
  }));
  expect(clipped.every((item) => item === false), "queue rows are clipped by overflow:hidden").toBe(true);
}

async function assertAdminTodayAuthoritySurface(
  page: Parameters<typeof runActualRouteAuthority>[0]["page"],
  id: "admin-today-desktop" | "admin-today-mobile" | "admin-work-detail-mobile",
): Promise<void> {
  if (id === "admin-work-detail-mobile") {
    await expect(page.locator('[aria-label="운영 케이스 상세"] button').first()).toBeVisible();
    return;
  }

  await assertQueueRowsReachable(page, 3);
  await expect(page.getByRole("button", { name: /전체 .*보기/ })).toBeVisible();
  await expect(page.locator(".admin-operations-queue__age").nth(0)).toHaveText("10분 전");
  await expect(page.locator(".admin-operations-queue__age").nth(1)).toHaveText("35분 전");
  await expect(page.locator(".admin-operations-queue__age").nth(2)).toHaveText("1시간 전");

  const listOverflow = await page.locator(".admin-operations-queue__list").evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      overflowY: style.overflowY,
      hiddenByScroll: node.scrollHeight - node.clientHeight > 1,
    };
  });
  expect(["visible", "clip"]).toContain(listOverflow.overflowY);
  expect(listOverflow.hiddenByScroll).toBe(false);

  if (id === "admin-today-mobile") {
    const titleBox = await page.locator(".admin-operations-queue__title").first().boundingBox();
    expect(titleBox?.width ?? 0).toBeGreaterThanOrEqual(192);
  }
}

for (const id of ["admin-today-desktop", "admin-today-mobile", "admin-work-detail-mobile"] as const) {
  test(`${id} matches its approved actual route`, async ({ page }, testInfo) => {
    test.skip(!visualAuthoritySelected(id), `not affected: ${id}`);
    const scenario = visualAuthorityScenario(id);
    const requestAudit = createApprovedRouteRequestAudit();
    await page.setViewportSize(scenario.viewport);
    await installAdminApprovedRoutes(page, scenario.fixtureKey, requestAudit);
    await page.goto(scenario.route, { waitUntil: "domcontentloaded" });
    await assertAdminTodayAuthoritySurface(page, id);
    const report = await runActualRouteAuthority({
      page,
      testInfo,
      scenario,
      installFixtures: (installPage, fixtureKey, audit) =>
        installAdminApprovedRoutes(installPage, fixtureKey, audit),
    });
    expect(report.mask).toBeNull();
    expect(report).not.toHaveProperty("exception");
  });
}

test("admin-space-switcher-desktop matches its approved actual route", async ({ page }, testInfo) => {
  test.skip(
    !visualAuthoritySelected("admin-space-switcher-desktop"),
    "not affected: admin-space-switcher-desktop",
  );
  const scenario = visualAuthorityScenario("admin-space-switcher-desktop");
  const requestAudit = createApprovedRouteRequestAudit();
  await page.setViewportSize(scenario.viewport);
  await installAdminApprovedRoutes(page, scenario.fixtureKey, requestAudit);
  await page.goto(scenario.route, { waitUntil: "domcontentloaded" });

  await page.getByRole("button", { name: "공간 전환, 현재 플랫폼 운영" }).click();
  await expect(page.getByRole("menu")).toBeVisible();
  await expect(page.getByRole("menuitemradio", { name: /플랫폼 운영/ })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("menuitem", { name: "내 클럽" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: /샘플 독서모임/ })).toHaveCount(0);

  await page.getByRole("menuitem", { name: "내 클럽" }).click();
  await expect(page.getByRole("group", { name: "샘플 독서모임" })).toBeVisible();
  await expect(page.getByRole("menuitemradio", { name: "샘플 독서모임 멤버로 보기" })).toBeVisible();
  await expect(page.getByRole("menuitemradio", { name: "샘플 독서모임 호스트로 운영" })).toBeVisible();
  await expect(page.getByRole("menuitemradio", { name: /플랫폼 운영/ })).toHaveCount(0);
  await page.getByRole("button", { name: "범위 선택으로 돌아가기" }).click();
  await expect(page.getByRole("menuitem", { name: "내 클럽" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "공간 전환, 현재 플랫폼 운영" })).toBeFocused();

  const report = await runActualRouteAuthority({
    page,
    testInfo,
    scenario,
    installFixtures: (installPage, fixtureKey, audit) =>
      installAdminApprovedRoutes(installPage, fixtureKey, audit),
  });
  expect(report.mask).toBeNull();
  expect(report).not.toHaveProperty("exception");
});

async function assertAdminLedgerAuthoritySurface(
  page: Parameters<typeof runActualRouteAuthority>[0]["page"],
  id: "admin-clubs-desktop" | "admin-service-desktop" | "admin-records-desktop",
): Promise<void> {
  const scenario = visualAuthorityScenario(id);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.locator(".admin-shell__nav")).toBeVisible();
  await expect(page.locator(scenario.regions[2].selector)).toBeVisible();

  if (id === "admin-clubs-desktop") {
    await expect(page.locator(".admin-club-management__finder")).toBeVisible();
    await expect(page.locator(".admin-club-management__docket")).toBeVisible();
    return;
  }

  if (id === "admin-service-desktop") {
    await expect(page.locator(".admin-service-status__table")).toBeVisible();
    await expect(page.locator(".admin-health-grid__strip")).toBeVisible();
    await expect(page.getByRole("button", { name: "새로 확인" })).toHaveCount(0);
    return;
  }

  await expect(page.locator(".admin-audit__list")).toBeVisible();
  await expect(page.locator(".admin-audit__detail")).toBeVisible();
}

for (const id of ["admin-clubs-desktop", "admin-service-desktop", "admin-records-desktop"] as const) {
  test(`${id} matches its approved actual route`, async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    test.skip(!visualAuthoritySelected(id), "not affected: " + id);
    const scenario = visualAuthorityScenario(id);
    const requestAudit = createApprovedRouteRequestAudit();
    await page.setViewportSize(scenario.viewport);
    await installAdminApprovedRoutes(page, scenario.fixtureKey, requestAudit);
    await page.goto(scenario.route, { waitUntil: "domcontentloaded" });
    await assertAdminLedgerAuthoritySurface(page, id);
    const report = await runActualRouteAuthority({
      page,
      testInfo,
      scenario,
      installFixtures: (installPage, fixtureKey, audit) =>
        installAdminApprovedRoutes(installPage, fixtureKey, audit),
    });
    expect(report.mask).toBeNull();
    expect(report).not.toHaveProperty("exception");
  });
}
