import assert from "node:assert/strict";
import type { Locator, Page } from "@playwright/test";

export const VISUAL_AUTHORITY_VIEWPORTS = {
  desktopWide: { width: 1440, height: 960 },
  desktop: { width: 1024, height: 900 },
  tablet: { width: 900, height: 960 },
  tabletNarrow: { width: 768, height: 1024 },
  mobile: { width: 390, height: 844 },
  mobileNarrow: { width: 320, height: 720 },
} as const;

export async function expectNoHorizontalOverflow(page: Page, tolerance = 1): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  assert.ok(
    overflow <= tolerance,
    `horizontal overflow ${overflow}px exceeds ${tolerance}px tolerance`,
  );
}

export async function expectMinimumTargetSize(locator: Locator, minimum = 44): Promise<void> {
  const box = await locator.boundingBox();
  assert.ok(box, "interactive target is not visible");
  assert.ok(
    box.width >= minimum && box.height >= minimum,
    `target ${box.width}x${box.height} is smaller than ${minimum}px`,
  );
}

export async function expectVisibleFocus(locator: Locator): Promise<void> {
  const metrics = await locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      focused: element === element.ownerDocument.activeElement,
      outlineWidth: style.outlineWidth,
      boxShadow: style.boxShadow,
    };
  });
  assert.ok(metrics.focused, "expected the control to be focused");
  const visible = metrics.outlineWidth !== "0px" || metrics.boxShadow !== "none";
  assert.ok(visible, "expected a visible focus ring");
}

export async function expectReducedMotion(page: Page): Promise<void> {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const motion = await page.evaluate((maxSeconds) => {
    const maxCssDurationSeconds = (value: string) =>
      Math.max(
        0,
        ...value.split(",").map((part) => {
          const trimmed = part.trim();
          const amount = Number.parseFloat(trimmed);
          if (Number.isNaN(amount)) {
            return 0;
          }
          if (trimmed.endsWith("ms")) {
            return amount / 1000;
          }
          return amount;
        }),
      );

    const lingering: Array<{ tag: string; animationDuration: string; transitionDuration: string }> = [];
    for (const element of document.querySelectorAll("*")) {
      const style = getComputedStyle(element);
      const animationDuration = style.animationDuration;
      const transitionDuration = style.transitionDuration;
      if (
        maxCssDurationSeconds(animationDuration) > maxSeconds ||
        maxCssDurationSeconds(transitionDuration) > maxSeconds
      ) {
        lingering.push({
          tag: element.tagName.toLowerCase(),
          animationDuration,
          transitionDuration,
        });
      }
    }

    return {
      matches: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      lingering,
    };
  }, 0.02);
  assert.ok(motion.matches, "expected reduced motion preference to match");
  assert.equal(
    motion.lingering.length,
    0,
    `reduced motion still animates (${motion.lingering
      .slice(0, 5)
      .map((item) => `${item.tag} animation ${item.animationDuration}, transition ${item.transitionDuration}`)
      .join("; ")})`,
  );
}
