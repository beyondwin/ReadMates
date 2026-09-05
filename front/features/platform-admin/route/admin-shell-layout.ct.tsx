import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator, Page } from "@playwright/test";
import type { ReactElement, ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router";
import {
  expectGeometryWithinTolerance,
  expectLocatorGeometry,
  type ApprovedRegion,
} from "@/tests/e2e/support/approved-mockup-contract";
import {
  expectMinimumTargetSize,
  expectNoHorizontalOverflow,
  expectReducedMotion,
  VISUAL_AUTHORITY_VIEWPORTS,
} from "@/tests/e2e/support/visual-authority-contract";
import { GlobalSpaceSwitcher } from "@/shared/ui/global-space-switcher";
import { TodayLedgerCtNode } from "../ui/admin-editorial-ledger-ct-harness";
import {
  ADMIN_SHELL_LONG_COPY,
  ADMIN_SHELL_VISUAL_CAPABILITIES,
  ADMIN_SHELL_VISUAL_SPACE_OPTIONS,
  todayDesktopLedger,
} from "../ui/admin-editorial-ledger.fixtures";
import {
  ADMIN_HEADER_DESKTOP_GEOMETRY as HEADER_DESKTOP_GEOMETRY,
  ADMIN_HEADER_MOBILE_GEOMETRY,
  ADMIN_RAIL_DESKTOP_GEOMETRY as NAV_DESKTOP_GEOMETRY,
} from "@/tests/e2e/support/approved-route-geometry";
import { AdminShellLayout } from "./admin-shell-layout";

const APPROVED_DESKTOP_VIEWPORT = { width: 1672, height: 941 } as const;

function shellFixture(
  outlet: ReactNode,
  routePath = "today",
  currentNavigationOwner: "today" | "clubs" | "service" | "records" = "today",
  workspaceAccountLabel = "운영자",
) {
  return (
    <MemoryRouter initialEntries={[`/admin/${routePath}`]}>
      <Routes>
        <Route
          path="/admin"
          element={
            <AdminShellLayout
              workspaceAccountLabel={workspaceAccountLabel}
              spaceSwitcher={
                <GlobalSpaceSwitcher
                  currentIdentity={{ productSpace: "platform" }}
                  options={ADMIN_SHELL_VISUAL_SPACE_OPTIONS}
                  onSelect={async () => ({ status: "selected" })}
                />
              }
              spaceControlEpoch={0}
              capabilities={ADMIN_SHELL_VISUAL_CAPABILITIES}
              currentNavigationOwner={currentNavigationOwner}
              routePath={routePath}
              breadcrumbExtra={null}
              alarm={{ summary: null, state: "ready" }}
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

const todayShellContent = (
  <section className="admin-page-frame">
    <header className="admin-page-frame__header">
      <div className="admin-page-frame__context">
        <p className="admin-page-context__eyebrow">오늘</p>
        <h1>오늘 할 일</h1>
        <p className="admin-page-frame__description">새 운영 신호가 생기면 이곳에서 먼저 판단합니다.</p>
      </div>
    </header>
    <section className="admin-state-panel" aria-label="정상 운영 상태">
      <h2 className="h3">오늘 확인할 새 운영 신호가 없습니다</h2>
      <p>정상 상태는 조용하게 남기고, 새 신호가 생길 때만 우선순위를 알립니다.</p>
      <button type="button" className="btn btn-secondary admin-operation-control--touch">다시 확인</button>
    </section>
  </section>
);

const longCopyShellContent = (
  <section className="admin-page-frame">
    <header className="admin-page-frame__header">
      <div className="admin-page-frame__context">
        <p className="admin-page-context__eyebrow">오늘</p>
        <h1>{ADMIN_SHELL_LONG_COPY}</h1>
        <p className="admin-page-frame__description">{ADMIN_SHELL_LONG_COPY}</p>
      </div>
    </header>
    <section className="admin-state-panel" aria-label="정상 운영 상태">
      <h2 className="h3">오늘 확인할 새 운영 신호가 없습니다</h2>
      <p>정상 상태는 조용하게 남기고, 새 신호가 생길 때만 우선순위를 알립니다.</p>
      <button type="button" className="btn btn-secondary admin-operation-control--touch">다시 확인</button>
    </section>
  </section>
);

test("Admin desktop shell matches approved 1672 geometry", async ({ mount, page }) => {
  await page.setViewportSize({ width: 1672, height: 941 });
  const component = await mount(shellFixture(todayShellContent));

  await expectLocatorGeometry(component.locator(".admin-shell__header"), HEADER_DESKTOP_GEOMETRY, 4);
  await expectLocatorGeometry(component.locator(".admin-shell__nav"), NAV_DESKTOP_GEOMETRY, 4);
  await expectNoHorizontalOverflow(page);
});

test("Admin mobile shell matches approved 390 geometry", async ({ mount, page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const component = await mount(shellFixture(todayShellContent));

  await expectLocatorGeometry(component.locator(".admin-shell__header"), ADMIN_HEADER_MOBILE_GEOMETRY, 4);
  await expect(component.getByRole("navigation", { name: "Admin 모바일 메뉴" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

for (const width of [767, 768, 1536] as const) {
  test(`admin shell has no horizontal overflow at ${width}`, async ({ mount, page }) => {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 941 });
    await mount(shellFixture(todayShellContent));
    await expectNoHorizontalOverflow(page);
  });
}

test("production shell imports scoped CSS in working cascade order", async ({
  mount,
  page,
}) => {
  await page.setViewportSize(VISUAL_AUTHORITY_VIEWPORTS.desktopWide);
  const component = await mount(
    <MemoryRouter initialEntries={["/admin/today"]}>
      <Routes>
        <Route
          path="/admin"
          element={
            <AdminShellLayout
              workspaceAccountLabel="운영자"
              spaceSwitcher={null}
              spaceControlEpoch={0}
              capabilities={null}
              currentNavigationOwner="today"
              routePath="today"
              breadcrumbExtra={null}
              alarm={{ summary: null, state: "unavailable" }}
              accountBusy={false}
              accountError={null}
              onOtherAccountLogin={() => undefined}
              outletContext={{ authorityEpoch: 0 }}
            />
          }
        >
          <Route
            path="today"
            element={<section className="admin-page-frame">페이지</section>}
          />
        </Route>
      </Routes>
    </MemoryRouter>,
  );

  const styles = await component.evaluate((root) => {
    const body = root.querySelector<HTMLElement>(".admin-shell__body");
    const nav = root.querySelector<HTMLElement>(".admin-shell__nav");
    const pageFrame = root.querySelector<HTMLElement>(".admin-page-frame");
    if (!body || !nav || !pageFrame) throw new Error("layout probe is incomplete");
    return {
      bodyDisplay: getComputedStyle(body).display,
      bodyColumns: getComputedStyle(body).gridTemplateColumns,
      navPosition: getComputedStyle(nav).position,
      pageDisplay: getComputedStyle(pageFrame).display,
      pageGap: getComputedStyle(pageFrame).gap,
    };
  });

  expect(styles).toEqual({
    bodyDisplay: "grid",
    bodyColumns: "260px 1180px",
    navPosition: "sticky",
    pageDisplay: "grid",
    pageGap: "18px",
  });
});

test("Today desktop locks the production shell, quiet normal state, and editorial bounds", async ({ mount, page }) => {
  await page.setViewportSize(VISUAL_AUTHORITY_VIEWPORTS.desktopWide);
  const component = await mount(shellFixture(todayShellContent));

  await expectNoHorizontalOverflow(page);
  await expectReducedMotion(page);
  await expect(component.getByRole("heading", { name: "오늘 할 일" })).toBeVisible();
  await expect(component.getByRole("region", { name: "정상 운영 상태" })).toBeVisible();
  await expect(component.locator("[role='alert'], [role='status']")).toHaveCount(0);

  const shellMetrics = await component.evaluate((root) => {
    const main = root.querySelector<HTMLElement>(".admin-shell__main");
    const body = root.querySelector<HTMLElement>(".admin-shell__body");
    if (!main || !body) throw new Error("shell visual fixture is incomplete");
    return {
      fontFamily: getComputedStyle(main).fontFamily,
      mainWidth: main.getBoundingClientRect().width,
      bodyColumns: getComputedStyle(body).gridTemplateColumns,
    };
  });
  expect(shellMetrics.fontFamily).toMatch(/Pretendard/i);
  expect(shellMetrics.mainWidth).toBeLessThanOrEqual(1240);
  expect(shellMetrics.bodyColumns).toBe("260px 1180px");

  await expectMinimumTargetSize(component.getByRole("button", { name: "공간 전환, 현재 플랫폼 운영" }));
  await expectMinimumTargetSize(
    component.locator(".admin-shell__account-control").getByRole("button", { name: "계정" }),
  );
  await expectMinimumTargetSize(component.getByRole("button", { name: "다시 확인" }));
  await expect(component).toHaveScreenshot("admin-shell-today-1440.png");
});

test("four-axis navigation remains complete in the production desktop shell", async ({ mount, page }) => {
  await page.setViewportSize(VISUAL_AUTHORITY_VIEWPORTS.desktopWide);
  const component = await mount(shellFixture(todayShellContent));

  const navigation = component.getByRole("navigation", { name: "Admin 콘솔" });
  await expect(navigation.getByRole("link", { name: "오늘 할 일" })).toHaveAttribute("aria-current", "page");
  await expect(navigation.getByRole("link", { name: "클럽 관리" })).toBeVisible();
  await expect(navigation.getByRole("link", { name: "서비스 상태" })).toBeVisible();
  await expect(navigation.getByRole("link", { name: "처리 기록" })).toBeVisible();
  for (const name of ["오늘 할 일", "클럽 관리", "서비스 상태", "처리 기록"]) {
    await expectMinimumTargetSize(navigation.getByRole("link", { name }));
  }
  await expectNoHorizontalOverflow(page);
  await expect(component).toHaveScreenshot("admin-shell-four-axis-nav-1440.png");
});

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

async function mountApprovedShell(
  mount: (component: ReactElement) => Promise<Locator>,
  page: Page,
  outlet: ReactNode,
  workspaceAccountLabel = "김운영",
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
  const component = await mount(shellFixture(outlet, "today", "today", workspaceAccountLabel));
  await page.evaluate(() => document.fonts.ready);
  await expectReducedMotion(page);
  await expectNoHorizontalOverflow(page);
  return component;
}

test("space menu keeps platform and club choices inside the production shell", async ({ mount, page }) => {
  test.setTimeout(90_000);
  const component = await mountApprovedShell(mount, page, <TodayLedgerCtNode fixture={todayDesktopLedger} />);

  await component.getByRole("button", { name: "공간 전환, 현재 플랫폼 운영" }).click();
  const menu = component.getByRole("menu", { name: "ReadMates 공간 전환" });
  const platform = menu.getByRole("menuitemradio", { name: "플랫폼 운영" });
  const clubs = menu.getByRole("menuitem", { name: "내 클럽" });
  await expect(platform).toHaveAttribute("aria-checked", "true");
  await expect(clubs).toBeVisible();
  await expect(menu).not.toContainText(/OWNER|OPERATOR|SUPPORT|ACTIVE|SUSPENDED/);
  await expect(menu.getByText("현재 범위", { exact: true }).first()).toBeVisible();
  await expect(menu.getByText("이동할 범위")).toBeVisible();
  await expect(component.locator(".admin-shell__account-control").getByRole("button", { name: "계정" })).toBeVisible();
  await expect(component.locator(".admin-shell__account-control")).toBeVisible();
  await expectMinimumTargetSize(platform);
  await expectMinimumTargetSize(clubs);
  await expectNoHorizontalOverflow(page);

  await regionFromLocator(component.locator(".admin-shell__header"), "header", HEADER_DESKTOP_GEOMETRY, 4);
  await regionFromLocator(component.locator(".admin-shell__nav"), "nav", NAV_DESKTOP_GEOMETRY, 4);
  await regionFromLocator(component.locator(".rm-global-space-switcher__trigger"), "switcher", { x: 188, y: 19, width: 160, height: 48 }, 2);
  await regionFromLocator(component.locator(".rm-global-space-switcher__menu"), "menu", { x: 188, y: 75, width: 360, height: 244 }, 4);
  await regionFromLocator(component.locator(".admin-shell__account-control"), "account", { x: 1555, y: 21, width: 83, height: 44 }, 4);

  await platform.press("ArrowDown");
  await expect(clubs).toBeFocused();
  await clubs.press("Enter");
  const member = component.getByRole("menuitemradio", { name: "읽는사이 멤버로 보기" });
  const host = component.getByRole("menuitemradio", { name: "읽는사이 호스트로 운영" });
  await expect(member).toBeVisible();
  await expect(host).toBeVisible();
  await member.press("ArrowDown");
  await expect(host).toBeFocused();
  await host.press("Escape");
  await expect(platform).toBeVisible();
  await expect(clubs).toBeVisible();
  await clubs.press("Escape");
  await expect(component.getByRole("button", { name: "공간 전환, 현재 플랫폼 운영" })).toBeFocused();
});

test("390 mobile shell keeps all four destinations thumb-sized without horizontal overflow", async ({ mount, page }) => {
  await page.setViewportSize(VISUAL_AUTHORITY_VIEWPORTS.mobile);
  const component = await mount(shellFixture(todayShellContent));

  await expect(component.getByRole("navigation", { name: "Admin 콘솔" })).toHaveCount(0);
  const navigation = component.getByRole("navigation", { name: "Admin 모바일 메뉴" });
  for (const name of ["오늘 할 일", "클럽 관리", "서비스 상태", "처리 기록"]) {
    await expectMinimumTargetSize(navigation.getByRole("link", { name }));
  }
  await expectNoHorizontalOverflow(page);
  await expect(component).toHaveScreenshot("admin-shell-mobile-390.png");
});

test("320 mobile shell wraps long Korean and English operational copy without overflow", async ({ mount, page }) => {
  await page.setViewportSize(VISUAL_AUTHORITY_VIEWPORTS.mobileNarrow);
  const component = await mount(shellFixture(longCopyShellContent));

  await expect(component.getByRole("heading", { name: ADMIN_SHELL_LONG_COPY })).toBeVisible();
  await expect(component.locator(".admin-page-frame__description")).toHaveText(ADMIN_SHELL_LONG_COPY);
  await expectNoHorizontalOverflow(page);
  await expectMinimumTargetSize(component.getByRole("button", { name: "공간 전환, 현재 플랫폼 운영" }));
  await expect(component).toHaveScreenshot("admin-shell-long-copy-320.png");
});
