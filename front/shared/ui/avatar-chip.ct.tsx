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

type AvatarRasterMetric = {
  key: string;
  edgeLightP90: number;
  maxSubjectRadius: number;
  subjectCenterX: number;
  subjectCenterY: number;
};

async function avatarRasterMetrics(images: Locator): Promise<AvatarRasterMetric[]> {
  return images.evaluateAll((nodes) => nodes.map((node) => {
    if (!(node instanceof HTMLImageElement) || !node.complete) throw new Error("avatar image is not ready");
    const canvas = document.createElement("canvas");
    canvas.width = node.naturalWidth;
    canvas.height = node.naturalHeight;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("avatar canvas is unavailable");
    context.drawImage(node, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const edgeLightValues: number[] = [];
    const subjectPoints: Array<[number, number]> = [];
    let maxSubjectRadius = 0;
    const background = [243, 230, 217] as const;

    for (let y = 0; y < canvas.height; y += 1) {
      for (let x = 0; x < canvas.width; x += 1) {
        const offset = (y * canvas.width + x) * 4;
        const [red, green, blue, alpha] = pixels.slice(offset, offset + 4);
        if (alpha <= 250) continue;
        const radius = Math.sqrt(((x - 128) / 77) ** 2 + ((y - 128) / 105) ** 2);
        const backgroundDistance = Math.sqrt(
          (red - background[0]) ** 2 + (green - background[1]) ** 2 + (blue - background[2]) ** 2,
        );
        if (radius > 0.82 && radius < 0.94 && (red + green + blue) / 3 > 215) {
          edgeLightValues.push(Math.max(red, green, blue));
        }
        if (backgroundDistance > 45) maxSubjectRadius = Math.max(maxSubjectRadius, radius);
        if (radius < 0.78 && backgroundDistance > 35) subjectPoints.push([x, y]);
      }
    }

    edgeLightValues.sort((left, right) => left - right);
    if (edgeLightValues.length === 0 || subjectPoints.length === 0) throw new Error("avatar raster sample is empty");
    const subjectXs = subjectPoints.map(([x]) => x);
    const subjectYs = subjectPoints.map(([, y]) => y);
    const subjectCenterX = (Math.min(...subjectXs) + Math.max(...subjectXs)) / 2;
    const subjectCenterY = (Math.min(...subjectYs) + Math.max(...subjectYs)) / 2;
    const key = new URL(node.src).pathname.split("/").at(-1)?.replace(/\.webp$/, "") ?? "unknown";
    return {
      key,
      edgeLightP90: edgeLightValues[Math.floor((edgeLightValues.length - 1) * 0.9)],
      maxSubjectRadius,
      subjectCenterX,
      subjectCenterY,
    };
  }));
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
  const rasterMetrics = await avatarRasterMetrics(images);
  for (const metric of rasterMetrics) {
    expect.soft(metric.edgeLightP90, `${metric.key} keeps beige through the oval edge`).toBeLessThanOrEqual(247);
    expect.soft(metric.maxSubjectRadius, `${metric.key} keeps the subject inside the oval`).toBeLessThanOrEqual(0.98);
    expect.soft(metric.subjectCenterX, `${metric.key} centers the subject horizontally`).toBeGreaterThanOrEqual(124);
    expect.soft(metric.subjectCenterX, `${metric.key} centers the subject horizontally`).toBeLessThanOrEqual(132);
    expect.soft(metric.subjectCenterY, `${metric.key} centers the subject vertically`).toBeGreaterThanOrEqual(124);
    expect.soft(metric.subjectCenterY, `${metric.key} centers the subject vertically`).toBeLessThanOrEqual(132);
  }
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
