import { expect, test } from "@playwright/experimental-ct-react";
import { AvatarPicker } from "./avatar-picker";

const viewports = [
  { width: 320, height: 700, screenshot: "avatar-picker-320.png" },
  { width: 390, height: 844, screenshot: "avatar-picker-390.png" },
  { width: 1280, height: 900, screenshot: "avatar-picker-1280.png" },
] as const;

for (const { width, height, screenshot } of viewports) {
  test(`AvatarPicker keeps its complete selection task inside ${width}x${height}`, async ({
    mount,
    page,
  }) => {
    await page.setViewportSize({ width, height });
    const component = await mount(
      <div style={{ padding: "32px" }}>
        <AvatarPicker
          avatarKey="squirrel-acorn"
          canEditProfile
          onUpdateAvatar={async (avatarKey) => ({ avatarKey })}
        />
      </div>,
    );

    await component.getByRole("button", { name: "아바타 바꾸기" }).click();

    const dialog = page.getByRole("dialog", { name: "나의 아바타 선택" });
    const tiles = dialog.getByRole("button", { name: /선택$/ });
    const current = dialog.getByRole("button", {
      name: "도토리를 든 다람쥐 선택",
    });
    const draft = dialog.getByRole("button", {
      name: "초록 찻잔을 든 고슴도치 선택",
    });
    const footer = dialog.locator(".rm-avatar-picker__footer");
    const body = dialog.locator(".rm-avatar-picker__body");

    await expect(dialog).toBeVisible();
    await expect(tiles).toHaveCount(40);
    for (let index = 0; index < 40; index += 1) {
      await expect(tiles.nth(index)).toBeVisible();
    }

    await expect(current.locator(".rm-avatar-picker__check")).toBeVisible();
    await draft.click();
    await expect(current.locator(".rm-avatar-picker__check")).toHaveCount(0);
    await expect(draft.locator(".rm-avatar-picker__check")).toBeVisible();

    const dialogBox = await dialog.boundingBox();
    expect(dialogBox).not.toBeNull();
    expect(dialogBox!.x).toBeGreaterThanOrEqual(0);
    expect(dialogBox!.y).toBeGreaterThanOrEqual(0);
    expect(dialogBox!.x + dialogBox!.width).toBeLessThanOrEqual(width);
    expect(dialogBox!.y + dialogBox!.height).toBeLessThanOrEqual(height);

    for (const target of [tiles.first(), dialog.getByRole("button", { name: "취소" }), dialog.getByRole("button", { name: "이 아바타로 변경" })]) {
      const targetBox = await target.boundingBox();
      expect(targetBox).not.toBeNull();
      expect(targetBox!.width).toBeGreaterThanOrEqual(44);
      expect(targetBox!.height).toBeGreaterThanOrEqual(44);
    }

    await body.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await expect(tiles.last()).toBeVisible();
    await expect(footer).toBeVisible();
    await expect(dialog.getByRole("button", { name: "취소" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "이 아바타로 변경" })).toBeVisible();

    const footerBox = await footer.boundingBox();
    expect(footerBox).not.toBeNull();
    expect(footerBox!.y + footerBox!.height).toBeLessThanOrEqual(height);
    const responsiveLayout = await dialog.evaluate((element) => {
      const grid = element.querySelector<HTMLElement>(".rm-avatar-picker__grid")!;
      const scrollBody = element.querySelector<HTMLElement>(".rm-avatar-picker__body")!;
      return {
        columnCount: getComputedStyle(grid).gridTemplateColumns.split(" ").length,
        dialogOverflow: getComputedStyle(element).overflow,
        bodyOverflowY: getComputedStyle(scrollBody).overflowY,
        headingFontFamily: getComputedStyle(element.querySelector("h2")!).fontFamily,
      };
    });
    expect(responsiveLayout.dialogOverflow).toBe("hidden");
    expect(responsiveLayout.bodyOverflowY).toBe("auto");
    expect(responsiveLayout.headingFontFamily).toContain("Iowan Old Style");
    if (width <= 768) {
      expect(responsiveLayout.columnCount).toBe(4);
      expect(Math.abs(dialogBox!.y + dialogBox!.height - height)).toBeLessThanOrEqual(1);
    } else {
      expect(responsiveLayout.columnCount).toBe(8);
      expect(Math.abs(dialogBox!.y + dialogBox!.height / 2 - height / 2)).toBeLessThanOrEqual(1);
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);

    await expect(page).toHaveScreenshot(screenshot, { fullPage: true });
  });
}
