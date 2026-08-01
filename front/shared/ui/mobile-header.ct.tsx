import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator } from "@playwright/test";
import { MemoryRouter } from "react-router-dom";
import { MobileHeader } from "./mobile-header";

const fontMetrics = async (locator: Locator) =>
  locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      family: style.fontFamily,
      size: Number.parseFloat(style.fontSize),
      clientWidth: (element as HTMLElement).clientWidth,
      scrollWidth: (element as HTMLElement).scrollWidth,
    };
  });

test("MobileHeader keeps host workspace switching and the explicit account trigger distinct at 320px", async ({ mount, page }) => {
  await page.setViewportSize({ width: 320, height: 480 });
  const header = await mount(
    <MemoryRouter initialEntries={["/app/host"]}>
      <MobileHeader
        variant="host"
        accountControl={
          <button type="button" className="rm-account-menu__trigger" aria-label="아주 긴 호스트 이름 계정 메뉴">
            <span className="rm-account-menu__trigger-avatar" aria-hidden="true">
              <span className="rm-avatar-chip"><img src="/assets/avatars/book-club/reading-lamp.webp" alt="" /></span>
            </span>
            <span className="rm-account-menu__trigger-name">아주 긴 호스트 이름</span>
            <span className="rm-account-menu__trigger-mobile-label">계정</span>
            <span className="rm-account-menu__chevron" aria-hidden="true">▾</span>
          </button>
        }
      />
    </MemoryRouter>,
  );

  const account = header.getByRole("button", { name: "아주 긴 호스트 이름 계정 메뉴" });
  await expect(account).toContainText("계정");
  await expect(header.getByRole("link", { name: "멤버 화면으로" })).toBeVisible();
  await expect(account).toHaveCSS("min-height", "44px");
  expect((await fontMetrics(header.locator(".m-hdr-kicker"))).size).toBeGreaterThanOrEqual(12);
  expect((await fontMetrics(header.locator(".m-hdr-title"))).size).toBeGreaterThanOrEqual(15);
  expect((await account.boundingBox())!.x + (await account.boundingBox())!.width).toBeLessThanOrEqual(320);
  await expect(header).toHaveScreenshot("mobile-header-host-320.png");
});

test("MobileHeader keeps the member account label visible without reserving a host switch at 390px", async ({ mount, page }) => {
  await page.setViewportSize({ width: 390, height: 480 });
  const header = await mount(
    <MemoryRouter initialEntries={["/app"]}>
      <MobileHeader
        variant="member"
        accountControl={
          <button type="button" className="rm-account-menu__trigger" aria-label="멤버1 계정 메뉴">
            <span className="rm-account-menu__trigger-avatar" aria-hidden="true">
              <span className="rm-avatar-chip"><img src="/assets/avatars/book-club/reading-lamp.webp" alt="" /></span>
            </span>
            <span className="rm-account-menu__trigger-name">멤버1</span>
            <span className="rm-account-menu__trigger-mobile-label">계정</span>
            <span className="rm-account-menu__chevron" aria-hidden="true">▾</span>
          </button>
        }
      />
    </MemoryRouter>,
  );

  const account = header.getByRole("button", { name: "멤버1 계정 메뉴" });
  await expect(account).toContainText("계정");
  await expect(header.getByRole("link", { name: "호스트 화면" })).toHaveCount(0);
  await expect(header.getByRole("link", { name: "멤버 화면으로" })).toHaveCount(0);
  expect((await account.boundingBox())!.x + (await account.boundingBox())!.width).toBeLessThanOrEqual(390);
  await expect(header).toHaveScreenshot("mobile-header-member-390.png");
});

test("MobileHeader keeps the member settings back control readable and inside a 320px viewport", async ({ mount, page }) => {
  await page.setViewportSize({ width: 320, height: 480 });
  const header = await mount(
    <MemoryRouter initialEntries={["/app/me/settings"]}>
      <MobileHeader variant="member" />
    </MemoryRouter>,
  );

  const back = header.locator(".m-hdr-back");
  expect((await fontMetrics(back)).size).toBeGreaterThanOrEqual(14);
  await expect(back).toHaveCSS("min-height", "44px");
  const backBounds = await back.boundingBox();
  expect(backBounds!.x + backBounds!.width).toBeLessThanOrEqual(320);
});
