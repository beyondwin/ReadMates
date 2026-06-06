import { expect, test } from "@playwright/experimental-ct-react";
import { ReadmatesBrandMark } from "@/shared/ui/readmates-brand-mark";

test("ReadmatesBrandMark renders the brand glyph", async ({ mount }) => {
  const component = await mount(<ReadmatesBrandMark />);
  await expect(component).toHaveScreenshot("brand-mark.png");
});
