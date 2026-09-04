import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  installAdminApprovedRoutes,
  type AdminApprovedCopyVariant,
  type AdminApprovedListState,
} from "./support/admin-approved-route-fixtures";
import { createApprovedRouteRequestAudit } from "./support/approved-route-request-audit";
import { visualAuthorityScenario } from "./support/approved-route-scenarios";
import {
  HOST_APPROVED_CLUB,
  installHostApprovedRoutes,
  type HostApprovedCopyVariant,
  type HostApprovedCurrentMeeting,
  type HostApprovedLiveMutation,
  type HostApprovedWorkboxState,
  type InstallHostApprovedRoutesOptions,
} from "./support/host-approved-route-fixtures";

const ADMIN_TODAY = "/admin/today";
const HOST_PREP = `/clubs/${HOST_APPROVED_CLUB.clubSlug}/app/host?phase=prep`;
const HOST_LIVE = `/clubs/${HOST_APPROVED_CLUB.clubSlug}/app/host?phase=live`;
const ADMIN_HEIGHT = visualAuthorityScenario("admin-today-mobile").viewport.height;
const HOST_MOBILE_HEIGHT = visualAuthorityScenario("host-prep-mobile").viewport.height;
const HOST_DESKTOP_HEIGHT = visualAuthorityScenario("host-prep-desktop").viewport.height;
const COPY_VARIANTS = ["long-korean", "long-english", "unbroken-token"] as const;
const DENSITY_WIDTHS = [390, 1440] as const;
const EXTRA_BREAKPOINTS = [320, 768, 1024] as const;
const FIRST_ROW_MAX_HEIGHT = 320;
const MAX_OVERFLOW_PX = 1;

function titleMinWidth(cssWidth: number): number {
  if (cssWidth >= 390) return 192;
  if (cssWidth >= 320) return 120;
  return 72;
}

function heightFor(surface: "admin" | "host", width: number): number {
  if (width === 195) return 422;
  if (width === 720) return 470;
  if (surface === "admin") return width <= 390 ? ADMIN_HEIGHT : 941;
  return width <= 390 ? HOST_MOBILE_HEIGHT : HOST_DESKTOP_HEIGHT;
}

async function assertNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => {
    const root = document.querySelector(".admin-shell, .rm-app-club-shell") ?? document.documentElement;
    return root.scrollWidth - Math.max(root.clientWidth, window.innerWidth);
  });
  expect(overflow, "horizontal overflow").toBeLessThanOrEqual(MAX_OVERFLOW_PX);
}

async function assertRowsNotClipped(rows: Locator, list?: Locator): Promise<void> {
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
  expect(clipped.every((item) => item === false), "rows are clipped by overflow:hidden").toBe(true);
  if (!list) return;
  const listOverflow = await list.evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      overflowY: style.overflowY,
      hiddenByScroll: node.scrollHeight - node.clientHeight > 1,
    };
  });
  expect(["visible", "clip"]).toContain(listOverflow.overflowY);
  if (listOverflow.overflowY !== "visible") {
    expect(listOverflow.hiddenByScroll, "capped rows are inside a clipping list").toBe(false);
  }
}

async function assertMinWidth(locator: Locator, minWidth: number): Promise<void> {
  await expect.poll(async () => locator.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return Math.max(rect.width, node.scrollWidth, (node as HTMLElement).offsetWidth);
  })).toBeGreaterThanOrEqual(minWidth);
}

async function assertBoundedHeight(locator: Locator): Promise<void> {
  const box = await locator.boundingBox();
  expect(box, "row box").not.toBeNull();
  expect(box!.height).toBeLessThanOrEqual(FIRST_ROW_MAX_HEIGHT);
}

async function assertKeyboardReachable(page: Page, target: Locator): Promise<void> {
  await page.locator("body").evaluate((node) => (node as HTMLElement).focus());
  for (let i = 0; i < 40; i += 1) {
    if (await target.evaluate((node) => node === document.activeElement).catch(() => false)) {
      return;
    }
    await page.keyboard.press("Tab");
  }
  await expect(target).toBeFocused();
}

async function assertSafeArea(page: Page, cssWidth: number, nav: Locator): Promise<void> {
  if (cssWidth > 390) return;
  if (await nav.count() === 0) return;
  await expect(nav).toBeVisible();
  const box = await nav.boundingBox();
  expect(box, "mobile nav").not.toBeNull();
  const innerHeight = await page.evaluate(() => window.innerHeight);
  expect(box!.y + box!.height).toBeLessThanOrEqual(innerHeight + 1);
}

