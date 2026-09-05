import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator, Page } from "@playwright/test";
import type { ReactElement } from "react";
import { MemoryRouter, Route, Routes } from "react-router";
import { GlobalSpaceSwitcher } from "@/shared/ui/global-space-switcher";
import {
  expectGeometryWithinTolerance,
  expectLocatorGeometry,
  isSemanticDocumentOrder,
  type ApprovedRegion,
} from "@/tests/e2e/support/approved-mockup-contract";
import { expectNoTextOverlap } from "@/tests/ct/support/expect-no-overlap";
import {
  VISUAL_AUTHORITY_VIEWPORTS,
  expectMinimumTargetSize,
  expectNoHorizontalOverflow,
  expectNoSeriousAccessibilityFindings,
  expectReducedMotion,
  expectVisibleFocus,
} from "@/tests/e2e/support/visual-authority-contract";
import { AdminShellLayout } from "../route/admin-shell-layout";
import { AdminAuditLedger } from "./admin-audit-ledger";
import { AdminClubsLedger } from "./admin-clubs-ledger";
import { AdminEditorialLedgerCtHarness, TodayLedgerCtNode } from "./admin-editorial-ledger-ct-harness";
import { AdminPageFrame } from "./admin-page-frame";
import { AdminStatePanel } from "./admin-state-panel";
import { ADMIN_TODAY_DESCRIPTION } from "./admin-today-ledger";
import {
  ADMIN_SHELL_VISUAL_CAPABILITIES,
  ADMIN_SHELL_VISUAL_SPACE_OPTIONS,
  EDITORIAL_LEDGER_LONG_CLUB_NAME,
  EDITORIAL_LEDGER_LONG_TAKEDOWN_LIMITATION,
  EDITORIAL_LEDGER_LONG_TODAY_TITLE,
  clubsEmptyEvidence,
  clubsPaginationFailure,
  clubsTabletLedger,
  healthEmptyEvidence,
  emergencyTakedownBlockedPreview,
  emergencyTakedownIdle,
  noopEditorialLedgerHandler,
  reviewAuditEmptyEvidence,
  reviewAuditLedger,
  reviewAuditPaginationFailure,
  serviceHealthLedger,
  todayDesktopLedger,
  todayEmptyAllowedActions,
  todayEmptyEvidence,
  todayFailedSources,
  todayMobileCaseDetail,
  todayPendingNew,
  todayUnknownOutcome,
  type ClubsLedgerFixture,
  type HealthLedgerFixture,
  type ReviewAuditFixture,
  type TodayLedgerFixture,
} from "./admin-editorial-ledger.fixtures";
import { AdminHealthGrid } from "./admin-health-grid";
import { AdminPublicTakedownWorkbench } from "./admin-public-takedown-workbench";
import {
  ADMIN_BACK_MOBILE_GEOMETRY as BACK_MOBILE_GEOMETRY,
  ADMIN_DETAIL_DOCKET_MOBILE_GEOMETRY as DETAIL_DOCKET_MOBILE_GEOMETRY,
  ADMIN_DOCKET_DESKTOP_GEOMETRY as DOCKET_DESKTOP_GEOMETRY,
  ADMIN_FIRST_ROW_MOBILE_GEOMETRY as FIRST_ROW_MOBILE_GEOMETRY,
  ADMIN_HEADER_DESKTOP_GEOMETRY as HEADER_DESKTOP_GEOMETRY,
  ADMIN_HEADER_MOBILE_GEOMETRY as HEADER_MOBILE_GEOMETRY,
  ADMIN_LEDGER_DOCKET_GEOMETRY as LEDGER_DOCKET_GEOMETRY,
  ADMIN_LEDGER_LIST_GEOMETRY as LEDGER_LIST_GEOMETRY,
  ADMIN_NAV_MOBILE_GEOMETRY as NAV_MOBILE_GEOMETRY,
  ADMIN_QUEUE_DESKTOP_GEOMETRY as QUEUE_DESKTOP_GEOMETRY,
  ADMIN_RAIL_DESKTOP_GEOMETRY as NAV_DESKTOP_GEOMETRY,
  ADMIN_SERVICE_TABLE_GEOMETRY as SERVICE_TABLE_GEOMETRY,
} from "@/tests/e2e/support/approved-route-geometry";

const APPROVED_DESKTOP_VIEWPORT = { width: 1672, height: 941 } as const;
const APPROVED_MOBILE_VIEWPORT = { width: 390, height: 844 } as const;
const RECOMMENDED_DESKTOP_GEOMETRY = { x: 859, y: 621, width: 773, height: 24 } as const;
const INTERMEDIATE_VIEWPORTS = [
  { width: 320, height: 720 },
  { width: 768, height: 900 },
  { width: 900, height: 900 },
  { width: 1024, height: 900 },
  { width: 1200, height: 900 },
  { width: 1440, height: 960 },
] as const;

async function mountEditorial(
  mount: (component: ReactElement) => Promise<Locator>,
  page: Page,
  node: ReactElement,
  viewport: { width: number; height: number },
) {
  await page.setViewportSize(viewport);
  await page.emulateMedia({ colorScheme: "light" });
  const component = await mount(
    <MemoryRouter>
      <AdminEditorialLedgerCtHarness>{node}</AdminEditorialLedgerCtHarness>
    </MemoryRouter>,
  );
  await expectReducedMotion(page);
  await expectNoNestedLiveRegions(component);
  await expectNoHorizontalOverflow(page);
  return component;
}

