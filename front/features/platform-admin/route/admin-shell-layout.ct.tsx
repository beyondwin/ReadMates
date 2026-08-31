import { expect, test } from "@playwright/experimental-ct-react";
import { MemoryRouter, Route, Routes } from "react-router";
import { VISUAL_AUTHORITY_VIEWPORTS } from "@/tests/e2e/support/visual-authority-contract";
import { AdminShellLayout } from "./admin-shell-layout";

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
    bodyColumns: "220px 1108px",
    navPosition: "sticky",
    pageDisplay: "grid",
    pageGap: "18px",
  });
});
