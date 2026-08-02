import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator } from "@playwright/test";
import { AvatarChip } from "@/shared/ui/avatar-chip";
import { BOOK_CLUB_AVATAR_KEYS } from "./book-club-avatar";

const avatarSizes = [20, 22, 24, 26, 28, 32, 46, 52, 72];

async function expectFrameFreeArtwork(avatar: Locator) {
  await expect(avatar).toHaveClass(/rm-avatar-chip--artwork/);
  await expect(avatar).not.toHaveAttribute("data-rsvp-status");
  await expect.poll(() => avatar.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      backgroundColor: style.backgroundColor,
      borderRadius: style.borderRadius,
      borderWidth: style.borderWidth,
      overflow: style.overflow,
    };
  })).toEqual({
    backgroundColor: "rgba(0, 0, 0, 0)",
    borderRadius: "0px",
    borderWidth: "0px",
    overflow: "visible",
  });
}

async function allImagesHaveTransparentCorners(images: Locator) {
  return images.evaluateAll((nodes) =>
    nodes.every((node) => {
      if (!(node instanceof HTMLImageElement) || !node.complete) return false;
      const canvas = document.createElement("canvas");
      canvas.width = node.naturalWidth;
      canvas.height = node.naturalHeight;
      const context = canvas.getContext("2d");
      if (!context) return false;
      context.drawImage(node, 0, 0);
      return [
        [0, 0],
        [canvas.width - 1, 0],
        [0, canvas.height - 1],
        [canvas.width - 1, canvas.height - 1],
      ].every(([x, y]) => context.getImageData(x, y, 1, 1).data[3] === 0);
    }),
  );
}

test("AvatarChip renders every local avatar at all approved small sizes", async ({ mount }, testInfo) => {
  const component = await mount(
    <div
      className="avatar-contact-sheet"
      style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(15, max-content)", padding: 16 }}
    >
      {avatarSizes.flatMap((size) =>
        BOOK_CLUB_AVATAR_KEYS.map((avatarKey) => (
          <AvatarChip avatarKey={avatarKey} key={`${size}-${avatarKey}`} label="" name="회원" size={size} />
        )),
      )}
    </div>,
  );

  const images = component.locator("img");
  const avatars = component.locator(".rm-avatar-chip");
  await expect(images).toHaveCount(BOOK_CLUB_AVATAR_KEYS.length * avatarSizes.length);
  await expectFrameFreeArtwork(avatars.first());
  await expect.poll(() => avatars.evaluateAll((nodes) => nodes.every((node) => getComputedStyle(node).borderWidth === "0px"))).toBe(true);
  await expect.poll(() => images.evaluateAll((nodes) => nodes.every((node) => getComputedStyle(node).objectFit === "contain"))).toBe(true);
  await expect.poll(() =>
    images.evaluateAll((nodes) =>
      nodes.every(
        (node) =>
          node instanceof HTMLImageElement &&
          node.naturalWidth === 256 &&
          node.naturalHeight === 256 &&
          node.alt === "" &&
          node.getAttribute("aria-hidden") === "true",
      ),
    ),
  ).toBe(true);
  await expect.poll(() => allImagesHaveTransparentCorners(images)).toBe(true);
  await component.screenshot({ path: testInfo.outputPath("avatar-chip-all-sizes.png") });
});

test("AvatarChip exposes every asset for full-size crop inspection", async ({ mount }, testInfo) => {
  const component = await mount(
    <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(6, 256px)", padding: 16 }}>
      {BOOK_CLUB_AVATAR_KEYS.map((avatarKey) => (
        <AvatarChip avatarKey={avatarKey} key={avatarKey} label="" name="회원" size={256} />
      ))}
    </div>,
  );

  const images = component.locator("img");
  await expect(images).toHaveCount(30);
  await expect.poll(() => allImagesHaveTransparentCorners(images)).toBe(true);
  await component.screenshot({ path: testInfo.outputPath("avatar-chip-crop-inspection.png") });
});

test("AvatarChip keeps requested and default artwork frame-free through image fallback", async ({ mount, page }) => {
  await page.route("**/banana-green-book.webp", (route) => route.fulfill({ status: 404 }));

  const component = await mount(
    <AvatarChip avatarKey="banana-green-book" label="" name="회원" size={24} />,
  );

  await expect(component.locator("img")).toHaveAttribute("src", /cloud-green-book\.webp$/);
  await expectFrameFreeArtwork(component);
  await expect.poll(() => component.locator("img").evaluate((image) => getComputedStyle(image).objectFit)).toBe("contain");
});

test("AvatarChip keeps a borderless neutral box after requested and fallback images fail", async ({ mount, page }) => {
  await page.route("**/banana-green-book.webp", (route) => route.fulfill({ status: 404 }));
  await page.route("**/cloud-green-book.webp", (route) => route.fulfill({ status: 404 }));

  const component = await mount(
    <AvatarChip avatarKey="banana-green-book" label="" name="회원" size={24} />,
  );

  await expect(component.locator("img")).toHaveCount(0);
  await expect(component).toBeVisible();
  await expectFrameFreeArtwork(component);
});

test("AvatarPicker alone owns the selected and focus ring", async ({ mount }) => {
  const component = await mount(
    <div className="rm-profile-editor">
      <button type="button" className="rm-avatar-picker__tile" aria-label="초록 책을 읽는 바나나 선택" aria-pressed="true">
        <AvatarChip avatarKey="banana-green-book" name={null} label="" size={52} />
      </button>
    </div>,
  );
  const selected = component.getByRole("button", { name: "초록 책을 읽는 바나나 선택" });
  const avatar = selected.locator(".rm-avatar-chip");

  await selected.focus();
  await expect(selected).toBeFocused();
  await expectFrameFreeArtwork(avatar);
  expect(await selected.evaluate((element) => getComputedStyle(element, "::after").borderTopWidth)).toBe("2px");
  expect(await selected.evaluate((element) => getComputedStyle(element, "::after").borderTopColor)).not.toBe("rgba(0, 0, 0, 0)");
});