function adminShellFixture(input: {
  outlet: ReactElement;
  routePath?: string;
  currentNavigationOwner?: "today" | "clubs" | "service" | "records";
  alarmHeadline?: string;
  attentionCount?: number;
}) {
  const routePath = input.routePath ?? "today";
  return (
    <MemoryRouter initialEntries={[`/admin/${routePath}`]}>
      <Routes>
        <Route
          path="/admin"
          element={
            <AdminShellLayout
              workspaceAccountLabel="운영자"
              spaceSwitcher={
                <GlobalSpaceSwitcher
                  currentIdentity={{ productSpace: "platform" }}
                  options={ADMIN_SHELL_VISUAL_SPACE_OPTIONS}
                  onSelect={async () => ({ status: "selected" })}
                />
              }
              spaceControlEpoch={0}
              capabilities={ADMIN_SHELL_VISUAL_CAPABILITIES}
              currentNavigationOwner={input.currentNavigationOwner ?? "today"}
              routePath={routePath}
              breadcrumbExtra={null}
              alarm={{
                summary: {
                  attention: {
                    count: input.attentionCount ?? 3,
                    headline: input.alarmHeadline ?? "알림 전달 지연",
                  },
                  unacknowledged: input.attentionCount ?? 3,
                  serviceState: "ok",
                  asOf: "2026-08-26T10:00:00Z",
                },
                state: "ready",
              }}
              accountBusy={false}
              accountError={null}
              onOtherAccountLogin={() => undefined}
              outletContext={{ authorityEpoch: 0 }}
            />
          }
        >
          <Route path="*" element={input.outlet} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

function todayShellFixture(outlet: ReactElement) {
  return adminShellFixture({ outlet });
}

async function mountApprovedShell(
  mount: (component: ReactElement) => Promise<Locator>,
  page: Page,
  node: ReactElement,
) {
  await page.setViewportSize(APPROVED_DESKTOP_VIEWPORT);
  await page.emulateMedia({ colorScheme: "light" });
  await page.addStyleTag({
    content: `
      html, body, #root {
        margin: 0 !important;
        padding: 0 !important;
        width: 100% !important;
        height: 100% !important;
        overflow: hidden !important;
      }
    `,
  });
  const component = await mount(node);
  await page.evaluate(() => document.fonts.ready);
  await expectReducedMotion(page);
  await expectNoNestedLiveRegions(component);
  await expectNoHorizontalOverflow(page);
  return component;
}

async function mountTodayApproved(
  mount: (component: ReactElement) => Promise<Locator>,
  page: Page,
  fixture: TodayLedgerFixture,
  viewport: { width: number; height: number },
) {
  await page.setViewportSize(viewport);
  await page.emulateMedia({ colorScheme: "light" });
  await page.addStyleTag({
    content: `
      html, body, #root {
        margin: 0 !important;
        padding: 0 !important;
        width: 100% !important;
        height: 100% !important;
        overflow: hidden !important;
      }
    `,
  });
  const component = await mount(todayShellFixture(todayNode(fixture)));
  await page.evaluate(() => document.fonts.ready);
  await expectReducedMotion(page);
  await expectNoNestedLiveRegions(component);
  await expectNoHorizontalOverflow(page);
  return component;
}

async function regionFromLocator(
  locator: Locator,
  name: string,
  expected: ApprovedRegion["expected"],
  toleranceCssPx: 2 | 4,
): Promise<ApprovedRegion> {
  const box = await locator.boundingBox();
  if (!box) throw new Error(`${name} has no bounding box`);
  const actual = { x: box.x, y: box.y, width: box.width, height: box.height };
  try {
    expectGeometryWithinTolerance(actual, expected, toleranceCssPx);
  } catch (error) {
    throw new Error(
      `${name} actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)}`,
      { cause: error },
    );
  }
  return { name, actual, expected, toleranceCssPx };
}

async function expectNoNestedLiveRegions(component: Locator): Promise<void> {
  const nested = await component.evaluate((root) => {
    const selector = "[aria-live], [role='alert'], [role='status'], [role='log']";
    const liveRoles = new Set(["alert", "status", "log"]);
    const isLive = (element: Element) => {
      const ariaLive = element.getAttribute("aria-live")?.trim().toLowerCase();
      if (ariaLive === "off") return false;
      if (ariaLive === "polite" || ariaLive === "assertive") return true;
      const role = element.getAttribute("role")?.trim().toLowerCase();
      return role !== undefined && liveRoles.has(role);
    };
    return [...root.querySelectorAll(selector)]
      .filter((element) => {
        if (!isLive(element)) return false;
        for (let parent = element.parentElement; parent && parent !== root; parent = parent.parentElement) {
          if (isLive(parent)) return true;
        }
        return false;
      })
      .map((element) => element.tagName.toLowerCase());
  });
  expect(nested).toEqual([]);
}

function todayNode(fixture: TodayLedgerFixture) {
  return <TodayLedgerCtNode fixture={fixture} />;
}

function clubsNode(fixture: ClubsLedgerFixture) {
  return (
    <AdminClubsLedger
      clubs={fixture.clubs}
      filters={fixture.filters}
      searchDraft={fixture.searchDraft}
      pageState={fixture.pageState}
      canCreateClub={fixture.canCreateClub}
      onboardingHref={fixture.onboardingHref}
      focusId={fixture.focusId}
      scrollTop={fixture.scrollTop}
      hasNextPage={fixture.hasNextPage}
      loadingMore={fixture.loadingMore}
      loadMoreError={fixture.loadMoreError}
      tabCounts={fixture.tabCounts}
      onSearchChange={noopEditorialLedgerHandler}
      onFilterChange={noopEditorialLedgerHandler}
      onRetry={noopEditorialLedgerHandler}
      onLoadMore={noopEditorialLedgerHandler}
      onScrollChange={noopEditorialLedgerHandler}
    />
  );
}

function healthNode(fixture: HealthLedgerFixture) {
  return (
    <AdminHealthGrid
      snapshot={fixture.snapshot}
      loading={fixture.loading}
      error={fixture.error}
      fetching={fixture.fetching}
      onRefresh={noopEditorialLedgerHandler}
    />
  );
}

function reviewNode(fixture: ReviewAuditFixture) {
  return (
    <AdminAuditLedger
      page={fixture.page}
      filters={{ range: fixture.page.filters.range === "24h" ? "24h" : "7d" }}
      loading={false}
      error={null}
      nextPageError={fixture.nextPageError}
      loadingMore={fixture.loadingMore}
      sensitiveSearch={{
        value: "",
        canSearch: fixture.canSearchSensitive,
        pending: false,
        error: null,
        active: false,
        onChange: noopEditorialLedgerHandler,
        onSubmit: noopEditorialLedgerHandler,
        onClear: noopEditorialLedgerHandler,
      }}
      selectedId={fixture.selectedId}
      detailOpen={fixture.detailOpen}
      onSelect={noopEditorialLedgerHandler}
      onCloseDetail={noopEditorialLedgerHandler}
      onFilterChange={noopEditorialLedgerHandler}
      onLoadMore={noopEditorialLedgerHandler}
      onRetryLoadMore={noopEditorialLedgerHandler}
    />
  );
}

function takedownNode(state: typeof emergencyTakedownIdle | typeof emergencyTakedownBlockedPreview) {
  return (
    <AdminPublicTakedownWorkbench
      canOperate
      state={state}
      pending={false}
      error={null}
      desktopHandoff={{
        href: "/admin/public-takedown",
        status: "idle",
        onCopy: noopEditorialLedgerHandler,
      }}
      onPreview={noopEditorialLedgerHandler}
      onConfirm={noopEditorialLedgerHandler}
    />
  );
}

test("Today L1 locks the approved desktop composition", async ({ mount, page }) => {
  test.setTimeout(90_000);
  expect(todayDesktopLedger.capabilities).toEqual(["VIEW_TODAY"]);
  expect(todayDesktopLedger.allowedActions).toEqual(["ACKNOWLEDGE", "SNOOZE", "RESOLVE"]);
  const component = await mountTodayApproved(mount, page, todayDesktopLedger, APPROVED_DESKTOP_VIEWPORT);
  const queue = component.getByRole("region", { name: "운영 케이스 큐" });
  const docket = component.getByRole("region", { name: "운영 케이스 상세" });
  const recommended = docket.getByRole("heading", { name: "권장 처리" });
  await regionFromLocator(queue, "queue", QUEUE_DESKTOP_GEOMETRY, 4);
  await regionFromLocator(docket, "docket", DOCKET_DESKTOP_GEOMETRY, 4);
  await regionFromLocator(recommended, "recommended", RECOMMENDED_DESKTOP_GEOMETRY, 2);
  await expectLocatorGeometry(queue, QUEUE_DESKTOP_GEOMETRY, 4);
  await expectLocatorGeometry(docket, DOCKET_DESKTOP_GEOMETRY, 4);
  await expectLocatorGeometry(recommended, RECOMMENDED_DESKTOP_GEOMETRY, 2);
  await expect(component.getByRole("heading", { name: "오늘 할 일" }).first()).toBeVisible();
  await expect(component.getByText("알림 전달 지연", { exact: true }).first()).toBeInViewport();
  expect(await isSemanticDocumentOrder([
    docket.getByRole("heading", { name: "무슨 일이 있었나요?" }),
    docket.getByRole("heading", { name: "영향 범위" }),
    docket.getByRole("heading", { name: "확인된 내용" }),
    docket.getByRole("heading", { name: "권장 처리" }),
    docket.getByRole("heading", { name: "처리 방법" }),
  ])).toBe(true);
  await expect(component.getByRole("button", { name: "확인함" })).toBeEnabled();
  await expect(component.locator(".admin-receipt-timeline")).toHaveCount(0);
  const primary = component.getByRole("button", { name: "확인함" });
  await expectMinimumTargetSize(primary);
  await primary.focus();
  await expectVisibleFocus(primary);
});

test("Clubs locks the approved desktop ledger", async ({ mount, page }) => {
  test.setTimeout(90_000);
  expect(clubsTabletLedger.capabilities).toEqual(["VIEW_CLUBS", "VIEW_CLUB_OPERATIONS", "CREATE_CLUB"]);
  expect(clubsTabletLedger.canCreateClub).toBe(true);
  const component = await mountApprovedShell(
    mount,
    page,
    adminShellFixture({
      outlet: clubsNode(clubsTabletLedger),
      routePath: "clubs",
      currentNavigationOwner: "clubs",
      alarmHeadline: "설정 확인 필요",
      attentionCount: 2,
    }),
  );
  const firstRow = component.getByRole("link", { name: "문장과 사람들" });
  await expect(component.getByRole("heading", { name: "클럽 찾기" })).toBeVisible();
  await expectNoTextOverlap(component.locator(".admin-clubs-ledger__list-header"));
  await expect(component.getByRole("region", { name: "클럽 관리 목록" })).toBeVisible();
  await expect(component.getByRole("region", { name: "선택한 클럽" })).toBeVisible();
  await expect(firstRow).toBeVisible();
  await expect(component.getByText("설정 확인 필요", { exact: true })).toBeVisible();
  await expect(component.getByRole("tab", { name: /전체/ })).toBeVisible();
  await expect(component.locator("details.admin-club-management__filters")).not.toHaveAttribute("open");
  await expect(component.getByRole("link", { name: EDITORIAL_LEDGER_LONG_CLUB_NAME })).toHaveCount(0);
  const create = component.getByRole("link", { name: "새 클럽" });
  await expect(create).toBeVisible();
  await regionFromLocator(component.locator(".admin-shell__header"), "header", HEADER_DESKTOP_GEOMETRY, 4);
  await regionFromLocator(component.locator(".admin-shell__nav"), "nav", NAV_DESKTOP_GEOMETRY, 4);
  await regionFromLocator(component.locator(".admin-clubs-ledger__list"), "finder", LEDGER_LIST_GEOMETRY, 2);
  await regionFromLocator(component.locator(".admin-club-management__docket"), "docket", LEDGER_DOCKET_GEOMETRY, 2);
  await regionFromLocator(firstRow, "first-row", { x: 332, y: 256, width: 342, height: 44 }, 2);
  await expectMinimumTargetSize(create);
  await create.focus();
  await expectVisibleFocus(create);
});

test("Service health locks the approved desktop ledger", async ({ mount, page }) => {
  test.setTimeout(90_000);
  expect(serviceHealthLedger.capabilities).toEqual(["VIEW_SERVICE_HEALTH"]);
  const component = await mountApprovedShell(
    mount,
    page,
    adminShellFixture({
      outlet: healthNode(serviceHealthLedger),
      routePath: "health",
      currentNavigationOwner: "service",
      alarmHeadline: "알림 전달을 확인해야 합니다",
      attentionCount: 1,
    }),
  );
  const firstRow = component.getByText("알림", { exact: true }).first();
  await expect(component.getByText("알림 전달을 확인해야 합니다")).toBeVisible();
  await expect(component.getByRole("columnheader", { name: "서비스" })).toBeVisible();
  await expect(firstRow).toBeVisible();
  await expect(component.getByRole("link", { name: "실패한 안내만 다시 보내기" })).toBeVisible();
  await expect(component.locator(".admin-case-docket")).toHaveCount(0);
  await expect(component.locator(".admin-action-dock")).toHaveCount(0);
  await expect(component.locator(".admin-receipt-timeline")).toHaveCount(0);
  const refresh = component.getByRole("button", { name: "새로 확인" }).first();
  await regionFromLocator(component.locator(".admin-shell__header"), "header", HEADER_DESKTOP_GEOMETRY, 4);
  await regionFromLocator(component.locator(".admin-shell__nav"), "nav", NAV_DESKTOP_GEOMETRY, 4);
  await regionFromLocator(component.locator("section.admin-service-status table"), "table", SERVICE_TABLE_GEOMETRY, 2);
  await regionFromLocator(component.locator(".admin-service-status__attention").first(), "attention-row", { x: 380, y: 258, width: 1174, height: 105 }, 2);
  await expectMinimumTargetSize(refresh);
  await refresh.focus();
  await expectVisibleFocus(refresh);
});

test("Review audit locks the approved desktop ledger", async ({ mount, page }) => {
  test.setTimeout(90_000);
  expect(reviewAuditLedger.capabilities).toEqual(["VIEW_AUDIT"]);
  expect(reviewAuditLedger.canSearchSensitive).toBe(false);
  const component = await mountApprovedShell(
    mount,
    page,
    adminShellFixture({
      outlet: reviewNode(reviewAuditLedger),
      routePath: "audit",
      currentNavigationOwner: "records",
      alarmHeadline: "누가 무엇을 왜 처리했는지 확인합니다",
      attentionCount: 0,
    }),
  );
  const firstRow = component.getByRole("listitem", { name: /알림 다시 보내기 완료|알림 재처리를 확정했습니다/ });
  await expect(component.getByRole("heading", { name: "처리 기록", exact: true })).toBeVisible();
  await expect(component.getByRole("searchbox", { name: "기록 찾기" })).toBeVisible();
  await expect(component.locator("details.admin-audit__disclosure")).not.toHaveAttribute("open");
  await expect(component.getByText("선택한 기록")).toBeVisible();
  await expect(component.getByRole("region", { name: "감사 이벤트 상세" })).toBeVisible();
  await expect(firstRow).toBeVisible();
  await expect(component.getByRole("searchbox", { name: "민감 대상 검색" })).toHaveCount(0);
  await regionFromLocator(component.locator(".admin-shell__header"), "header", HEADER_DESKTOP_GEOMETRY, 4);
  await regionFromLocator(component.locator(".admin-shell__nav"), "nav", NAV_DESKTOP_GEOMETRY, 4);
  await regionFromLocator(component.locator(".admin-audit__list"), "list", LEDGER_LIST_GEOMETRY, 2);
  await regionFromLocator(component.locator(".admin-audit__detail"), "docket", LEDGER_DOCKET_GEOMETRY, 2);
  await regionFromLocator(firstRow, "first-row", { x: 260, y: 297, width: 536, height: 112 }, 2);
  await expectMinimumTargetSize(firstRow);
  await firstRow.focus();
  await expectVisibleFocus(firstRow);
});

test.describe("approved mobile Today", () => {
  test.use({ deviceScaleFactor: 853 / 390 });

  test("Today mobile list locks the approved 390 composition", async ({ mount, page }) => {
    test.setTimeout(90_000);
    const component = await mountTodayApproved(
      mount,
      page,
      { ...todayDesktopLedger, mode: "list" },
      APPROVED_MOBILE_VIEWPORT,
    );
    const header = component.locator(".admin-shell__header");
    const nav = component.getByRole("navigation", { name: "Admin 모바일 메뉴" });
    const firstRow = component.getByRole("button", { name: /알림 전달 지연/ }).first();
    await regionFromLocator(header, "header", HEADER_MOBILE_GEOMETRY, 4);
    await regionFromLocator(nav, "nav", NAV_MOBILE_GEOMETRY, 4);
    await regionFromLocator(firstRow, "first-row", FIRST_ROW_MOBILE_GEOMETRY, 2);
    await expectLocatorGeometry(header, HEADER_MOBILE_GEOMETRY, 4);
    await expectLocatorGeometry(nav, NAV_MOBILE_GEOMETRY, 4);
    await expectLocatorGeometry(firstRow, FIRST_ROW_MOBILE_GEOMETRY, 2);
    await expect(component.getByText("알림 전달 지연", { exact: true }).first()).toBeInViewport();
    await expect(component.getByRole("navigation", { name: "Admin 모바일 메뉴" })).toBeVisible();
    await expect(component.locator("details").filter({ hasText: "필터와 신호 상태" })).not.toHaveAttribute("open");
    await expect(component.locator(".admin-today-ledger__columns")).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
  });

  test("Today case detail locks the approved 390 composition", async ({ mount, page }) => {
    test.setTimeout(90_000);
    expect(todayMobileCaseDetail.allowedActions).toEqual(["ACKNOWLEDGE", "SNOOZE", "RESOLVE"]);
    const component = await mountTodayApproved(mount, page, todayMobileCaseDetail, APPROVED_MOBILE_VIEWPORT);
    const docket = component.getByRole("region", { name: "운영 케이스 상세" });
    const back = component.getByRole("button", { name: "목록으로" });
    const nav = component.getByRole("navigation", { name: "Admin 모바일 메뉴" });
    await back.evaluate((element) => element.blur());
    await regionFromLocator(back, "back", BACK_MOBILE_GEOMETRY, 4);
    await regionFromLocator(docket, "docket", DETAIL_DOCKET_MOBILE_GEOMETRY, 4);
    await regionFromLocator(nav, "nav", NAV_MOBILE_GEOMETRY, 4);
    await expectLocatorGeometry(back, BACK_MOBILE_GEOMETRY, 4);
    await expectLocatorGeometry(nav, NAV_MOBILE_GEOMETRY, 4);
    await expect(component.getByText("알림 전달 지연", { exact: true }).first()).toBeInViewport();
    await expect(component.getByRole("navigation", { name: "Admin 모바일 메뉴" })).toBeVisible();
    await expect(back).toBeVisible();
    await expect(back).toContainText("오늘 할 일");
    await expect(docket).toBeVisible();
    expect(await isSemanticDocumentOrder([
      docket.getByRole("heading", { name: "무슨 일이 있었나요?" }),
      docket.getByRole("heading", { name: "영향 범위" }),
      docket.getByRole("heading", { name: "확인된 내용" }),
      docket.getByRole("heading", { name: "권장 처리" }),
      docket.getByRole("heading", { name: "처리 방법" }),
    ])).toBe(true);
    await expect(component.getByRole("button", { name: "목록으로" })).toBeVisible();
    await expect(component.getByRole("button", { name: "확인함" })).toBeEnabled();
    await expect(component.getByText("다른 처리")).toBeVisible();
    await expect(component.locator(".admin-today-ledger__columns")).toHaveCount(0);
    await expect(component.locator(".admin-receipt-timeline")).toHaveCount(0);
    await expectMinimumTargetSize(back);
    await back.focus();
    await expectVisibleFocus(back);
  });
});

test("Emergency takedown keeps the blocked L3 review calm at 1440", async ({ mount, page }) => {
  const component = await mountEditorial(
    mount,
    page,
    takedownNode(emergencyTakedownBlockedPreview),
    VISUAL_AUTHORITY_VIEWPORTS.desktopWide,
  );
  await expect(component.getByRole("heading", { name: "긴급 공개 회수" })).toBeVisible();
  await expect(component.getByRole("heading", { name: "회수 대상을 마지막으로 확인하세요" })).toBeVisible();
  await expect(component.getByText(EDITORIAL_LEDGER_LONG_TAKEDOWN_LIMITATION)).toBeVisible();
  await expect(component.getByRole("button", { name: "긴급 회수 확인" })).toBeDisabled();
  await expect(component.getByRole("region", { name: "데스크톱에서 이어서 처리" })).toBeHidden();
  await expect(component).toHaveScreenshot("editorial-ledger-emergency-takedown-1440.png");
});

test("Emergency takedown offers desktop handoff first at 390", async ({ mount, page }) => {
  const component = await mountEditorial(
    mount,
    page,
    takedownNode(emergencyTakedownIdle),
    VISUAL_AUTHORITY_VIEWPORTS.mobile,
  );
  const handoff = component.getByRole("region", { name: "데스크톱에서 이어서 처리" });
  const copy = component.getByRole("button", { name: "데스크톱용 주소 복사" });
  await expect(handoff).toBeVisible();
  await expect(copy).toBeVisible();
  await expectMinimumTargetSize(copy);
  await expect(component.getByRole("region", { name: "이 기기에서 직접 처리" })).toBeVisible();
  await expect(component).toHaveScreenshot("editorial-ledger-emergency-takedown-390.png");
  await copy.focus();
  await expectVisibleFocus(copy);
});

test("Today keeps the 320 queue title intact without a locator or horizontal overflow", async ({ mount, page }) => {
  const fixture = {
    ...todayDesktopLedger,
    mode: "list" as const,
    view: {
      ...todayDesktopLedger.view,
      items: todayDesktopLedger.view.items.map((item, index) => ({
        ...item,
        locatorLabel: String(index + 1).padStart(2, "0"),
        mobileMetaLabel: item.mobileMetaLabel ?? "알림 · 2시간 전",
      })),
    },
  };
  const component = await mountEditorial(
    mount,
    page,
    todayNode(fixture),
    VISUAL_AUTHORITY_VIEWPORTS.mobileNarrow,
  );
  const locator = component.locator(".admin-operations-queue__locator").first();
  await expect(locator).toBeAttached();
  await expect(locator).toBeHidden();
  await expect(component.locator(".admin-operations-queue__title").first()).toBeVisible();
  await expect(component.locator(".admin-operations-queue__mobile-meta").first()).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

async function expectVisibleTargetsMeetMinimum(root: Locator) {
  for (const control of await root.locator("button:visible, a[href]:visible, select:visible").all()) {
    await expectMinimumTargetSize(control);
  }
}

async function expectCopyWraps(locator: Locator) {
  await expect(locator).toBeVisible();
  const metrics = await locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      overflowWrap: style.overflowWrap,
      scrollWidth: Math.ceil((element as HTMLElement).scrollWidth),
      clientWidth: (element as HTMLElement).clientWidth,
    };
  });
  expect(["anywhere", "break-word"]).toContain(metrics.overflowWrap);
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
}

for (const viewport of INTERMEDIATE_VIEWPORTS) {
  test(`Today follows observed content width without overflow at ${viewport.width}px`, async ({ mount, page }) => {
    const component = await mountEditorial(
      mount,
      page,
      <main>{todayNode({ ...todayDesktopLedger, mode: viewport.width < 960 ? "list" : undefined })}</main>,
      viewport,
    );
    const queue = component.getByRole("region", { name: "운영 케이스 큐" });
    await expect(component.getByRole("heading", { name: "오늘 할 일" }).first()).toBeVisible();
    await expect(queue).toBeVisible();
    const firstTask = component.getByRole("button", { name: /알림 전달 지연/ });
    const box = await firstTask.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y + Math.min(box!.height, 44)).toBeLessThanOrEqual(viewport.height);
    if (viewport.width >= 1024) {
      expect(await isSemanticDocumentOrder([
        queue,
        component.getByRole("region", { name: "운영 케이스 상세" }),
      ])).toBe(true);
    } else {
      expect(await isSemanticDocumentOrder([
        component.getByRole("heading", { name: "오늘 할 일", level: 1 }),
        queue,
      ])).toBe(true);
    }
    await firstTask.focus();
    await expectVisibleFocus(firstTask);
    await expectVisibleTargetsMeetMinimum(component.locator(".admin-today-ledger"));
    await expectNoHorizontalOverflow(page);
    expect(await expectNoSeriousAccessibilityFindings(page)).toEqual([]);
    const layout = component.locator(".admin-today-ledger");
    await expect(layout).toHaveAttribute("data-content-layout", viewport.width >= 1024 ? "split" : "flow");
    if (viewport.width < 1024) {
      await expect(component.getByRole("region", { name: "운영 케이스 상세" })).toHaveCount(0);
      await expect(component.locator(".admin-today-ledger__columns")).toHaveCount(0);
    } else {
      await expect(component.getByRole("region", { name: "운영 케이스 상세" })).toBeVisible();
      await expect(component.locator(".admin-operation-actions .btn-primary")).toHaveCount(1);
    }
  });
}

