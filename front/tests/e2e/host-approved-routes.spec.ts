import { expect, test, type Page } from "@playwright/test";
import { isSemanticDocumentOrder } from "./support/approved-mockup-contract";
import { runActualRouteAuthority } from "./support/approved-route-harness";
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
    await expect(board).toBeVisible();
    await expect(nav).toBeVisible();
    const navBox = await nav.boundingBox();
    const boardBox = await board.boundingBox();
    expect(navBox, "mobile nav").not.toBeNull();
    expect(boardBox, "attendance board").not.toBeNull();
    expect(boardBox!.y + boardBox!.height).toBeLessThanOrEqual(navBox!.y + 1);

    const rows = page.locator(".rm-meeting-response-ledger--attendance-board .rm-meeting-response-ledger__row--board");
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
    expect(clipped.every((item) => item === false), "attendance names are clipped by overflow:hidden").toBe(true);
  }
}

for (const id of HOST_OPERATING_IDS) {
  test(`${id} matches its approved actual route`, async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    test.skip(!visualAuthoritySelected(id), `not affected: ${id}`);
    const report = await runActualRouteAuthority({
      page,
      testInfo,
      scenario: visualAuthorityScenario(id),
      installFixtures: (installPage, fixtureKey, audit) =>
        installHostApprovedRoutes(installPage, fixtureKey, audit, { workboxItems: 12 }),
      beforeCapture: (capturePage) => assertHostOperatingRoomAuthoritySurface(capturePage, id),
    });
    expect(report.mask).toBeNull();
    expect(report).not.toHaveProperty("exception");
  });
}

const HOST_LEDGER_IDS = [
  "host-meetings-desktop",
  "host-people-desktop",
  "host-records-desktop",
  "host-settings-desktop",
  "host-schedule-review-desktop",
  "host-person-mobile",
] as const satisfies readonly ApprovedMockupId[];

async function assertHostLedgerAuthoritySurface(
  page: Page,
  id: (typeof HOST_LEDGER_IDS)[number],
): Promise<void> {
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  if (id === "host-meetings-desktop") {
    await expect(page.getByRole("tablist", { name: "모임 보기 방식" })).toBeVisible();
    await expect(page.getByRole("tablist", { name: "모임 상태" })).toBeVisible();
    const calendarTab = page.getByRole("tab", { name: "달력" });
    const listTab = page.getByRole("tab", { name: "목록" });
    await expect(calendarTab).toBeVisible();
    await expect(page.getByRole("tab", { name: "준비 중" })).toBeVisible();
    if (await calendarTab.getAttribute("aria-selected") === "true") {
      await listTab.click();
      await expect(listTab).toHaveAttribute("aria-selected", "true");
    }
    const preparingTab = page.getByRole("tab", { name: "준비 중" });
    const allTab = page.getByRole("tab", { name: "전체" }).first();
    if (await preparingTab.getAttribute("aria-selected") === "true") {
      await allTab.click();
      await expect(allTab).toHaveAttribute("aria-selected", "true");
    }
    return;
  }

  if (id === "host-people-desktop") {
    await expect(page.getByRole("region", { name: "가입 승인 대기" })).toBeVisible();
    await expect(page.locator(".rm-host-member-ledger").first()).toBeVisible();
    await expect(page.locator(".rm-host-member-ledger__row").first()).toBeVisible();
    return;
  }

  if (id === "host-records-desktop") {
    await expect(page.locator(".rm-host-records-next a")).toBeVisible();
    return;
  }

  if (id === "host-settings-desktop") {
    await expect(page.getByRole("button", { name: "새 초대 링크" })).toBeVisible();
    const createForm = page.getByRole("textbox", { name: "링크 이름" });
    if (await createForm.count()) {
      await page.getByRole("button", { name: "새 초대 링크" }).click();
      await expect(createForm).toHaveCount(0);
    }
    return;
  }

  if (id === "host-schedule-review-desktop") {
    await expect(page.locator(".rm-schedule-review__recipients")).toBeVisible();
    await expect(page.getByRole("button", { name: "알림 미리보기" })).toBeVisible();
    await expect(page.getByRole("region", { name: "발송 전 확인" })).toBeVisible();
    await expect(page.getByRole("button", { name: /명에게 안내 보내기/ })).toBeVisible();
    return;
  }

  await expect(page.locator(".rm-host-person__tenure")).toBeVisible();
  await expect(page.getByRole("region", { name: "참석 기록" })).toBeVisible();
  await expect(page.locator('[data-club-shell-region="mobile-primary"] .m-tabbar')).toBeVisible();
}

for (const id of HOST_LEDGER_IDS) {
  test(`${id} matches its approved actual route`, async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    test.skip(!visualAuthoritySelected(id), "not affected: " + id);
    const report = await runActualRouteAuthority({
      page,
      testInfo,
      scenario: visualAuthorityScenario(id),
      installFixtures: (installPage, fixtureKey, audit) =>
        installHostApprovedRoutes(installPage, fixtureKey, audit, { workboxItems: 12 }),
      beforeCapture: (capturePage) => assertHostLedgerAuthoritySurface(capturePage, id),
    });
    expect(report.mask).toBeNull();
    expect(report).not.toHaveProperty("exception");
    expect(report.results.requestAudit.effecting).toBe(0);
    expect(report.results.requestAudit.unmatched).toBe(0);
  });
}