async function openAdminToday(
  page: Page,
  width: number,
  options?: Parameters<typeof installAdminApprovedRoutes>[3],
  route = ADMIN_TODAY,
): Promise<void> {
  const requestAudit = createApprovedRouteRequestAudit();
  await page.setViewportSize({ width, height: heightFor("admin", width) });
  await installAdminApprovedRoutes(page, "admin-today", requestAudit, options);
  await page.goto(route, { waitUntil: "domcontentloaded" });
}

async function openHost(
  page: Page,
  width: number,
  route: string,
  options?: InstallHostApprovedRoutesOptions,
): Promise<void> {
  const requestAudit = createApprovedRouteRequestAudit();
  await page.setViewportSize({ width, height: heightFor("host", width) });
  await installHostApprovedRoutes(page, "host-operating-room", requestAudit, options);
  await page.goto(route, { waitUntil: "domcontentloaded" });
}

async function assertAdminGeometry(
  page: Page,
  width: number,
  options: {
    caseCount: number;
    empty?: boolean;
    errorTitle?: string;
    retry?: boolean;
    disclosure?: boolean;
  },
): Promise<void> {
  if (options.errorTitle) {
    await expect(page.getByRole("heading", { name: options.errorTitle }).first())
      .toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("heading", { name: "오늘 할 일" }).first()).toBeVisible();
    await assertNoHorizontalOverflow(page);
    if (options.retry) {
      const retry = page.getByRole("button", { name: "다시 시도" });
      await expect(retry).toBeVisible();
      await assertKeyboardReachable(page, retry);
    }
    await assertSafeArea(page, width, page.locator(".admin-mobile-navigation"));
    return;
  }
  await expect(page.getByRole("heading", { name: "오늘 할 일" }).first()).toBeVisible();
  if (options.empty) {
    await expect(page.getByText("지금은 처리할 운영 케이스가 없습니다")).toBeVisible();
    await assertNoHorizontalOverflow(page);
    await assertSafeArea(page, width, page.locator(".admin-mobile-navigation"));
    return;
  }
  const title = page.locator(".admin-operations-queue__title").first();
  const rows = page.locator(".admin-operations-queue__row");
  const row = rows.first();
  await expect(title).toBeVisible();
  await assertNoHorizontalOverflow(page);
  await assertMinWidth(title, titleMinWidth(width));
  await assertBoundedHeight(row);
  if (options.disclosure) {
    await expect(rows).toHaveCount(3);
    const disclosure = page.getByRole("button", { name: /전체 .*보기/ });
    await expect(disclosure).toBeVisible();
    await assertRowsNotClipped(rows, page.locator(".admin-operations-queue__list"));
    await assertKeyboardReachable(page, disclosure);
  } else {
    await expect(row).toBeVisible();
    await assertKeyboardReachable(page, row);
  }
  await assertSafeArea(page, width, page.locator(".admin-mobile-navigation"));
}

async function assertHostGeometry(
  page: Page,
  width: number,
  options: {
    workboxItems: number;
    emptyMeeting?: boolean;
    emptyWorkbox?: boolean;
    workboxError?: boolean;
    disclosure?: boolean;
  },
): Promise<void> {
  await expect(page.locator(".rm-host-operating-room")).toBeVisible({ timeout: 15_000 });
  if (options.emptyMeeting) {
    const create = page.getByRole("link", { name: "첫 모임 만들기" });
    await expect(page.getByRole("heading", { name: "모임 운영실" })).toBeVisible();
    await expect(create).toBeVisible();
    await assertNoHorizontalOverflow(page);
    await assertKeyboardReachable(page, create);
    await assertSafeArea(page, width, page.locator('[data-club-shell-region="mobile-primary"] .m-tabbar'));
    return;
  }
  await expect(page.locator(".rm-operating-room-next-action").first()).toBeVisible();
  if (options.workboxError) {
    const retry = page.locator(".rm-host-workbox__error").getByRole("button", { name: "다시 불러오기", exact: true });
    await expect(retry).toBeVisible();
    await assertNoHorizontalOverflow(page);
    await assertKeyboardReachable(page, retry);
    await assertSafeArea(page, width, page.locator('[data-club-shell-region="mobile-primary"] .m-tabbar'));
    return;
  }
  if (options.emptyWorkbox) {
    await expect(page.getByText("지금 처리할 작업이 없습니다.")).toBeVisible();
    await assertNoHorizontalOverflow(page);
    await assertSafeArea(page, width, page.locator('[data-club-shell-region="mobile-primary"] .m-tabbar'));
    return;
  }
  const title = page.locator(".rm-host-workbox__items .rm-host-work-item__title").first();
  const rows = page.locator(".rm-host-workbox__items .rm-host-work-item");
  const row = rows.first();
  await expect(title).toBeVisible();
  await assertNoHorizontalOverflow(page);
  await assertMinWidth(title, titleMinWidth(width));
  await assertBoundedHeight(row);
  if (options.disclosure) {
    const cap = width <= 767 ? 3 : 4;
    await expect(rows).toHaveCount(cap);
    const disclosure = page.getByRole("button", { name: "작업함 모두 보기" });
    await expect(disclosure).toBeVisible();
    await assertRowsNotClipped(rows, page.locator(".rm-host-workbox__items"));
    await assertKeyboardReachable(page, disclosure);
  } else {
    const primary = page.locator(".rm-operating-room-next-action__primary").first();
    await expect(primary).toBeVisible();
    await assertKeyboardReachable(page, primary);
  }
  await assertSafeArea(page, width, page.locator('[data-club-shell-region="mobile-primary"] .m-tabbar'));
}