test("empty evidence, failed sources, pending-new, pagination failure and unknown-outcome stay inside the contract", async ({ mount, page }) => {
  const component = await mountEditorial(
    mount,
    page,
    <div>
      {todayNode(todayEmptyEvidence)}
      {todayNode(todayFailedSources)}
      {todayNode(todayPendingNew)}
      {todayNode(todayUnknownOutcome)}
      {todayNode(todayEmptyAllowedActions)}
      {clubsNode(clubsPaginationFailure)}
      {clubsNode(clubsEmptyEvidence)}
      {healthNode(healthEmptyEvidence)}
      {reviewNode(reviewAuditPaginationFailure)}
      {reviewNode(reviewAuditEmptyEvidence)}
    </div>,
    VISUAL_AUTHORITY_VIEWPORTS.desktop,
  );

  await expect(component.getByText("지금은 처리할 운영 케이스가 없습니다")).toBeVisible();
  await expect(component.getByText("일부만 확인됨")).toBeVisible();
  await component.locator("details.admin-today-controls").evaluateAll((nodes) => {
    for (const node of nodes) (node as HTMLDetailsElement).open = true;
  });
  await expect(component.getByRole("button", { name: "AI 작업 다시 확인" })).toBeVisible();
  await expect(component.getByRole("button", { name: "모임 마감 다시 확인" })).toBeVisible();
  await expect(component.getByRole("button", { name: "새 항목 2개 적용" })).toBeVisible();
  await expect(component.getByText("긴급 1건", { exact: true })).toBeVisible();
  const urgentNotice = component.locator(".admin-today-urgent-notice");
  await expect(urgentNotice).toHaveText("새 긴급 신호 1건");
  await expect(urgentNotice).toHaveAttribute("aria-live", "polite");
  await expect(component.getByRole("alert").filter({ hasText: "결과를 확인하지 못했습니다." })).toBeVisible();
  await expect(component.getByText("현재 역할은 상태 변경 없이 운영 근거만 확인할 수 있습니다.")).toBeVisible();
  await expect(component.getByText("다음 클럽을 불러오지 못했습니다.")).toBeVisible();
  await expect(component.getByRole("button", { name: "다시 불러오기" })).toBeVisible();
  await expect(component.getByText("조건에 맞는 클럽이 없습니다.")).toBeVisible();
  await expect(component.getByText("스냅샷을 불러오지 못했습니다")).toBeVisible();
  await expect(component.getByText("이어지는 페이지를 불러오지 못했습니다.")).toBeVisible();
  await expect(component.getByText("기록된 감사 이벤트가 없습니다.")).toBeVisible();
  await expect(component.getByRole("button", { name: "확인함" })).toHaveCount(3);
  await expect(component.getByRole("button", { name: "확인함", disabled: true })).toHaveCount(1);
  await expectMinimumTargetSize(component.getByRole("button", { name: "AI 작업 다시 확인" }));
});

