import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator, Page, TestInfo } from "@playwright/test";
import type { ReactElement } from "react";
import { MemoryRouter, Route, Routes } from "react-router";
import { GlobalSpaceSwitcher } from "@/shared/ui/global-space-switcher";
import {
  approvedMockup,
  captureApprovedComparison,
  expectGeometryWithinTolerance,
  expectLocatorGeometry,
  isSemanticDocumentOrder,
  type ApprovedRegion,
} from "@/tests/e2e/support/approved-mockup-contract";
import {
  VISUAL_AUTHORITY_VIEWPORTS,
  expectMinimumTargetSize,
  expectNoHorizontalOverflow,
  expectReducedMotion,
  expectVisibleFocus,
} from "@/tests/e2e/support/visual-authority-contract";
import { AdminShellLayout } from "../route/admin-shell-layout";
import { AdminAuditLedger } from "./admin-audit-ledger";
import { AdminClubsLedger } from "./admin-clubs-ledger";
import { AdminEditorialLedgerCtHarness, TodayLedgerCtNode } from "./admin-editorial-ledger-ct-harness";
import {
  ADMIN_SHELL_VISUAL_CAPABILITIES,
  ADMIN_SHELL_VISUAL_SPACE_OPTIONS,
  EDITORIAL_LEDGER_LONG_CLUB_NAME,
  EDITORIAL_LEDGER_LONG_TAKEDOWN_LIMITATION,
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

const APPROVED_DESKTOP_VIEWPORT = { width: 1672, height: 941 } as const;
const APPROVED_MOBILE_VIEWPORT = { width: 390, height: 844 } as const;
const QUEUE_DESKTOP_GEOMETRY = { x: 260, y: 86, width: 559, height: 855 } as const;
const DOCKET_DESKTOP_GEOMETRY = { x: 819, y: 86, width: 853, height: 855 } as const;
const HEADER_MOBILE_GEOMETRY = { x: 0, y: 0, width: 390, height: 70 } as const;
const NAV_MOBILE_GEOMETRY = { x: 0, y: 734, width: 390, height: 110 } as const;
const RECOMMENDED_DESKTOP_GEOMETRY = { x: 859, y: 621, width: 773, height: 24 } as const;
const FIRST_ROW_MOBILE_GEOMETRY = { x: 20, y: 220, width: 350, height: 94 } as const;
const BACK_MOBILE_GEOMETRY = { x: 0, y: 0, width: 390, height: 67 } as const;
const DETAIL_DOCKET_MOBILE_GEOMETRY = { x: 20, y: 67, width: 350, height: 761 } as const;

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

function todayShellFixture(outlet: ReactElement) {
  return (
    <MemoryRouter initialEntries={["/admin/today"]}>
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
              currentNavigationOwner="today"
              routePath="today"
              breadcrumbExtra={null}
              alarm={{
                summary: {
                  attention: { count: 3, headline: "알림 전달 지연" },
                  unacknowledged: 3,
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
          <Route path="*" element={outlet} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
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
      `${name} actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)}: ${(error as Error).message}`,
    );
  }
  return { name, actual, expected, toleranceCssPx };
}

async function captureTodayApproved(input: {
  id: "admin-today-desktop" | "admin-today-mobile" | "admin-work-detail-mobile";
  candidate: Locator;
  page: Page;
  testInfo: TestInfo;
  regions: readonly ApprovedRegion[];
}) {
  return captureApprovedComparison({
    entry: approvedMockup(input.id),
    candidate: input.page.locator("#root"),
    page: input.page,
    testInfo: input.testInfo,
    regions: input.regions,
  });
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
      filters={{ range: "7d" }}
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

test("Today L1 locks the approved desktop composition", async ({ mount, page }, testInfo) => {
  test.setTimeout(90_000);
  expect(todayDesktopLedger.capabilities).toEqual(["VIEW_TODAY"]);
  expect(todayDesktopLedger.allowedActions).toEqual(["ACKNOWLEDGE", "SNOOZE", "RESOLVE"]);
  const component = await mountTodayApproved(mount, page, todayDesktopLedger, APPROVED_DESKTOP_VIEWPORT);
  const queue = component.getByRole("region", { name: "운영 케이스 큐" });
  const docket = component.getByRole("region", { name: "운영 케이스 상세" });
  const recommended = docket.getByRole("heading", { name: "권장 처리" });
  const regions = [
    await regionFromLocator(queue, "queue", QUEUE_DESKTOP_GEOMETRY, 4),
    await regionFromLocator(docket, "docket", DOCKET_DESKTOP_GEOMETRY, 4),
    await regionFromLocator(recommended, "recommended", RECOMMENDED_DESKTOP_GEOMETRY, 2),
  ];
  await captureTodayApproved({
    id: "admin-today-desktop",
    candidate: component,
    page,
    testInfo,
    regions,
  });
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
  await expect(component.getByRole("button", { name: "다시 보내기 검토" })).toBeEnabled();
  await expect(component.locator(".admin-receipt-timeline")).toHaveCount(0);
  const primary = component.getByRole("button", { name: "다시 보내기 검토" });
  await expectMinimumTargetSize(primary);
  await primary.focus();
  await expectVisibleFocus(primary);
});

test("Clubs locks the 900 tablet editorial composition", async ({ mount, page }) => {
  expect(clubsTabletLedger.capabilities).toEqual(["VIEW_CLUBS", "VIEW_CLUB_OPERATIONS", "CREATE_CLUB"]);
  expect(clubsTabletLedger.canCreateClub).toBe(true);
  const component = await mountEditorial(
    mount,
    page,
    clubsNode(clubsTabletLedger),
    VISUAL_AUTHORITY_VIEWPORTS.tablet,
  );
  await expect(component.getByRole("heading", { name: "클럽", exact: true })).toBeVisible();
  await expect(component.getByRole("region", { name: "클럽 관리 목록" })).toBeVisible();
  await expect(component.getByRole("link", { name: EDITORIAL_LEDGER_LONG_CLUB_NAME })).toBeVisible();
  const create = component.getByRole("link", { name: "새 클럽" });
  await expect(create).toBeVisible();
  await expectMinimumTargetSize(create);
  await expect(component).toHaveScreenshot("editorial-ledger-clubs-900.png");
  await create.focus();
  await expectVisibleFocus(create);
});

test("Service health locks the 768 read-only evidence composition", async ({ mount, page }) => {
  expect(serviceHealthLedger.capabilities).toEqual(["VIEW_SERVICE_HEALTH"]);
  const component = await mountEditorial(
    mount,
    page,
    healthNode(serviceHealthLedger),
    VISUAL_AUTHORITY_VIEWPORTS.tabletNarrow,
  );
  await expect(component.getByRole("heading", { name: "서비스 건강" })).toBeVisible();
  await expect(component.getByRole("region", { name: "서비스 신호" })).toBeVisible();
  await expect(component.getByRole("heading", { name: "AI 작업 대기열" })).toBeVisible();
  await expect(component.locator(".admin-case-docket")).toHaveCount(0);
  await expect(component.locator(".admin-action-dock")).toHaveCount(0);
  await expect(component.locator(".admin-receipt-timeline")).toHaveCount(0);
  const refresh = component.getByRole("button", { name: "새로고침" });
  await expectMinimumTargetSize(refresh);
  await expect(component).toHaveScreenshot("editorial-ledger-service-768.png");
  await refresh.focus();
  await expectVisibleFocus(refresh);
});

test("Review audit locks the 390 mobile docket composition", async ({ mount, page }) => {
  expect(reviewAuditLedger.capabilities).toEqual(["VIEW_AUDIT"]);
  const component = await mountEditorial(
    mount,
    page,
    reviewNode(reviewAuditLedger),
    VISUAL_AUTHORITY_VIEWPORTS.mobile,
  );
  await expect(component.getByRole("heading", { name: "운영 처리 기록", exact: true })).toBeVisible();
  await expect(component.getByRole("heading", { name: "알림 재처리를 확정했습니다." })).toBeVisible();
  await expect(component.getByRole("region", { name: "감사 이벤트 상세" })).toBeVisible();
  const back = component.getByRole("button", { name: "목록으로" });
  await expectMinimumTargetSize(back);
  await expect(component).toHaveScreenshot("editorial-ledger-review-390.png");
  await back.focus();
  await expectVisibleFocus(back);
});

test.describe("approved mobile Today", () => {
  test.use({ deviceScaleFactor: 853 / 390 });

  test("Today mobile list locks the approved 390 composition", async ({ mount, page }, testInfo) => {
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
    const regions = [
      await regionFromLocator(header, "header", HEADER_MOBILE_GEOMETRY, 4),
      await regionFromLocator(nav, "nav", NAV_MOBILE_GEOMETRY, 4),
      await regionFromLocator(firstRow, "first-row", FIRST_ROW_MOBILE_GEOMETRY, 2),
    ];
    await captureTodayApproved({
      id: "admin-today-mobile",
      candidate: component,
      page,
      testInfo,
      regions,
    });
    await expectLocatorGeometry(header, HEADER_MOBILE_GEOMETRY, 4);
    await expectLocatorGeometry(nav, NAV_MOBILE_GEOMETRY, 4);
    await expectLocatorGeometry(firstRow, FIRST_ROW_MOBILE_GEOMETRY, 2);
    await expect(component.getByText("알림 전달 지연", { exact: true }).first()).toBeInViewport();
    await expect(component.getByRole("navigation", { name: "Admin 모바일 메뉴" })).toBeVisible();
    await expect(component.locator("details").filter({ hasText: "필터와 신호 상태" })).not.toHaveAttribute("open");
    await expect(component.locator(".admin-today-ledger__columns")).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
  });

  test("Today case detail locks the approved 390 composition", async ({ mount, page }, testInfo) => {
    test.setTimeout(90_000);
    expect(todayMobileCaseDetail.allowedActions).toEqual(["ACKNOWLEDGE", "SNOOZE", "RESOLVE"]);
    const component = await mountTodayApproved(mount, page, todayMobileCaseDetail, APPROVED_MOBILE_VIEWPORT);
    const docket = component.getByRole("region", { name: "운영 케이스 상세" });
    const back = component.getByRole("button", { name: "목록으로" });
    const nav = component.getByRole("navigation", { name: "Admin 모바일 메뉴" });
    await back.evaluate((element) => element.blur());
    const regions = [
      await regionFromLocator(back, "back", BACK_MOBILE_GEOMETRY, 4),
      await regionFromLocator(docket, "docket", DETAIL_DOCKET_MOBILE_GEOMETRY, 4),
      await regionFromLocator(nav, "nav", NAV_MOBILE_GEOMETRY, 4),
    ];
    await captureTodayApproved({
      id: "admin-work-detail-mobile",
      candidate: component,
      page,
      testInfo,
      regions,
    });
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
    await expect(component.getByRole("button", { name: "다시 보내기 검토" })).toBeEnabled();
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

test("Today keeps the 320 queue locator intact without horizontal overflow", async ({ mount, page }) => {
  const fixture = {
    ...todayDesktopLedger,
    mode: "list" as const,
    view: {
      ...todayDesktopLedger.view,
      items: todayDesktopLedger.view.items.map((item, index) => ({
        ...item,
        locatorLabel: String(index + 1).padStart(2, "0"),
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
  await expect(locator).toBeVisible();
  await expect(locator).toHaveCSS("white-space", "nowrap");
  await expect(locator).toHaveCSS("flex-shrink", "0");
  await expect(locator).toHaveCSS("overflow-wrap", "normal");
  await expectNoHorizontalOverflow(page);
});

for (const width of [390, 768, 900, 1024] as const) {
  test(`Today follows observed content width without overflow at ${width}px`, async ({ mount, page }) => {
    const component = await mountEditorial(
      mount,
      page,
      todayNode({ ...todayDesktopLedger, mode: width < 960 ? "list" : undefined }),
      { width, height: 900 },
    );
    await expect(component.getByRole("region", { name: "운영 케이스 큐" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    const layout = component.locator(".admin-today-ledger");
    await expect(layout).toHaveAttribute("data-content-layout", width >= 1024 ? "split" : "flow");
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
  await expect(component.getByRole("button", { name: "AI 작업 다시 확인" })).toBeVisible();
  await expect(component.getByRole("button", { name: "모임 마감 다시 확인" })).toBeVisible();
  await expect(component.getByRole("button", { name: "새 항목 2개 적용" })).toBeVisible();
  await expect(component.getByText("긴급 1건", { exact: true })).toBeVisible();
  await expect(component.getByText("새 긴급 신호 1건")).toBeVisible();
  await expect(component.getByRole("alert").filter({ hasText: "결과를 확인하지 못했습니다." })).toBeVisible();
  await expect(component.getByText("현재 역할은 상태 변경 없이 운영 근거만 확인할 수 있습니다.")).toBeVisible();
  await expect(component.getByText("다음 클럽을 불러오지 못했습니다.")).toBeVisible();
  await expect(component.getByRole("button", { name: "다시 불러오기" })).toBeVisible();
  await expect(component.getByText("조건에 맞는 클럽이 없습니다.")).toBeVisible();
  await expect(component.getByText("스냅샷을 불러오지 못했습니다")).toBeVisible();
  await expect(component.getByText("이어지는 페이지를 불러오지 못했습니다.")).toBeVisible();
  await expect(component.getByText("기록된 감사 이벤트가 없습니다.")).toBeVisible();
  await expect(component.getByRole("button", { name: "다시 보내기 검토" })).toHaveCount(3);
  await expect(component.getByRole("button", { name: "다시 보내기 검토", disabled: true })).toHaveCount(1);
  await expectMinimumTargetSize(component.getByRole("button", { name: "AI 작업 다시 확인" }));
});