function adminDisclosure(count: number): boolean {
  return count > 3;
}

function hostDisclosure(count: number, width: number): boolean {
  const cap = width <= 767 ? 3 : 4;
  return count > cap;
}

test.describe("approved-route stress", () => {
  for (const width of DENSITY_WIDTHS) {
    for (const caseCount of [0, 3, 10] as const) {
      test(`Admin Today density ${caseCount} at ${width}${caseCount === 3 ? " including reduced motion" : ""}`, async ({ page }) => {
        if (caseCount === 3) await page.emulateMedia({ reducedMotion: "reduce" });
        await openAdminToday(page, width, { caseCount });
        await assertAdminGeometry(page, width, {
          caseCount,
          empty: caseCount === 0,
          disclosure: adminDisclosure(caseCount),
        });
      });
    }
  }

  for (const width of EXTRA_BREAKPOINTS) {
    test(`Admin Today normal at ${width}`, async ({ page }) => {
      await openAdminToday(page, width, { caseCount: 3 });
      await assertAdminGeometry(page, width, { caseCount: 3, disclosure: false });
    });
  }

  for (const copy of COPY_VARIANTS) {
    test(`Admin Today ${copy} at 320`, async ({ page }) => {
      await openAdminToday(page, 320, { caseCount: 3, copy: copy as AdminApprovedCopyVariant });
      await assertAdminGeometry(page, 320, { caseCount: 3, disclosure: false });
    });
  }

  for (const width of DENSITY_WIDTHS) {
    test(`Admin list-unavailable at ${width}`, async ({ page }) => {
      await openAdminToday(page, width, { listState: "unavailable" as AdminApprovedListState });
      await assertAdminGeometry(page, width, {
        caseCount: 0,
        errorTitle: "운영 케이스를 불러오지 못했습니다",
        retry: true,
      });
    });
  }

  test("Admin stale at 390", async ({ page }) => {
    await openAdminToday(
      page,
      390,
      { listState: "stale", caseCount: 3 },
      "/admin/today?case=case-notification&mode=detail",
    );
    await expect(page.getByText("최신 상태가 아닙니다. 다시 확인한 뒤 작업을 이어가세요.")).toBeVisible();
    const back = page.getByRole("button", { name: "목록으로" });
    await expect(back).toBeVisible();
    await assertNoHorizontalOverflow(page);
    const detailTitle = page.getByRole("heading", { name: "! 알림 전달 지연" }).first();
    await assertMinWidth(detailTitle, titleMinWidth(390));
    await assertKeyboardReachable(page, back);
    await assertSafeArea(page, 390, page.locator(".admin-mobile-navigation"));
  });

  test("Admin forbidden at 1440", async ({ page }) => {
    await openAdminToday(page, 1440, { listState: "forbidden" });
    await assertAdminGeometry(page, 1440, {
      caseCount: 0,
      errorTitle: "권한이 없습니다",
    });
  });

  for (const width of DENSITY_WIDTHS) {
    for (const workboxItems of [0, 4, 12] as const) {
      test(`Host prep workbox ${workboxItems} at ${width}${workboxItems === 4 ? " including reduced motion" : ""}`, async ({ page }) => {
        if (workboxItems === 4) await page.emulateMedia({ reducedMotion: "reduce" });
        await openHost(page, width, HOST_PREP, { workboxItems });
        await assertHostGeometry(page, width, {
          workboxItems,
          emptyWorkbox: workboxItems === 0,
          disclosure: hostDisclosure(workboxItems, width),
        });
      });
    }
  }

  for (const width of EXTRA_BREAKPOINTS) {
    test(`Host prep normal at ${width}`, async ({ page }) => {
      await openHost(page, width, HOST_PREP, { workboxItems: 4 });
      await assertHostGeometry(page, width, {
        workboxItems: 4,
        disclosure: hostDisclosure(4, width),
      });
    });
  }

  for (const copy of COPY_VARIANTS) {
    test(`Host prep ${copy} at 320`, async ({ page }) => {
      await openHost(page, 320, HOST_PREP, { workboxItems: 4, copy: copy as HostApprovedCopyVariant });
      await assertHostGeometry(page, 320, {
        workboxItems: 4,
        disclosure: hostDisclosure(4, 320),
      });
    });
  }

  for (const width of DENSITY_WIDTHS) {
    test(`Host no-current-meeting at ${width}`, async ({ page }) => {
      await openHost(page, width, HOST_PREP, {
        currentMeeting: "none" as HostApprovedCurrentMeeting,
        workboxItems: 4,
      });
      await assertHostGeometry(page, width, { workboxItems: 4, emptyMeeting: true });
    });
  }

  test("Host partial source failure at 1440", async ({ page }) => {
    await openHost(page, 1440, HOST_PREP, {
      workboxItems: 4,
      workboxState: "partial" as HostApprovedWorkboxState,
    });
    await expect(page.getByRole("region", { name: "일부 운영 정보 불러오기 실패" }))
      .toContainText("지난 모임 기록 마감 정보를 불러오지 못했어요.");
    await assertHostGeometry(page, 1440, { workboxItems: 4, disclosure: false });
  });

  test("Host full workbox failure at 390", async ({ page }) => {
    await openHost(page, 390, HOST_PREP, {
      workboxItems: 4,
      workboxState: "unavailable" as HostApprovedWorkboxState,
    });
    await assertHostGeometry(page, 390, { workboxItems: 4, workboxError: true });
  });

  test("Host live conflict at 390", async ({ page }) => {
    await openHost(page, 390, HOST_LIVE, {
      workboxItems: 4,
      liveMutation: "conflict" as HostApprovedLiveMutation,
    });
    const choice = page.getByRole("button", { name: "김하늘 불참" });
    await expect(choice).toBeVisible();
    await choice.click();
    const recovery = page.getByRole("alert", { name: "출석 변경 충돌" });
    await expect(recovery).toBeVisible({ timeout: 10_000 });
    await expect(recovery.getByRole("button", { name: "내 선택으로 다시 저장" })).toBeVisible();
    await assertHostGeometry(page, 390, { workboxItems: 4, disclosure: hostDisclosure(4, 390) });
    await assertKeyboardReachable(page, recovery.getByRole("button", { name: "내 선택으로 다시 저장" }));
  });

  test("Host live unknown outcome at 1440", async ({ page }) => {
    await openHost(page, 1440, HOST_LIVE, {
      workboxItems: 4,
      liveMutation: "unknown" as HostApprovedLiveMutation,
    });
    await expect(page.locator(".rm-host-operating-room")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("region", { name: "현장 현황" })).toBeVisible();
    await assertHostGeometry(page, 1440, { workboxItems: 4, disclosure: false });
    await page.setViewportSize({ width: 390, height: HOST_MOBILE_HEIGHT });
    const choice = page.getByRole("button", { name: "김하늘 불참" });
    await expect(choice).toBeVisible();
    await choice.click();
    await page.setViewportSize({ width: 1440, height: HOST_DESKTOP_HEIGHT });
    const unknown = page.getByRole("status", { name: "출석 변경 결과 확인" });
    await expect(unknown).toBeVisible({ timeout: 10_000 });
    const reconcile = page.getByRole("button", { name: "최신 출석 확인" });
    await expect(reconcile).toBeVisible();
    await assertNoHorizontalOverflow(page);
    await assertKeyboardReachable(page, reconcile);
  });
});

test.describe("approved-route stress 200% proxy", () => {
  test.use({ deviceScaleFactor: 2 });

  test("Admin Today 3 at 195", async ({ page }) => {
    await openAdminToday(page, 195, { caseCount: 3 });
    await assertAdminGeometry(page, 195, { caseCount: 3, disclosure: false });
  });

  test("Admin Today 3 at 720", async ({ page }) => {
    await openAdminToday(page, 720, { caseCount: 3 });
    await assertAdminGeometry(page, 720, { caseCount: 3, disclosure: false });
  });

  test("Host prep 4 at 195", async ({ page }) => {
    await openHost(page, 195, HOST_PREP, { workboxItems: 4 });
    await assertHostGeometry(page, 195, {
      workboxItems: 4,
      disclosure: hostDisclosure(4, 195),
    });
  });

  test("Host prep 4 at 720", async ({ page }) => {
    await openHost(page, 720, HOST_PREP, { workboxItems: 4 });
    await assertHostGeometry(page, 720, {
      workboxItems: 4,
      disclosure: hostDisclosure(4, 720),
    });
  });
});