test("Today loading keeps a stable shell without a safe action", async ({ mount, page }) => {
  const component = await mountApprovedShell(
    mount,
    page,
    adminShellFixture({
      outlet: (
        <AdminPageFrame heading="오늘 할 일" description={ADMIN_TODAY_DESCRIPTION}>
          <AdminStatePanel state="loading" title="운영 케이스를 불러오는 중입니다." description="" />
        </AdminPageFrame>
      ),
    }),
  );
  await expect(component.getByRole("heading", { name: "오늘 할 일", level: 1 })).toBeVisible();
  await expect(component.locator(".admin-state-panel--loading")).toContainText("운영 케이스를 불러오는 중입니다.");
  await expect(component.locator(".admin-shell__header")).toBeVisible();
  await expect(component.getByRole("navigation", { name: "Admin 콘솔" })).toBeVisible();
  await expect(component.getByRole("button", { name: "확인함" })).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
});

test("Today empty filtered state keeps disclosure recoverable", async ({ mount, page }) => {
  const component = await mountEditorial(
    mount,
    page,
    <main>{todayNode({
      ...todayEmptyEvidence,
      filters: { state: "open", severity: "", source: "", assignee: "" },
    })}</main>,
    INTERMEDIATE_VIEWPORTS[1],
  );
  await expect(component.getByRole("heading", { name: "오늘 할 일" }).first()).toBeVisible();
  await expect(component.getByText("조건에 맞는 운영 케이스가 없습니다")).toBeVisible();
  const disclosure = component.locator("details.admin-today-controls");
  await expect(disclosure).toHaveAttribute("open");
  await component.getByText("필터와 신호 상태").click();
  await expect(disclosure).not.toHaveAttribute("open");
  const clear = component.getByRole("button", { name: "필터 지우기" });
  await expect(clear).toBeVisible();
  await expectMinimumTargetSize(clear);
  await clear.focus();
  await expectVisibleFocus(clear);
  await expectNoHorizontalOverflow(page);
  expect(await expectNoSeriousAccessibilityFindings(page)).toEqual([]);
});

