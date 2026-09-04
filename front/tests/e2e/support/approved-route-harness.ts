import { expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import {
  approvedMockup,
  assertApprovedRouteReport,
  captureApprovedViewportComparison,
  isSemanticDocumentOrder,
  type ApprovedComparisonReport,
  type ApprovedRegion,
  type ApprovedRouteAssertionResults,
} from "./approved-mockup-contract";
import {
  createApprovedRouteRequestAudit,
  installApprovedRouteCatchAllAudit,
  type ApprovedRouteRequestAudit,
} from "./approved-route-request-audit";
import type {
  ApprovedRouteFixtureKey,
  VisualAuthorityInteraction,
  VisualAuthorityScenario,
} from "./approved-route-scenarios";

export type ApprovedRouteFixtureInstaller = (
  page: Page,
  fixtureKey: ApprovedRouteFixtureKey,
  requestAudit: ApprovedRouteRequestAudit,
) => Promise<void>;

export type ApprovedRoutePreparationKey = VisualAuthorityScenario["preparationKey"];

export type ApprovedRoutePreparationResult = {
  key: ApprovedRoutePreparationKey;
  previewPosted: boolean;
};

type PreparationContext = {
  page: Page;
  scenario: VisualAuthorityScenario;
  requestAudit: ApprovedRouteRequestAudit;
};

export function approvedLocation(url: string): string {
  const parsed = new URL(url, "https://visual-authority.readmates.invalid");
  const search = parsed.search === "?" ? "" : parsed.search;
  const hash = parsed.hash === "#" ? "" : parsed.hash;
  return `${parsed.pathname}${search}${hash}`;
}

export function assertApprovedLocation(actualUrl: string, expectedPath: string, label: string): void {
  const actual = approvedLocation(actualUrl);
  const expected = approvedLocation(expectedPath);
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

export function locateApprovedTarget(page: Page, selector: string): Locator {
  return page.locator(selector).first();
}

export async function performHistoryRestore(input: {
  interaction: Extract<VisualAuthorityInteraction, { kind: "history-restore" }>;
  activate: () => Promise<void>;
  readUrl: () => string | Promise<string>;
  goBack: () => Promise<void>;
  goForward: () => Promise<void>;
  assertFocus?: (selector: string) => Promise<void>;
}): Promise<void> {
  const { interaction } = input;
  await input.activate();
  assertApprovedLocation(await input.readUrl(), interaction.expectedUrlAfterActivate, `${interaction.name} after activate`);
  await input.goBack();
  assertApprovedLocation(await input.readUrl(), interaction.expectedUrlAfterBack, `${interaction.name} after back`);
  if (interaction.expectedRestoredFocusAfterBack) {
    await input.assertFocus?.(interaction.expectedRestoredFocusAfterBack);
  }
  await input.goForward();
  assertApprovedLocation(await input.readUrl(), interaction.expectedUrlAfterForward, `${interaction.name} after forward`);
  if (interaction.expectedRestoredFocusAfterForward) {
    await input.assertFocus?.(interaction.expectedRestoredFocusAfterForward);
  }
}

async function clickPreviewControl(page: Page): Promise<void> {
  const named = page.locator('role=button[name="알림 미리보기"]');
  if (await named.count()) {
    await named.first().click();
    return;
  }
  await locateApprovedTarget(page, ".rm-schedule-review__preview").click();
}

export const APPROVED_ROUTE_PREPARATIONS: Record<
  ApprovedRoutePreparationKey,
  (context: PreparationContext) => Promise<ApprovedRoutePreparationResult>
> = {
  none: async () => ({ key: "none", previewPosted: false }),
  "open-space-switcher": async ({ page }) => {
    await locateApprovedTarget(page, '[aria-label="공간 전환, 현재 플랫폼 운영"]').click();
    await locateApprovedTarget(page, '[role="menu"]').waitFor({ state: "visible" });
    return { key: "open-space-switcher", previewPosted: false };
  },
  "preview-schedule-notification": async ({ page, requestAudit }) => {
    const before = requestAudit.previewPosts().length;
    await clickPreviewControl(page);
    await locateApprovedTarget(page, ".rm-schedule-review__preview").waitFor({ state: "visible" });
    return {
      key: "preview-schedule-notification",
      previewPosted: requestAudit.previewPosts().length > before || before > 0 || requestAudit.previewPosts().length > 0,
    };
  },
};

async function waitForFontsAndIdle(page: Page, scenario: VisualAuthorityScenario): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  await locateApprovedTarget(page, scenario.rootSelector).waitFor({ state: "visible" });
  const readySelector = scenario.regions[0]?.selector ?? scenario.rootSelector;
  await locateApprovedTarget(page, readySelector).waitFor({ state: "visible" });
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
}

async function assertActorScope(page: Page, scenario: VisualAuthorityScenario): Promise<void> {
  const location = approvedLocation(page.url());
  if (scenario.actor.kind === "platform-admin") {
    if (!location.startsWith("/admin")) {
      throw new Error(`${scenario.id} expected a platform-admin /admin route, got ${location}`);
    }
    return;
  }
  const expected = `/clubs/${scenario.actor.clubSlug}/`;
  if (!location.includes(expected)) {
    throw new Error(`${scenario.id} expected club scope ${expected}, got ${location}`);
  }
}

async function pageLocation(page: Page): Promise<string> {
  return approvedLocation(page.url());
}

async function firstMatching(page: Page, selector: string): Promise<Locator> {
  const locator = page.locator(selector);
  const count = await locator.count();
  for (let index = 0; index < count; index += 1) {
    const candidate = locator.nth(index);
    if (await candidate.isVisible()) return candidate;
  }
  return locator.first();
}

async function measureBox(locator: Locator): Promise<{ x: number; y: number; width: number; height: number }> {
  const box = await locator.boundingBox();
  if (!box) return { x: 0, y: 0, width: 0, height: 0 };
  return { x: box.x, y: box.y, width: box.width, height: box.height };
}

async function visibilityOf(
  locator: Locator,
  expected: "fully-visible" | "intersects",
): Promise<{ visibility: "fully-visible" | "intersects"; passed: boolean }> {
  const measured = await locator.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const intersects = box.bottom > 0 && box.top < window.innerHeight && box.right > 0 && box.left < window.innerWidth;
    const fullyVisible = box.top >= 0
      && box.left >= 0
      && box.bottom <= window.innerHeight
      && box.right <= window.innerWidth
      && box.width > 0
      && box.height > 0;
    return { intersects, fullyVisible };
  }).catch(() => ({ intersects: false, fullyVisible: false }));
  if (expected === "fully-visible") {
    return { visibility: "fully-visible", passed: measured.fullyVisible };
  }
  return { visibility: "intersects", passed: measured.intersects };
}

