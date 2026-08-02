import { expect, test } from "@playwright/experimental-ct-react";
import { AvatarPickerStory } from "./avatar-picker.story";

test("selected check stays near-white on the accent fill in dark theme", async ({ mount }) => {
  const component = await mount(
    <div data-theme="dark" className="rm-profile-editor">
      <AvatarPickerStory />
    </div>,
  );
  const check = component.locator(".rm-avatar-picker__check");
  const rendered = await check.evaluate((element) => {
    const style = getComputedStyle(element);
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("avatar check color canvas is unavailable");
    const rgb = (color: string) => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      return Array.from(context.getImageData(0, 0, 1, 1).data.slice(0, 3));
    };
    const luminance = ([red, green, blue]: number[]) =>
      [red, green, blue]
        .map((channel) => channel / 255)
        .map((channel) => channel <= 0.04045
          ? channel / 12.92
          : ((channel + 0.055) / 1.055) ** 2.4)
        .reduce((total, channel, index) => total + channel * [0.2126, 0.7152, 0.0722][index], 0);
    const foreground = rgb(style.color);
    const background = rgb(style.backgroundColor);
    const foregroundLuminance = luminance(foreground);
    const backgroundLuminance = luminance(background);
    return {
      foreground,
      contrast:
        (Math.max(foregroundLuminance, backgroundLuminance) + 0.05)
        / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05),
    };
  });

  expect(rendered.foreground.every((channel) => channel >= 245)).toBe(true);
  expect(rendered.contrast).toBeGreaterThan(2.3);
});

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
    await expect(selected.locator(".rm-avatar-picker__check")).toHaveCount(1);
    const artwork = selected.locator(".rm-avatar-chip");
    const artworkBox = await artwork.boundingBox();
    expect(artworkBox!.width).toBe(viewport.width < 768 ? 58 : 64);
    const tileBox = await selected.boundingBox();
    const checkBox = await selected.locator(".rm-avatar-picker__check").boundingBox();
    expect(checkBox!.x).toBeGreaterThanOrEqual(tileBox!.x + 8);
    expect(checkBox!.y).toBeGreaterThanOrEqual(tileBox!.y + 8);
    expect(checkBox!.x + checkBox!.width).toBeLessThanOrEqual(
      tileBox!.x + tileBox!.width - 8,
    );
    expect(checkBox!.y + checkBox!.height).toBeLessThanOrEqual(artworkBox!.y);
    await selected.focus();
    expect(await selected.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe("none");
    expect(await selected.evaluate((element) => getComputedStyle(element).outlineWidth)).toBe("2px");
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