test("Today denied capability offers no safe action", async ({ mount, page }) => {
  const component = await mountApprovedShell(
    mount,
    page,
    adminShellFixture({
      outlet: (
        <AdminPageFrame heading="오늘 할 일" description={ADMIN_TODAY_DESCRIPTION}>
          <AdminStatePanel
            state="forbidden"
            title="권한이 없습니다"
            description="현재 역할로 운영 케이스를 확인할 수 없습니다. 권한을 확인해 주세요."
          />
        </AdminPageFrame>
      ),
    }),
  );
  await expect(component.getByRole("heading", { name: "오늘 할 일", level: 1 })).toBeVisible();
  await expect(component.getByRole("heading", { name: "권한이 없습니다" })).toBeVisible();
  await expect(component.getByRole("button", { name: "다시 보내기 검토" })).toHaveCount(0);
  await expect(component.getByRole("button", { name: "확인함" })).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
});

test("Today support read keeps the case without a safe action", async ({ mount, page }) => {
  const component = await mountEditorial(
    mount,
    page,
    <main>{todayNode(todayEmptyAllowedActions)}</main>,
    INTERMEDIATE_VIEWPORTS[3],
  );
  await expect(component.getByRole("heading", { name: "오늘 할 일" }).first()).toBeVisible();
  await expect(component.getByText("현재 역할은 상태 변경 없이 운영 근거만 확인할 수 있습니다.")).toBeVisible();
  await expect(component.getByRole("button", { name: "확인함" })).toHaveCount(0);
  expect(await isSemanticDocumentOrder([
    component.getByRole("heading", { name: "무슨 일이 있었나요?" }),
    component.getByRole("heading", { name: "영향 범위" }),
    component.getByRole("heading", { name: "확인된 내용" }),
    component.getByRole("heading", { name: "권장 처리" }),
    component.getByRole("heading", { name: "처리 방법" }),
  ])).toBe(true);
  await expectNoHorizontalOverflow(page);
});

