import { describe, expect, it } from "vitest";
import type { Locator, Page } from "@playwright/test";
import {
  VISUAL_AUTHORITY_VIEWPORTS,
  expectMinimumTargetSize,
  expectNoHorizontalOverflow,
  expectReducedMotion,
  expectVisibleFocus,
} from "./visual-authority-contract";

function pageWithOverflow(overflow: number): Page {
  return {
    evaluate: async () => overflow,
  } as unknown as Page;
}

function locatorWithBox(box: { width: number; height: number } | null): Locator {
  return {
    boundingBox: async () => box,
  } as unknown as Locator;
}

function locatorWithFocus(metrics: {
  focused: boolean;
  outlineWidth: string;
  boxShadow: string;
}): Locator {
  return {
    evaluate: async () => metrics,
  } as unknown as Locator;
}

function pageWithMotion(motion: {
  matches: boolean;
  animationDuration: string;
  transitionDuration: string;
}): { page: Page; emulateMediaCalls: unknown[] } {
  const emulateMediaCalls: unknown[] = [];
  const page = {
    emulateMedia: async (media: { reducedMotion?: "reduce" | "no-preference" | null }) => {
      emulateMediaCalls.push(media);
    },
    evaluate: async () => motion,
  } as unknown as Page;
  return { page, emulateMediaCalls };
}

describe("visual authority contract", () => {
  it("locks the six host/admin proof viewports", () => {
    expect(VISUAL_AUTHORITY_VIEWPORTS).toEqual({
      desktopWide: { width: 1440, height: 960 },
      desktop: { width: 1024, height: 900 },
      tablet: { width: 900, height: 960 },
      tabletNarrow: { width: 768, height: 1024 },
      mobile: { width: 390, height: 844 },
      mobileNarrow: { width: 320, height: 720 },
    });
  });

  it("allows overflow within the default 1px tolerance", async () => {
    await expect(expectNoHorizontalOverflow(pageWithOverflow(1))).resolves.toBeUndefined();
  });

  it("fails when overflow exceeds the default 1px tolerance", async () => {
    await expect(expectNoHorizontalOverflow(pageWithOverflow(2))).rejects.toThrow(/1px/);
  });

  it("honors an explicit overflow tolerance", async () => {
    await expect(expectNoHorizontalOverflow(pageWithOverflow(2), 2)).resolves.toBeUndefined();
  });

  it("fails targets smaller than the default 44px minimum", async () => {
    await expect(expectMinimumTargetSize(locatorWithBox({ width: 43, height: 44 }))).rejects.toThrow(/44px/);
    await expect(expectMinimumTargetSize(locatorWithBox({ width: 44, height: 43 }))).rejects.toThrow(/44px/);
  });

  it("accepts 44px targets and an explicit minimum", async () => {
    await expect(expectMinimumTargetSize(locatorWithBox({ width: 44, height: 44 }))).resolves.toBeUndefined();
    await expect(expectMinimumTargetSize(locatorWithBox({ width: 40, height: 40 }), 40)).resolves.toBeUndefined();
  });

  it("requires a focused control with a visible outline or ring", async () => {
    await expect(
      expectVisibleFocus(locatorWithFocus({ focused: true, outlineWidth: "2px", boxShadow: "none" })),
    ).resolves.toBeUndefined();
    await expect(
      expectVisibleFocus(
        locatorWithFocus({ focused: true, outlineWidth: "0px", boxShadow: "0 0 0 5px rgb(0 0 0 / 0.2)" }),
      ),
    ).resolves.toBeUndefined();
  });

  it("fails unfocused or ringless controls", async () => {
    await expect(
      expectVisibleFocus(locatorWithFocus({ focused: false, outlineWidth: "2px", boxShadow: "none" })),
    ).rejects.toThrow(/focus/i);
    await expect(
      expectVisibleFocus(locatorWithFocus({ focused: true, outlineWidth: "0px", boxShadow: "none" })),
    ).rejects.toThrow(/focus/i);
  });

  it("enables reduced motion and rejects lingering animation", async () => {
    const passing = pageWithMotion({
      matches: true,
      animationDuration: "0.001ms",
      transitionDuration: "0.001ms",
    });
    await expect(expectReducedMotion(passing.page)).resolves.toBeUndefined();
    expect(passing.emulateMediaCalls).toEqual([{ reducedMotion: "reduce" }]);

    const lingering = pageWithMotion({
      matches: true,
      animationDuration: "200ms",
      transitionDuration: "0s",
    });
    await expect(expectReducedMotion(lingering.page)).rejects.toThrow(/reduced motion/i);

    const unmatched = pageWithMotion({
      matches: false,
      animationDuration: "0s",
      transitionDuration: "0s",
    });
    await expect(expectReducedMotion(unmatched.page)).rejects.toThrow(/reduced motion/i);
  });
});
