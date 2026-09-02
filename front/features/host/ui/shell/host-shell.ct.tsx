import { expect, test } from "@playwright/experimental-ct-react";
import { expectLocatorGeometry } from "@/tests/e2e/support/approved-mockup-contract";
import {
  expectMinimumTargetSize,
  expectNoHorizontalOverflow,
  expectNoSeriousAccessibilityFindings,
  expectReducedMotion,
  expectVisibleFocus,
} from "@/tests/e2e/support/visual-authority-contract";
import "./host-shell.css";
import { AppClubShellHostChromeStory, HostShellPrimitivesStory } from "./host-shell.story";

test("host AppClubShell matches approved 1536 geometry", async ({ mount, page }) => {
  await page.setViewportSize({ width: 1536, height: 1024 });
  const shell = await mount(
    <AppClubShellHostChromeStory>
      <main><h1>운영실</h1></main>
    </AppClubShellHostChromeStory>,
  );

  await expectLocatorGeometry(shell.locator(".topnav"), { x: 0, y: 0, width: 1536, height: 90 }, 4);
});

test("host AppClubShell keeps a fixed mobile primary region at 390", async ({ mount, page }) => {
  await page.setViewportSize({ width: 390, height: 832 });
  const shell = await mount(
    <AppClubShellHostChromeStory>
      <main><h1>운영실</h1></main>
    </AppClubShellHostChromeStory>,
  );

  await expect(shell.locator('[data-club-shell-region="mobile-primary"]')).toBeVisible();
  await expect(shell.locator('[data-club-shell-region="mobile-primary"]')).toHaveCSS("position", "fixed");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

for (const testCase of [
  ...[320, 390, 767].map((width) => ({ width, height: width === 320 ? 720 : 844, mode: "mobile" as const })),
  ...[768, 900, 1024, 1199, 1200, 1440].map((width) => ({ width, height: 900, mode: "desktop" as const })),
]) {
  test(`host shell primitives stay operable at ${testCase.width}px`, async ({ mount, page }) => {
    await page.setViewportSize({ width: testCase.width, height: testCase.height });
    await expectReducedMotion(page);
    const shell = await mount(
      <main>
        <HostShellPrimitivesStory mode={testCase.mode} />
      </main>,
    );

    const trigger = shell.getByRole("button", {
      name: "아주 긴 한국어와 An exceptionally long English club name을 함께 읽는 모임 · 호스트 운영실",
    });
    await trigger.click();

    const targets = shell.locator("button:visible, a[href]:visible");
    for (const target of await targets.all()) {
      await expectMinimumTargetSize(target);
    }

    await trigger.focus();
    await expectVisibleFocus(trigger);
    await page.keyboard.press("Tab");
    const keyboardTarget = shell.getByRole("button", { name: "다음 모임" });
    await expect(keyboardTarget).toBeFocused();
    await expectVisibleFocus(keyboardTarget);
    await expect(trigger.locator("img")).toHaveAttribute(
      "src",
      "/assets/avatars/book-club/cloud-green-book.webp",
    );

    const wrap = await trigger.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        overflowWrap: style.overflowWrap,
        scrollWidth: Math.ceil((element as HTMLElement).scrollWidth),
        clientWidth: (element as HTMLElement).clientWidth,
      };
    });
    expect(["anywhere", "break-word"]).toContain(wrap.overflowWrap);
    expect(wrap.scrollWidth).toBeLessThanOrEqual(wrap.clientWidth + 1);

    if (testCase.mode === "mobile") {
      await expect(shell.getByRole("link", { name: "운영실" })).toHaveCount(1);
    }

    await expectNoHorizontalOverflow(page);
    expect(await expectNoSeriousAccessibilityFindings(page)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(testCase.width);
  });
}
