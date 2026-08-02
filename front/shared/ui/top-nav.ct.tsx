import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator } from "@playwright/test";
import { MemoryRouter } from "react-router-dom";
import { TopNav } from "./top-nav";

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

test("TopNav keeps the host retry control typographically aligned with destination links", async ({
  mount,
}) => {
  const navigation = await mount(
    <MemoryRouter initialEntries={["/app/host"]}>
      <TopNav
        variant="host"
        currentSessionStatus="error"
        onRetryCurrentSession={() => undefined}
      />
    </MemoryRouter>,
  );

  const destinationLink = navigation.getByRole("link", { name: "멤버", exact: true });
  const retryButton = navigation.getByRole("button", { name: "세션 다시 확인" });
  const [linkTypography, retryTypography] = await Promise.all(
    [destinationLink, retryButton].map((locator) =>
      locator.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          fontFamily: style.fontFamily,
          fontSize: style.fontSize,
          fontWeight: style.fontWeight,
          lineHeight: style.lineHeight,
        };
      }),
    ),
  );

  expect(retryTypography).toEqual(linkTypography);
});

test("TopNav shows the desktop avatar and preserves a long account name in its accessible label", async ({ mount, page }) => {
  const memberName = "아주 긴 한국어 이름과 An exceptionally long English member name";
  await page.setViewportSize({ width: 1280, height: 480 });
  const navigation = await mount(
    <MemoryRouter initialEntries={["/app"]}>
      <TopNav
        variant="member"
        memberName={memberName}
        accountControl={
          <button type="button" className="rm-account-menu__trigger" aria-label={`${memberName} 계정 메뉴`}>
            <span className="rm-account-menu__trigger-avatar" aria-hidden="true">
              <span className="rm-avatar-chip"><img src="/assets/avatars/book-club/cloud-green-book.webp" alt="" /></span>
            </span>
            <span className="rm-account-menu__trigger-name">{memberName}</span>
            <span className="rm-account-menu__trigger-mobile-label">계정</span>
            <span className="rm-account-menu__chevron" aria-hidden="true">▾</span>
          </button>
        }
      />
    </MemoryRouter>,
  );

  const account = navigation.getByRole("button", { name: `${memberName} 계정 메뉴` });
  await expect(account.locator(".rm-account-menu__trigger-avatar img")).toHaveAttribute(
    "src",
    "/assets/avatars/book-club/cloud-green-book.webp",
  );
  await expect(account.locator(".rm-account-menu__trigger-name")).toHaveText(memberName);
  await expect(account.locator(".rm-account-menu__trigger-name")).toHaveCSS("text-overflow", "ellipsis");
  const accountName = account.locator(".rm-account-menu__trigger-name");
  expect((await fontMetrics(accountName)).size).toBeGreaterThanOrEqual(14);
  await expect(navigation).toHaveScreenshot("top-nav-long-account-name-1280.png");
});

test("TopNav gives the workspace switch the approved desktop icon scale", async ({ mount, page }) => {
  await page.setViewportSize({ width: 1280, height: 480 });
  const navigation = await mount(
    <MemoryRouter initialEntries={["/app"]}>
      <TopNav variant="member" memberName="멤버1" showHostEntry />
    </MemoryRouter>,
  );

  const switchIcon = navigation.locator(".rm-workspace-switch svg");
  expect((await switchIcon.boundingBox())?.width).toBe(22);
  expect((await navigation.locator(".rm-workspace-switch").boundingBox())?.width).toBe(36);
});