async function measureTypography(
  page: Page,
  entry: VisualAuthorityScenario["typography"][number],
): Promise<ApprovedComparisonReport["typography"][number]> {
  const locator = await firstMatching(page, entry.selector);
  const actual = await locator.evaluate((element) => {
    const style = getComputedStyle(element);
    const lineHeight = style.lineHeight === "normal" ? "normal" as const : Number.parseFloat(style.lineHeight);
    return {
      fontFamily: style.fontFamily,
      fontSizePx: Number.parseFloat(style.fontSize),
      fontWeight: style.fontWeight,
      lineHeightPx: Number.isFinite(lineHeight as number) || lineHeight === "normal" ? lineHeight : "normal" as const,
      color: style.color,
    };
  }).catch(() => ({
    fontFamily: "",
    fontSizePx: 0,
    fontWeight: "",
    lineHeightPx: "normal" as const,
    color: "",
  }));
  const expectedColor = await page.evaluate((color) => {
    const probe = document.createElement("span");
    probe.style.color = color;
    document.body.append(probe);
    const computed = getComputedStyle(probe).color;
    probe.remove();
    return computed;
  }, entry.color).catch(() => entry.color);
  const weight = Number.parseInt(actual.fontWeight, 10);
  const sizePass = Math.abs(actual.fontSizePx - entry.fontSizePx) <= 0.6;
  const weightPass = entry.fontWeight.includes(weight);
  const linePass = entry.lineHeightPx === "normal"
    ? actual.lineHeightPx === "normal"
    : typeof actual.lineHeightPx === "number" && Math.abs(actual.lineHeightPx - entry.lineHeightPx) <= 0.6;
  const colorPass = actual.color === entry.color || actual.color === expectedColor;
  const familyPass = actual.fontFamily.includes(entry.fontFamilyIncludes);
  return {
    name: entry.name,
    selector: entry.selector,
    passed: familyPass && sizePass && weightPass && linePass && colorPass,
    actual,
    expected: {
      fontFamilyIncludes: entry.fontFamilyIncludes,
      fontSizePx: entry.fontSizePx,
      fontWeight: entry.fontWeight,
      lineHeightPx: entry.lineHeightPx,
      color: entry.color,
    },
  };
}

