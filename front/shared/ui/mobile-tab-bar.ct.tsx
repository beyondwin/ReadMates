import { expect, test } from "@playwright/experimental-ct-react";
import { MemoryRouter } from "react-router-dom";
import { MobileTabBar } from "./mobile-tab-bar";

test("MobileTabBar wraps deliberately long Korean and English labels at a narrow viewport", async ({ mount, page }) => {
  await page.setViewportSize({ width: 320, height: 480 });
  expect(await page.evaluate(() => window.innerWidth)).toBe(320);

  const tabBar = await mount(
    <MemoryRouter initialEntries={["/app"]}>
      <MobileTabBar variant="member" />
    </MemoryRouter>,
  );

  const labels = tabBar.locator(".m-tab-label");
  await labels.evaluateAll((elements) => {
    elements[0].textContent = "회원이 함께 읽고 남긴 독서 기록 보관함";
    elements[1].textContent = "A deliberately expansive navigation destination";
  });

  const tabBarBounds = await tabBar.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return { top: box.top, bottom: box.bottom, left: box.left, right: box.right };
  });
  const labelMetrics = await labels.evaluateAll((elements) =>
    elements.slice(0, 2).map((element) => {
      const label = element as HTMLElement;
      const style = getComputedStyle(label);
      const labelBox = label.getBoundingClientRect();
      const tabBox = label.closest<HTMLElement>(".m-tab")!.getBoundingClientRect();

      return {
        clientWidth: label.clientWidth,
        scrollWidth: label.scrollWidth,
        height: label.getBoundingClientRect().height,
        labelTop: labelBox.top,
        labelBottom: labelBox.bottom,
        tabTop: tabBox.top,
        tabBottom: tabBox.bottom,
        whiteSpace: style.whiteSpace,
        overflowX: style.overflowX,
        textOverflow: style.textOverflow,
      };
    }),
  );

  for (const metric of labelMetrics) {
    expect(metric.whiteSpace).toBe("normal");
    expect(metric.overflowX).not.toBe("hidden");
    expect(metric.textOverflow).not.toBe("ellipsis");
    expect(metric.scrollWidth).toBeLessThanOrEqual(metric.clientWidth);
    expect(metric.height).toBeGreaterThan(32);
    expect(metric.labelTop).toBeGreaterThanOrEqual(tabBarBounds.top);
    expect(metric.labelBottom).toBeLessThanOrEqual(tabBarBounds.bottom);
    expect(metric.tabTop).toBeGreaterThanOrEqual(tabBarBounds.top);
    expect(metric.tabBottom).toBeLessThanOrEqual(tabBarBounds.bottom);
  }
  expect(tabBarBounds.left).toBeGreaterThanOrEqual(0);
  expect(tabBarBounds.right).toBeLessThanOrEqual(320);
  expect(tabBarBounds.bottom).toBeLessThanOrEqual(480);
});
