import { expect, test } from "@playwright/experimental-ct-react";
import { HostShellPrimitivesStory } from "./host-shell.story";

for (const testCase of [
  ...[390, 767].map((width) => ({ width, height: 844, mode: "mobile" as const })),
  ...[768, 1024, 1199, 1200, 1440].map((width) => ({ width, height: 900, mode: "desktop" as const })),
]) {
  test(`host shell primitives stay operable at ${testCase.width}px`, async ({ mount, page }) => {
    await page.setViewportSize({ width: testCase.width, height: testCase.height });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const shell = await mount(<HostShellPrimitivesStory mode={testCase.mode} />);

    const trigger = shell.getByRole("button", {
      name: "아주 긴 한국어와 An exceptionally long English club name을 함께 읽는 모임 · 호스트 운영실",
    });
    await trigger.click();

    const targets = shell.locator("button:visible, a[href]:visible");
    for (const target of await targets.all()) {
      expect((await target.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }

    await trigger.focus();
    await page.keyboard.press("Tab");
    const keyboardTarget = shell.getByRole("button", { name: "다음 모임" });
    await expect(keyboardTarget).toBeFocused();
    await expect(keyboardTarget).toHaveCSS("outline-style", "solid");
    await expect(keyboardTarget).toHaveCSS("outline-width", "2px");
    await expect(trigger.locator("img")).toHaveAttribute(
      "src",
      "/assets/avatars/book-club/cloud-green-book.webp",
    );

    const transitionDuration = await trigger.evaluate((element) => getComputedStyle(element).transitionDuration);
    expect(transitionDuration.split(",").every((duration) => Number.parseFloat(duration) <= 0.02)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(testCase.width);
  });
}