async function countVisibleItems(page: Page, selector: string): Promise<number> {
  const locator = page.locator(selector);
  const count = await locator.count();
  let visible = 0;
  for (let index = 0; index < count; index += 1) {
    const item = locator.nth(index);
    const measured = await visibilityOf(item, "intersects");
    if (measured.passed) visible += 1;
  }
  return visible;
}

async function assertFocused(page: Page, selector: string): Promise<void> {
  await expect(locateApprovedTarget(page, selector)).toBeFocused();
}

async function activateTarget(page: Page, target: string, via: "click" | "Enter" | "Space"): Promise<void> {
  const locator = locateApprovedTarget(page, target);
  if (via === "click") {
    await locator.click();
    return;
  }
  await locator.focus();
  await page.keyboard.press(via);
}

async function restoreCanonical(
  page: Page,
  scenario: VisualAuthorityScenario,
  requestAudit: ApprovedRouteRequestAudit,
): Promise<ApprovedRoutePreparationResult> {
  const onCanonical = approvedLocation(page.url()) === approvedLocation(scenario.route);
  if (!onCanonical) {
    await page.goto(scenario.route, { waitUntil: "domcontentloaded" });
    await waitForFontsAndIdle(page, scenario);
  }
  if (scenario.preparationKey === "preview-schedule-notification") {
    const previewed = page.locator(".rm-schedule-review__layout--previewed, .rm-schedule-review__preview");
    if (onCanonical && await previewed.first().isVisible().catch(() => false)) {
      return { key: "preview-schedule-notification", previewPosted: true };
    }
  }
  if (scenario.preparationKey === "open-space-switcher") {
    const menu = page.locator('[role="menu"]');
    if (onCanonical && await menu.first().isVisible().catch(() => false)) {
      return { key: "open-space-switcher", previewPosted: false };
    }
  }
  if (scenario.preparationKey === "none" && onCanonical) {
    return { key: "none", previewPosted: false };
  }
  return APPROVED_ROUTE_PREPARATIONS[scenario.preparationKey]({ page, scenario, requestAudit });
}

