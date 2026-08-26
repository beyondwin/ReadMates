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
    () => document.documentElement.scrollWidth - window.innerWidth,
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

function maxCssDurationSeconds(value: string): number {
  return Math.max(
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
}

export async function expectReducedMotion(page: Page): Promise<void> {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const motion = await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    return {
      matches: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      animationDuration: style.animationDuration,
      transitionDuration: style.transitionDuration,
    };
  });
  assert.ok(motion.matches, "expected reduced motion preference to match");
  const animation = maxCssDurationSeconds(motion.animationDuration);
  const transition = maxCssDurationSeconds(motion.transitionDuration);
  assert.ok(
    animation <= 0.02 && transition <= 0.02,
    `reduced motion still animates (animation ${motion.animationDuration}, transition ${motion.transitionDuration})`,
  );
}
