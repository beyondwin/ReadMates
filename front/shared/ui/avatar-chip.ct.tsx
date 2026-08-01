import { expect, test } from "@playwright/experimental-ct-react";
import { AvatarChip } from "@/shared/ui/avatar-chip";
import { BOOK_CLUB_AVATAR_KEYS } from "./book-club-avatar";

const avatarSizes = [24, 32, 48, 64];

test("AvatarChip renders every local avatar decoratively at supported sizes", async ({ mount }, testInfo) => {
  const component = await mount(
    <div className="avatar-contact-sheet">
      {avatarSizes.flatMap((size) =>
        BOOK_CLUB_AVATAR_KEYS.map((avatarKey) => (
          <AvatarChip avatarKey={avatarKey} key={`${size}-${avatarKey}`} label="" name="회원" size={size} />
        )),
      )}
    </div>,
  );

  const images = component.locator("img");
  await expect(images).toHaveCount(BOOK_CLUB_AVATAR_KEYS.length * avatarSizes.length);
  expect(await images.evaluateAll((nodes) =>
    nodes.every(
      (node) =>
        node instanceof HTMLImageElement &&
        node.naturalWidth === 256 &&
        node.naturalHeight === 256 &&
        node.alt === "" &&
        node.getAttribute("aria-hidden") === "true",
    ),
  )).toBe(true);
  await component.screenshot({ path: testInfo.outputPath("avatar-chip-contact-sheet.png") });
});

test("AvatarChip falls back once and keeps its tile after both image failures", async ({ mount, page }) => {
  await page.route("**/reading-lamp.webp", (route) => route.fulfill({ status: 404 }));
  await page.route("**/archive-box.webp", (route) => route.fulfill({ status: 404 }));

  const component = await mount(
    <AvatarChip avatarKey="reading-lamp" label="" name="회원" size={24} />,
  );

  await expect(component.locator("img")).toHaveAttribute("src", /archive-box\.webp$/);
  await expect(component.locator("img")).toHaveCount(0);
  await expect(component).toBeVisible();
});
