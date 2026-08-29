import { expect, test } from "@playwright/experimental-ct-react";
import { AppClubShellStory } from "./app-club-shell.story";

test("AppClubShell uses only mobile chrome at the exact 767px boundary", async ({ mount, page }) => {
  await page.evaluate(() => document.documentElement.style.setProperty("--m-safe-bottom", "20px"));
  await page.setViewportSize({ width: 767, height: 720 });
  const shell = await mount(<AppClubShellStory />);

  await expect(shell.locator('[data-club-shell-region="desktop-spine"]')).toBeHidden();
  await expect(shell.locator('[data-club-shell-region="mobile-spine"]')).toBeVisible();
  await expect(shell.locator('[data-club-shell-region="mobile-context"]')).toBeVisible();
  await expect(shell.locator('[data-club-shell-region="mobile-primary"] .m-tabbar')).toBeVisible();

  for (const selector of await shell.locator(".rm-club-shell-mobile-context .rm-context-selector__trigger").all()) {
    expect((await selector.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  await shell.locator(".rm-club-shell-mobile-context .rm-workspace-selector__trigger").click();
  const currentWorkspace = shell.locator('.rm-club-shell-mobile-context [aria-current="page"]');
  await expect(currentWorkspace).toHaveText("멤버 공간");
  await expect(shell.locator('.rm-club-shell-mobile-context nav[aria-label="공간 선택"]').getByRole("link", { name: "멤버 공간" })).toHaveCount(0);
  expect((await currentWorkspace.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(767);
  await expect(shell.locator(".m-tabbar")).toHaveCSS("padding-bottom", "20px");
  await expect(shell.locator('[data-club-shell-region="content"]')).toHaveCSS("padding-bottom", "124px");
  await page.evaluate(() => document.documentElement.style.removeProperty("--m-safe-bottom"));
});

test("AppClubShell uses only horizontal desktop chrome at the exact 768px boundary", async ({ mount, page }) => {
  await page.setViewportSize({ width: 768, height: 720 });
  const shell = await mount(<AppClubShellStory />);

  await expect(shell.locator('[data-club-shell-region="desktop-spine"]')).toBeVisible();
  await expect(shell.locator('[data-club-shell-region="mobile-spine"]')).toBeHidden();
  await expect(shell.locator('[data-club-shell-region="mobile-context"]')).toBeHidden();
  await expect(shell.locator('[data-club-shell-region="mobile-primary"]')).toBeHidden();
  await expect(shell.getByRole("navigation", { name: "멤버 주 메뉴" })).toBeVisible();
  await expect(shell.locator('nav[aria-label="클럽 선택"]').first()).toBeAttached();
  await expect(shell.locator('nav[aria-label="공간 선택"]').first()).toBeAttached();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(768);
});
