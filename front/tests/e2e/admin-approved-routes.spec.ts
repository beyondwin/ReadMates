import { expect, test } from "@playwright/test";
import { installAdminApprovedRoutes } from "./support/admin-approved-route-fixtures";
import { runActualRouteAuthority } from "./support/approved-route-harness";
import {
  visualAuthorityScenario,
  visualAuthoritySelected,
} from "./support/approved-route-scenarios";

async function assertAdminTodayAuthoritySurface(
  page: Parameters<typeof runActualRouteAuthority>[0]["page"],
  id: "admin-today-desktop" | "admin-today-mobile" | "admin-work-detail-mobile",
): Promise<void> {
  if (id === "admin-work-detail-mobile") {
    await expect(page.locator('[aria-label="운영 케이스 상세"] button').first()).toBeVisible();
    return;
  }

  const rows = page.locator(".admin-operations-queue__row");
  await expect(rows).toHaveCount(3);
  await expect(page.getByRole("button", { name: /전체 .*보기/ })).toBeVisible();

  const listOverflow = await page.locator(".admin-operations-queue__list").evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      overflowY: style.overflowY,
      hiddenByScroll: node.scrollHeight - node.clientHeight > 1,
    };
  });
  expect(["visible", "clip", "hidden"]).toContain(listOverflow.overflowY);
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
    const report = await runActualRouteAuthority({
      page,
      testInfo,
      scenario,
      installFixtures: (page, fixtureKey, requestAudit) =>
        installAdminApprovedRoutes(page, fixtureKey, requestAudit),
    });
    expect(report.mask).toBeNull();
    expect(report).not.toHaveProperty("exception");
    await assertAdminTodayAuthoritySurface(page, id);
  });
}
