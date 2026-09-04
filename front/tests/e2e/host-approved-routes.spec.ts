import { expect, test, type Page } from "@playwright/test";
import { isSemanticDocumentOrder } from "./support/approved-mockup-contract";
import { runActualRouteAuthority } from "./support/approved-route-harness";
import { createApprovedRouteRequestAudit } from "./support/approved-route-request-audit";
import {
  visualAuthorityScenario,
  visualAuthoritySelected,
  type ApprovedMockupId,
} from "./support/approved-route-scenarios";
import { installHostApprovedRoutes } from "./support/host-approved-route-fixtures";

const HOST_OPERATING_IDS = [
  "host-prep-desktop",
  "host-live-desktop",
  "host-closing-desktop",
  "host-prep-mobile",
  "host-live-mobile",
] as const satisfies readonly ApprovedMockupId[];

const OPERATING_ROOM_ORDER_SELECTORS = [
  '[aria-label="현재 모임"]',
  'nav[aria-label="모임 운영 단계"]',
  ".rm-operating-room-next-action",
  ".rm-host-operating-room__phase-notice",
  ".rm-host-operating-room__phase-panel",
  ".rm-host-operating-room__workbox-rail",
] as const;

async function assertHostOperatingRoomAuthoritySurface(
  page: Page,
  id: (typeof HOST_OPERATING_IDS)[number],
): Promise<void> {
  const scenario = visualAuthorityScenario(id);
  await expect(page.locator(".rm-host-operating-room")).toBeVisible();
  await expect(page.getByRole("button", { name: "작업함 모두 보기" })).toBeVisible();

  const orderLocators = OPERATING_ROOM_ORDER_SELECTORS.map((selector) => page.locator(selector).first());
  for (const locator of orderLocators) {
    await expect(locator).toHaveCount(1);
  }
  expect(await isSemanticDocumentOrder(orderLocators)).toBe(true);

  const expectedWorkboxCount = scenario.defaultVisibleItems?.count;
  expect(expectedWorkboxCount === 3 || expectedWorkboxCount === 4).toBe(true);
  await expect(page.locator(".rm-host-workbox__items > *")).toHaveCount(expectedWorkboxCount!);

  const nextAction = page.locator(".rm-operating-room-next-action").first();
  const partial = page.locator(".rm-host-operating-room__partial");
  expect(await partial.count()).toBe(0);
  const partialBeforeNextAction = await page.evaluate(() => {
    const action = document.querySelector(".rm-operating-room-next-action");
    const panel = document.querySelector(".rm-host-operating-room__partial");
    if (!action || !panel) return false;
    return Boolean(panel.compareDocumentPosition(action) & Node.DOCUMENT_POSITION_FOLLOWING);
  });
  expect(partialBeforeNextAction, "giant partial panel must not precede next action").toBe(false);
  await expect(nextAction).toBeVisible();

  if (id === "host-live-mobile") {
    const nav = page.locator('[data-club-shell-region="mobile-primary"] .m-tabbar').first();
    const board = page.locator(".rm-meeting-response-ledger--attendance-board").first();
    const undo = page.getByRole("button", { name: "실행 취소" }).first();
    await expect(board).toBeVisible();
    await expect(undo).toBeVisible();
    await expect(nav).toBeVisible();
    const navBox = await nav.boundingBox();
    const boardBox = await board.boundingBox();
    const undoBox = await undo.boundingBox();
    expect(navBox, "mobile nav").not.toBeNull();
    expect(boardBox, "attendance board").not.toBeNull();
    expect(undoBox, "undo action").not.toBeNull();
    expect(boardBox!.y + boardBox!.height).toBeLessThanOrEqual(navBox!.y + 1);
    expect(undoBox!.y + undoBox!.height).toBeLessThanOrEqual(navBox!.y + 1);
  }
}

for (const id of HOST_OPERATING_IDS) {
  test(`${id} matches its approved actual route`, async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    test.skip(!visualAuthoritySelected(id), `not affected: ${id}`);
    const scenario = visualAuthorityScenario(id);
    const requestAudit = createApprovedRouteRequestAudit();
    await page.setViewportSize(scenario.viewport);
    await installHostApprovedRoutes(page, scenario.fixtureKey, requestAudit, { workboxItems: 12 });
    await page.goto(scenario.route, { waitUntil: "domcontentloaded" });
    await assertHostOperatingRoomAuthoritySurface(page, id);
    const report = await runActualRouteAuthority({
      page,
      testInfo,
      scenario,
      installFixtures: (installPage, fixtureKey, audit) =>
        installHostApprovedRoutes(installPage, fixtureKey, audit, { workboxItems: 12 }),
    });
    expect(report.mask).toBeNull();
    expect(report).not.toHaveProperty("exception");
  });
}
