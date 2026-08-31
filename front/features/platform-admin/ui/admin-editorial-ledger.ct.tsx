import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator, Page } from "@playwright/test";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router";
import {
  VISUAL_AUTHORITY_VIEWPORTS,
  expectMinimumTargetSize,
  expectNoHorizontalOverflow,
  expectReducedMotion,
  expectVisibleFocus,
} from "@/tests/e2e/support/visual-authority-contract";
import { AdminAuditLedger } from "./admin-audit-ledger";
import { AdminClubsLedger } from "./admin-clubs-ledger";
import { AdminEditorialLedgerCtHarness } from "./admin-editorial-ledger-ct-harness";
import {
  EDITORIAL_LEDGER_LONG_AUDIT_SUMMARY,
  EDITORIAL_LEDGER_LONG_CLUB_NAME,
  EDITORIAL_LEDGER_LONG_HEALTH_TITLE,
  EDITORIAL_LEDGER_LONG_TODAY_TITLE,
  clubsEmptyEvidence,
  clubsPaginationFailure,
  clubsTabletLedger,
  healthEmptyEvidence,
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
import { AdminOperationStateActions } from "./admin-operation-state-actions";
import { AdminTodayLedger } from "./admin-today-ledger";

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
  const lifecycleControls = fixture.allowedActions.length > 0 ? (
    <AdminOperationStateActions
      allowedActions={fixture.allowedActions}
      pending={false}
      disabled={fixture.actionState !== "ready"}
      message={
        fixture.actionState === "unknown-outcome"
          ? { kind: "unknown-outcome", text: fixture.actionReason ?? "결과를 확인하지 못했습니다." }
          : null
      }
      onAcknowledge={noopEditorialLedgerHandler}
      onSnooze={noopEditorialLedgerHandler}
      onResolve={noopEditorialLedgerHandler}
    />
  ) : null;
  const mobileLifecycleControls = fixture.allowedActions.length > 0 ? (
    <AdminOperationStateActions
      allowedActions={fixture.allowedActions}
      pending={false}
      disabled={fixture.actionState !== "ready"}
      message={
        fixture.actionState === "unknown-outcome"
          ? { kind: "unknown-outcome", text: fixture.actionReason ?? "결과를 확인하지 못했습니다." }
          : null
      }
      presentation="prioritized"
      onAcknowledge={noopEditorialLedgerHandler}
      onSnooze={noopEditorialLedgerHandler}
      onResolve={noopEditorialLedgerHandler}
    />
  ) : null;
  return (
    <AdminTodayLedger
      view={fixture.view}
      auditHref="/admin/audit"
      filters={fixture.filters}
      history={fixture.history}
      lifecycleControls={lifecycleControls}
      mobileLifecycleControls={mobileLifecycleControls}
      actionState={fixture.actionState}
      actionReason={fixture.actionReason}
      pendingCount={fixture.pendingCount}
      urgentCount={fixture.urgentCount}
      urgentAnnouncement={fixture.urgentAnnouncement}
      hasNextPage={fixture.hasNextPage}
      loadingMore={fixture.loadingMore}
      mode={fixture.mode}
      query={fixture.query}
      workView={fixture.workView}
      onFilterChange={noopEditorialLedgerHandler}
      onSelectCase={noopEditorialLedgerHandler}
      onViewChange={noopEditorialLedgerHandler}
      onQueryChange={noopEditorialLedgerHandler}
      onApplyPending={noopEditorialLedgerHandler}
      onBackToList={noopEditorialLedgerHandler}
      onRetrySource={noopEditorialLedgerHandler}
    />
  );
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

test("Today L1 locks the 1440 wide editorial composition", async ({ mount, page }) => {
  expect(todayDesktopLedger.capabilities).toEqual(["VIEW_TODAY"]);
  expect(todayDesktopLedger.allowedActions).toEqual(["ACKNOWLEDGE", "SNOOZE", "RESOLVE"]);
  const component = await mountEditorial(
    mount,
    page,
    todayNode(todayDesktopLedger),
    VISUAL_AUTHORITY_VIEWPORTS.desktopWide,
  );
  await expect(component.getByRole("heading", { name: "오늘의 운영 케이스" })).toBeVisible();
  await expect(component.getByRole("region", { name: "운영 케이스 큐" })).toBeVisible();
  await expect(component.getByRole("region", { name: "운영 케이스 상세" })).toBeVisible();
  await expect(component.getByRole("heading", { name: EDITORIAL_LEDGER_LONG_TODAY_TITLE })).toBeVisible();
  await expect(component.getByRole("button", { name: "확인함" })).toBeEnabled();
  await expect(component.locator(".admin-receipt-timeline")).toHaveCount(0);
  const primary = component.getByRole("button", { name: "확인함" });
  await expectMinimumTargetSize(primary);
  await expect(component).toHaveScreenshot("editorial-ledger-today-1440.png");
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
  await expect(component.getByRole("heading", { name: EDITORIAL_LEDGER_LONG_HEALTH_TITLE })).toBeVisible();
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
  await expect(component.getByRole("heading", { name: EDITORIAL_LEDGER_LONG_AUDIT_SUMMARY })).toBeVisible();
  await expect(component.getByRole("region", { name: "감사 이벤트 상세" })).toBeVisible();
  const back = component.getByRole("button", { name: "목록으로" });
  await expectMinimumTargetSize(back);
  await expect(component).toHaveScreenshot("editorial-ledger-review-390.png");
  await back.focus();
  await expectVisibleFocus(back);
});

test("Today case detail locks the 320 mobile composition", async ({ mount, page }) => {
  expect(todayMobileCaseDetail.allowedActions).toEqual(["ACKNOWLEDGE", "SNOOZE", "RESOLVE"]);
  const component = await mountEditorial(
    mount,
    page,
    todayNode(todayMobileCaseDetail),
    VISUAL_AUTHORITY_VIEWPORTS.mobileNarrow,
  );
  await expect(component.getByRole("heading", { name: "오늘의 운영 케이스" })).toBeVisible();
  await expect(component.getByRole("region", { name: "운영 케이스 상세" })).toBeVisible();
  await expect(component.getByRole("button", { name: "목록으로" })).toBeVisible();
  await expect(component.getByRole("button", { name: "확인함" })).toBeEnabled();
  await expect(component.getByText("다른 처리")).toBeVisible();
  await expect(component.locator(".admin-today-ledger__columns")).toHaveCount(0);
  await expect(component.locator(".admin-receipt-timeline")).toHaveCount(0);
  const back = component.getByRole("button", { name: "목록으로" });
  await expectMinimumTargetSize(back);
  await expect(component).toHaveScreenshot("editorial-ledger-case-detail-320.png");
  await back.focus();
  await expectVisibleFocus(back);
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
  await expect(component.getByRole("button", { name: "확인함" })).toHaveCount(3);
  await expect(component.getByRole("button", { name: "확인함", disabled: true })).toHaveCount(1);
  await expectMinimumTargetSize(component.getByRole("button", { name: "AI 작업 다시 확인" }));
});