async function executeInteraction(input: {
  page: Page;
  scenario: VisualAuthorityScenario;
  requestAudit: ApprovedRouteRequestAudit;
  interaction: VisualAuthorityInteraction;
  preparation: ApprovedRoutePreparationResult;
}): Promise<{ name: string; passed: boolean; detail: string }> {
  const { page, scenario, requestAudit, interaction, preparation } = input;
  try {
    if (interaction.kind === "activate") {
      await activateTarget(page, interaction.target, interaction.via);
      await locateApprovedTarget(page, interaction.expectedVisible).waitFor({ state: "visible" });
      if (interaction.expectedUrl) {
        assertApprovedLocation(page.url(), interaction.expectedUrl, interaction.name);
      }
      if (interaction.expectedFocus) {
        await assertFocused(page, interaction.expectedFocus);
      }
    } else if (interaction.kind === "focus-control") {
      await locateApprovedTarget(page, interaction.target).focus();
      await expect(locateApprovedTarget(page, interaction.expectedFocused)).toBeVisible();
      await assertFocused(page, interaction.expectedFocused);
    } else if (interaction.kind === "keyboard-menu") {
      const trigger = locateApprovedTarget(page, interaction.trigger);
      await trigger.focus();
      for (const key of interaction.keys) {
        await page.keyboard.press(key);
      }
      const endsWithEscape = interaction.keys[interaction.keys.length - 1] === "Escape";
      if (endsWithEscape) {
        await assertFocused(page, interaction.expectedFocusAfterEscape);
      } else {
        await assertFocused(page, interaction.expectedFocused);
        const expanded = await trigger.getAttribute("aria-expanded");
        if ((expanded === "true") !== interaction.expectedExpanded) {
          throw new Error(`${interaction.name} expectedExpanded=${interaction.expectedExpanded}`);
        }
      }
    } else if (interaction.kind === "history-restore") {
      await performHistoryRestore({
        interaction,
        activate: () => activateTarget(page, interaction.activate, "click"),
        readUrl: () => page.url(),
        goBack: async () => {
          await page.goBack({ waitUntil: "domcontentloaded" });
        },
        goForward: async () => {
          await page.goForward({ waitUntil: "domcontentloaded" });
        },
        assertFocus: (selector) => assertFocused(page, selector),
      });
    } else if (interaction.kind === "tab-selection") {
      await locateApprovedTarget(page, interaction.tab).click();
      await expect(locateApprovedTarget(page, interaction.expectedSelected)).toBeVisible();
      await expect(locateApprovedTarget(page, interaction.expectedPanel)).toBeVisible();
    } else if (interaction.kind === "prepared-request") {
      if (preparation.key !== interaction.performedByPreparationKey) {
        throw new Error(`${interaction.name} expected preparation ${interaction.performedByPreparationKey}`);
      }
      await locateApprovedTarget(page, interaction.expectedVisible).waitFor({ state: "visible" });
      const forbidden = requestAudit.records().filter((record) =>
        record.effectKind != null && interaction.forbiddenEffectKinds.includes(record.effectKind),
      );
      if (forbidden.length > 0) {
        throw new Error(`${interaction.name} saw forbidden effects`);
      }
      const previewOk = requestAudit.previewPosts().some((record) =>
        record.method === interaction.method && record.path === interaction.expectedPath,
      ) || preparation.previewPosted;
      if (!previewOk) {
        throw new Error(`${interaction.name} did not observe ${interaction.method} ${interaction.expectedPath}`);
      }
    }
    if ("restoreCanonicalState" in interaction && interaction.restoreCanonicalState) {
      await restoreCanonical(page, scenario, requestAudit);
    }
    return { name: interaction.name, passed: true, detail: "ok" };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    if ("restoreCanonicalState" in interaction && interaction.restoreCanonicalState) {
      await restoreCanonical(page, scenario, requestAudit).catch(() => undefined);
    }
    return { name: interaction.name, passed: false, detail };
  }
}

