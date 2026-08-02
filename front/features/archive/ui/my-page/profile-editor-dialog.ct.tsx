import { expect, test } from "@playwright/experimental-ct-react";
import { ProfileEditorDialog } from "./profile-editor-dialog";

const viewports = [{ width: 320, height: 700 }, { width: 390, height: 844 }, { width: 1280, height: 900 }];
const pickerViewports = [...viewports, { width: 320, height: 350 }];

for (const viewport of viewports) {
  test(`profile editor adapts at ${viewport.width}px`, async ({ mount, page }, testInfo) => {
    await page.setViewportSize(viewport);
    await mount(<ProfileEditorDialog profile={{ displayName: "여러 줄로 이어지는 긴 표시 이름", avatarKey: "banana-green-book" }} opener={null} onClose={() => undefined} onSaveProfile={async (profile) => ({ ...profile, accountName: "member-one" })} />);
    const dialog = page.getByRole("dialog", { name: "프로필 편집" });
    const input = dialog.getByRole("textbox", { name: "표시 이름" });
    const action = dialog.getByRole("button", {
      name: "아바타 선택, 현재 한 장 더 읽는 바나나",
    });
    const avatar = action.locator('.rm-avatar-chip[data-avatar-size-role="editor"]');
    await input.focus();
    const box = await dialog.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBe(viewport.height);
    if (viewport.width <= 768) expect(box!.width).toBe(viewport.width);
    else expect(box!.x + box!.width).toBe(viewport.width);
    expect((await avatar.boundingBox())?.width).toBe(72);
    const [actionBox, dialogBox] = await Promise.all([action.boundingBox(), dialog.boundingBox()]);
    expect(actionBox!.x).toBeGreaterThanOrEqual(dialogBox!.x);
    expect(actionBox!.x + actionBox!.width).toBeLessThanOrEqual(
      dialogBox!.x + dialogBox!.width,
    );
    await expect(dialog.locator(".rm-profile-editor__footer")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`profile-editor-${viewport.width}.png`), fullPage: true });
  });
}

