import { expect, test } from "@playwright/experimental-ct-react";
import { ProfileEditorDialog } from "./profile-editor-dialog";

const viewports = [{ width: 320, height: 700 }, { width: 390, height: 844 }, { width: 1280, height: 900 }];

for (const viewport of viewports) {
  test(`profile editor adapts at ${viewport.width}px`, async ({ mount, page }, testInfo) => {
    await page.setViewportSize(viewport);
    await mount(<ProfileEditorDialog profile={{ displayName: "여러 줄로 이어지는 긴 표시 이름", avatarKey: "banana-green-book" }} opener={null} onClose={() => undefined} onSaveProfile={async (profile) => ({ ...profile, accountName: "member-one" })} />);
    const dialog = page.getByRole("dialog", { name: "프로필 편집" });
    const input = dialog.getByRole("textbox", { name: "표시 이름" });
    await input.focus();
    const box = await dialog.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBe(viewport.height);
    if (viewport.width <= 768) expect(box!.width).toBe(viewport.width);
    else expect(box!.x + box!.width).toBe(viewport.width);
    await expect(dialog.locator(".rm-profile-editor__footer")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`profile-editor-${viewport.width}.png`), fullPage: true });
  });
}

test("profile editor remains contained at 200 percent zoom", async ({ mount, page }, testInfo) => {
  // A 640×700 screen at 200% browser zoom exposes a 320×350 CSS layout viewport.
  await page.setViewportSize({ width: 320, height: 350 });
  await mount(<ProfileEditorDialog profile={{ displayName: "멤버", avatarKey: "banana-green-book" }} opener={null} onClose={() => undefined} onSaveProfile={async (profile) => ({ ...profile, accountName: "member-one" })} />);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  const saveButton = page.getByRole("button", { name: "변경사항 저장" });
  await expect(saveButton).toBeVisible();
  const saveBounds = await saveButton.boundingBox();
  expect(saveBounds).not.toBeNull();
  expect(saveBounds!.x + saveBounds!.width).toBeLessThanOrEqual(320);
  await page.screenshot({ path: testInfo.outputPath("profile-editor-200-percent.png"), fullPage: true });
});