export async function runActualRouteAuthority(input: {
  page: Page;
  testInfo: TestInfo;
  scenario: VisualAuthorityScenario;
  installFixtures: ApprovedRouteFixtureInstaller;
}): Promise<ApprovedComparisonReport> {
  const { page, testInfo, scenario, installFixtures } = input;
  await page.setViewportSize(scenario.viewport);
  const requestAudit = createApprovedRouteRequestAudit();
  await installApprovedRouteCatchAllAudit(page, requestAudit);
  await installFixtures(page, scenario.fixtureKey, requestAudit);
  await page.goto(scenario.route, { waitUntil: "domcontentloaded" });
  await assertActorScope(page, scenario);
  let preparation = await APPROVED_ROUTE_PREPARATIONS[scenario.preparationKey]({
    page,
    scenario,
    requestAudit,
  });
  await waitForFontsAndIdle(page, scenario);
  assertApprovedLocation(page.url(), scenario.route, `${scenario.id} canonical url`);

  const geometry: ApprovedComparisonReport["geometry"] = [];
  const measuredRegions: ApprovedRegion[] = [];
  for (const region of scenario.regions) {
    const actual = await measureBox(await firstMatching(page, region.selector));
    const deltas = {
      x: Math.abs(actual.x - region.expected.x),
      y: Math.abs(actual.y - region.expected.y),
      width: Math.abs(actual.width - region.expected.width),
      height: Math.abs(actual.height - region.expected.height),
    };
    const passed = (["x", "y", "width", "height"] as const).every((key) => deltas[key] <= region.toleranceCssPx);
    const measured = {
      name: region.name,
      actual,
      expected: region.expected,
      toleranceCssPx: region.toleranceCssPx,
    };
    measuredRegions.push(measured);
    geometry.push({ ...measured, deltas, passed });
  }

  const typography: ApprovedComparisonReport["typography"] = [];
  for (const entry of scenario.typography) {
    typography.push(await measureTypography(page, entry));
  }

  const orderLocators = await Promise.all(
    scenario.regions.map((region) => firstMatching(page, region.selector)),
  );
  const documentOrderPassed = orderLocators.length < 2 || await isSemanticDocumentOrder(orderLocators);

  const firstViewport: ApprovedComparisonReport["firstViewport"] = [];
  for (const entry of scenario.firstViewport) {
    const locator = page.locator(entry.selector);
    if (entry.name.includes("items")) {
      const expectedCount = scenario.defaultVisibleItems?.count ?? 1;
      let passed = true;
      for (let index = 0; index < expectedCount; index += 1) {
        const measured = await visibilityOf(locator.nth(index), entry.visibility);
        if (!measured.passed) passed = false;
      }
      firstViewport.push({
        name: entry.name,
        selector: entry.selector,
        visibility: entry.visibility,
        passed,
      });
    } else {
      const measured = await visibilityOf(locator.first(), entry.visibility);
      firstViewport.push({
        name: entry.name,
        selector: entry.selector,
        visibility: entry.visibility,
        passed: measured.passed,
      });
    }
  }

  const defaultVisibleCount = scenario.defaultVisibleItems
    ? {
        selector: scenario.defaultVisibleItems.selector,
        expected: scenario.defaultVisibleItems.count,
        actual: await countVisibleItems(page, scenario.defaultVisibleItems.selector),
        passed: false,
      }
    : null;
  if (defaultVisibleCount) {
    defaultVisibleCount.passed = defaultVisibleCount.actual === defaultVisibleCount.expected;
  }

  const horizontalCssPx = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  const overflow = { horizontalCssPx, passed: horizontalCssPx <= 1 };

  const interactions: ApprovedComparisonReport["interactions"] = [];
  for (const interaction of scenario.interactions) {
    const result = await executeInteraction({
      page,
      scenario,
      requestAudit,
      interaction,
      preparation,
    });
    interactions.push(result);
  }
  if (!documentOrderPassed) {
    interactions.push({
      name: "document-order",
      passed: false,
      detail: "required regions are not in document order",
    });
  }

  await restoreCanonical(page, scenario, requestAudit);
  assertApprovedLocation(page.url(), scenario.route, `${scenario.id} restored canonical url`);

  const unmatched = requestAudit.unmatched().length;
  const effecting = requestAudit.effecting().length;
  const results: ApprovedRouteAssertionResults = {
    geometry,
    typography,
    firstViewport,
    defaultVisibleCount,
    overflow,
    interactions,
    requestAudit: {
      unmatched,
      effecting,
      preview: requestAudit.previewPosts().length,
      passed: unmatched === 0 && effecting === 0,
    },
  };

  const report = await captureApprovedViewportComparison({
    page,
    testInfo,
    entry: approvedMockup(scenario.id),
    regions: measuredRegions,
    results,
  });
  requestAudit.assertNoUnmatchedOrEffecting();
  assertApprovedRouteReport(report);
  return report;
}