test("profile editor remains contained at 200 percent zoom", async ({ mount, page }, testInfo) => {
  // A 640×700 screen at 200% browser zoom exposes a 320×350 CSS layout viewport.
  await page.setViewportSize({ width: 320, height: 350 });
  await mount(<ProfileEditorDialog profile={{ displayName: "멤버", avatarKey: "banana-green-book" }} opener={null} onClose={() => undefined} onSaveProfile={async (profile) => ({ ...profile, accountName: "member-one" })} />);
  const dialog = page.getByRole("dialog", { name: "프로필 편집" });
  const action = dialog.getByRole("button", {
    name: "아바타 선택, 현재 한 장 더 읽는 바나나",
  });
  const avatar = action.locator('.rm-avatar-chip[data-avatar-size-role="editor"]');
  expect((await avatar.boundingBox())?.width).toBe(72);
  const [actionBox, dialogBox] = await Promise.all([action.boundingBox(), dialog.boundingBox()]);
  expect(actionBox!.x).toBeGreaterThanOrEqual(dialogBox!.x);
  expect(actionBox!.x + actionBox!.width).toBeLessThanOrEqual(
    dialogBox!.x + dialogBox!.width,
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  const saveButton = page.getByRole("button", { name: "변경사항 저장" });
  await expect(saveButton).toBeVisible();
  const saveBounds = await saveButton.boundingBox();
  expect(saveBounds).not.toBeNull();
  expect(saveBounds!.x + saveBounds!.width).toBeLessThanOrEqual(320);
  await page.screenshot({ path: testInfo.outputPath("profile-editor-200-percent.png"), fullPage: true });
});

for (const viewport of pickerViewports) {
  const viewportName = viewport.height === 350 ? "200-percent" : `${viewport.width}px`;

  test(`profile editor avatar step remains usable at ${viewportName}`, async ({ mount, page }, testInfo) => {
    await page.setViewportSize(viewport);
    await mount(<ProfileEditorDialog profile={{ displayName: "멤버", avatarKey: "banana-green-book" }} opener={null} onClose={() => undefined} onSaveProfile={async (profile) => ({ ...profile, accountName: "member-one" })} />);

    const avatarAction = page.getByRole("button", {
      name: "아바타 선택, 현재 한 장 더 읽는 바나나",
    });
    await avatarAction.focus();
    await page.keyboard.press("Enter");

    const dialog = page.getByRole("dialog", { name: "아바타 선택" });
    const body = dialog.locator(".rm-profile-editor__body");
    const grid = dialog.locator(".rm-avatar-picker__grid");
    const footer = dialog.locator(".rm-profile-editor__footer");
    const choices = dialog.getByRole("button", { name: /선택$/ });
    const labels = dialog.locator(".rm-avatar-picker__label");
    await expect(choices).toHaveCount(30);
    await expect(labels).toHaveCount(30);

    const labelGeometry = await labels.evaluateAll((elements) => elements.map((element) => {
      const label = element as HTMLElement;
      const tile = label.closest<HTMLElement>(".rm-avatar-picker__tile");
      if (!tile) throw new Error("avatar label is missing its tile");
      const labelBox = label.getBoundingClientRect();
      const tileBox = tile.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(label);
      const textBox = range.getBoundingClientRect();
      const style = getComputedStyle(label);
      return {
        text: label.textContent?.trim() ?? "",
        textOverflow: style.textOverflow,
        horizontalContentFits: label.scrollWidth <= label.clientWidth + 1,
        verticalContentFits: label.scrollHeight <= label.clientHeight + 1,
        labelInsideTile:
          labelBox.left >= tileBox.left - 1
          && labelBox.right <= tileBox.right + 1
          && labelBox.top >= tileBox.top - 1
          && labelBox.bottom <= tileBox.bottom + 1,
        fullTextInsideLabel:
          textBox.left >= labelBox.left - 1
          && textBox.right <= labelBox.right + 1
          && textBox.top >= labelBox.top - 1
          && textBox.bottom <= labelBox.bottom + 1,
      };
    }));
    for (const geometry of labelGeometry) {
      expect(geometry.text.length, "every avatar label exposes its full name").toBeGreaterThan(0);
      expect(geometry.textOverflow, `${geometry.text} must not use ellipsis`).not.toBe("ellipsis");
      expect(geometry.horizontalContentFits, `${geometry.text} must not clip horizontally`).toBe(true);
      expect(geometry.verticalContentFits, `${geometry.text} must not clip vertically`).toBe(true);
      expect(geometry.labelInsideTile, `${geometry.text} must remain inside its tile`).toBe(true);
      expect(geometry.fullTextInsideLabel, `${geometry.text} text geometry must remain visible`).toBe(true);
    }

    for (const locator of [dialog, body, grid]) {
      const dimensions = await locator.evaluate((element) => ({
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
      }));
      expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

    const selected = dialog.getByRole("button", {
      name: "한 장 더 읽는 바나나, 초록 책을 읽는 바나나 선택",
    });
    await expect(selected).toHaveAttribute("aria-pressed", "true");
    await expect(selected.locator(".rm-avatar-picker__check--filled")).toHaveCount(1);
    await selected.focus();
    await expect(selected).toBeFocused();
    const focusStyle = await selected.evaluate((element) => {
      const style = getComputedStyle(element);
      return { outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth };
    });
    expect(focusStyle.outlineStyle).not.toBe("none");
    expect(focusStyle.outlineWidth).toBe("2px");

    const [dialogBox, footerBox, footerStyle] = await Promise.all([
      dialog.boundingBox(),
      footer.boundingBox(),
      footer.evaluate((element) => {
        const style = getComputedStyle(element);
        return { position: style.position, bottom: style.bottom };
      }),
    ]);
    expect(dialogBox).not.toBeNull();
    expect(footerBox).not.toBeNull();
    expect(footerBox!.x).toBeGreaterThanOrEqual(dialogBox!.x - 1);
    expect(footerBox!.x + footerBox!.width).toBeLessThanOrEqual(
      dialogBox!.x + dialogBox!.width + 1,
    );
    expect(footerBox!.y + footerBox!.height).toBeLessThanOrEqual(
      dialogBox!.y + dialogBox!.height + 1,
    );
    if (viewport.width <= 768) {
      expect(footerStyle).toEqual({ position: "sticky", bottom: "0px" });
    }

    await page.screenshot({
      path: testInfo.outputPath(`profile-editor-picker-${viewportName}-top.png`),
      fullPage: true,
    });
    await body.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    const lastChoice = choices.last();
    await expect(lastChoice).toBeInViewport();
    const [lastChoiceBox, scrolledBodyBox, stickyFooterBox] = await Promise.all([
      lastChoice.boundingBox(),
      body.boundingBox(),
      footer.boundingBox(),
    ]);
    expect(lastChoiceBox).not.toBeNull();
    expect(scrolledBodyBox).not.toBeNull();
    expect(stickyFooterBox).not.toBeNull();
    expect(lastChoiceBox!.y + lastChoiceBox!.height).toBeLessThanOrEqual(
      scrolledBodyBox!.y + scrolledBodyBox!.height + 1,
    );
    expect(lastChoiceBox!.y + lastChoiceBox!.height).toBeLessThanOrEqual(
      stickyFooterBox!.y + 1,
    );
    await page.screenshot({
      path: testInfo.outputPath(`profile-editor-picker-${viewportName}-bottom.png`),
      fullPage: true,
    });
  });
}