test("Today stale unknown-outcome keeps a refresh path", async ({ mount, page }) => {
  const component = await mountEditorial(
    mount,
    page,
    <main>{todayNode(todayUnknownOutcome)}</main>,
    INTERMEDIATE_VIEWPORTS[4],
  );
  await expect(component.getByRole("heading", { name: "오늘 할 일" }).first()).toBeVisible();
  await expect(component.getByRole("alert")).toContainText("결과를 확인하지 못했습니다.");
  await expect(component.getByRole("button", { name: "확인함" })).toBeDisabled();
  expect(await isSemanticDocumentOrder([
    component.getByRole("region", { name: "운영 케이스 큐" }),
    component.getByRole("region", { name: "운영 케이스 상세" }),
  ])).toBe(true);
  await expectNoHorizontalOverflow(page);
});

test("Today partial source failure keeps retry and usable rows", async ({ mount, page }) => {
  const component = await mountEditorial(
    mount,
    page,
    <main>{todayNode(todayFailedSources)}</main>,
    INTERMEDIATE_VIEWPORTS[2],
  );
  await expect(component.getByRole("heading", { name: "오늘 할 일" }).first()).toBeVisible();
  await expect(component.getByText("일부만 확인됨")).toBeVisible();
  await component.locator("details.admin-today-controls").evaluate((node) => {
    (node as HTMLDetailsElement).open = true;
  });
  const retry = component.getByRole("button", { name: "AI 작업 다시 확인" });
  await expect(retry).toBeVisible();
  await expectMinimumTargetSize(retry);
  await retry.focus();
  await expectVisibleFocus(retry);
  await expect(component.getByRole("button", { name: new RegExp(EDITORIAL_LEDGER_LONG_TODAY_TITLE) })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("Today long Korean and English titles wrap without overflow", async ({ mount, page }) => {
  const first = todayDesktopLedger.view.items[0]!;
  const longFixture: TodayLedgerFixture = {
    ...todayDesktopLedger,
    view: {
      ...todayDesktopLedger.view,
      items: [
        {
          ...first,
          summary: { ...first.summary, title: EDITORIAL_LEDGER_LONG_TODAY_TITLE },
        },
        ...todayDesktopLedger.view.items.slice(1),
      ],
      selectedCase: todayDesktopLedger.view.selectedCase
        ? {
            ...todayDesktopLedger.view.selectedCase,
            summary: {
              ...todayDesktopLedger.view.selectedCase.summary,
              title: EDITORIAL_LEDGER_LONG_TODAY_TITLE,
            },
          }
        : null,
    },
  };
  const component = await mountEditorial(
    mount,
    page,
    <main>{todayNode({ ...longFixture, mode: "list" })}</main>,
    INTERMEDIATE_VIEWPORTS[0],
  );
  const title = component.getByRole("button", { name: new RegExp(EDITORIAL_LEDGER_LONG_TODAY_TITLE) });
  await expect(title).toBeVisible();
  await expectCopyWraps(component.locator(".admin-operation-wrap").first());
  await expectNoHorizontalOverflow(page);
});
