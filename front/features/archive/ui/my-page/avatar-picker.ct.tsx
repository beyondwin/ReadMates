import { expect, test } from "@playwright/experimental-ct-react";
import { useState } from "react";
import type { BookClubAvatarKey } from "@/shared/ui/book-club-avatar";
import { AvatarPicker } from "./avatar-picker";

export function PickerFixture() {
  const [value, setValue] = useState<BookClubAvatarKey>("banana-green-book");
  return <AvatarPicker value={value} onChange={setValue} disabled={false} />;
}

for (const viewport of [{ width: 320, height: 700 }, { width: 390, height: 844 }, { width: 1280, height: 900 }]) {
  test(`avatar grid remains usable at ${viewport.width}px`, async ({ mount, page }) => {
    await page.setViewportSize(viewport);
    const component = await mount(<div className="rm-profile-editor" style={{ height: "100dvh" }}><div className="rm-profile-editor__body"><PickerFixture /></div></div>);
    await expect(component.getByRole("button", { name: /선택$/ })).toHaveCount(30);
    const selected = component.getByRole("button", { name: "초록 책을 읽는 바나나 선택" });
    await expect(selected.locator(".rm-avatar-picker__check")).toHaveCount(1);
    await selected.focus();
    expect(await selected.evaluate((element) => getComputedStyle(element, "::after").borderTopWidth)).toBe("2px");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    const box = await selected.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  });
}
