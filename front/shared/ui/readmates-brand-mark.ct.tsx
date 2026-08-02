import { expect, test } from "@playwright/experimental-ct-react";
import { ReadmatesBrandMark } from "@/shared/ui/readmates-brand-mark";

test("ReadmatesBrandMark renders the brand glyph", async ({ mount }) => {
  const component = await mount(<ReadmatesBrandMark />);
  const box = await component.boundingBox();

  expect(box?.width).toBe(32);
  expect(box?.height).toBe(32);
  await expect(component).toHaveScreenshot("brand-mark.png");
});
