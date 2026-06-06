import { expect, test } from "@playwright/experimental-ct-react";
import { BookCover } from "@/shared/ui/book-cover";

test("BookCover renders the text fallback when no image is provided", async ({ mount }) => {
  const component = await mount(
    <BookCover title="달까지 가자" author="장류진" width={120} />,
  );
  await expect(component).toHaveScreenshot("book-cover-fallback.png");
});
