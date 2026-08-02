import { expect, test } from "@playwright/experimental-ct-react";
import { AvatarPickerStory } from "./avatar-picker.story";

for (const viewport of [{ width: 320, height: 700 }, { width: 390, height: 844 }, { width: 1280, height: 900 }]) {
  test(`avatar grid remains usable at ${viewport.width}px`, async ({ mount, page }, testInfo) => {
    await page.setViewportSize(viewport);
    const component = await mount(
      <div className="rm-profile-editor" style={{ height: "100dvh" }}>
        <div className="rm-profile-editor__body">
          <AvatarPickerStory />
        </div>
      </div>,
    );
    const avatarButtons = component.getByRole("button", { name: /선택$/ });
    await expect(avatarButtons).toHaveCount(30);
    const labels = component.locator(".rm-avatar-picker__label");
    await expect(labels).toHaveCount(30);
    expect((await labels.allTextContents()).every((text) => text.trim().length > 0)).toBe(true);
    const grid = component.locator(".rm-avatar-picker__grid");
    const resolvedTracks = await grid.evaluate((element) =>
      getComputedStyle(element).gridTemplateColumns.trim().split(/\s+/),
    );
    expect(resolvedTracks).toHaveLength(viewport.width < 768 ? 3 : 5);
    const selected = component.getByRole("button", { name: "한 장 더 읽는 바나나, 초록 책을 읽는 바나나 선택" });
    await expect(selected.locator(".rm-avatar-picker__check")).toHaveCount(0);
    const artwork = selected.locator(".rm-avatar-chip");
    const artworkBox = await artwork.boundingBox();
    expect(artworkBox!.width).toBe(viewport.width < 768 ? 58 : 64);
    const tileBox = await selected.boundingBox();
    expect(tileBox!.height).toBeLessThanOrEqual(viewport.width < 768 ? 126 : 136);
    await selected.focus();
    expect(await selected.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe("none");
    expect(await selected.evaluate((element) => getComputedStyle(element).outlineWidth)).toBe("2px");
    expect(await selected.evaluate((element) => getComputedStyle(element).borderTopWidth)).toBe("2px");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    const box = await selected.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
    await page.screenshot({ path: testInfo.outputPath(`avatar-picker-${viewport.width}-top.png`), fullPage: true });
    await avatarButtons.last().scrollIntoViewIfNeeded();
    await expect(avatarButtons.last()).toBeInViewport();
    await page.screenshot({ path: testInfo.outputPath(`avatar-picker-${viewport.width}-bottom.png`), fullPage: true });
  });
}
