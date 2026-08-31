// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import type { Locator, Page } from "@playwright/test";
import {
  VISUAL_AUTHORITY_VIEWPORTS,
  expectMinimumTargetSize,
  expectNoHorizontalOverflow,
  expectNoSeriousAccessibilityFindings,
  expectReducedMotion,
  expectVisibleFocus,
} from "./visual-authority-contract";

const originalGetComputedStyle = window.getComputedStyle;
const originalMatchMedia = window.matchMedia;
const restores: Array<() => void> = [];

afterEach(() => {
  while (restores.length > 0) {
    restores.pop()?.();
  }
  window.getComputedStyle = originalGetComputedStyle;
  window.matchMedia = originalMatchMedia;
  document.body.replaceChildren();
});

function stubOwnProperty(target: object, key: string, value: unknown) {
  const existing = Object.getOwnPropertyDescriptor(target, key);
  Object.defineProperty(target, key, { configurable: true, get: () => value });
  restores.push(() => {
    if (existing) {
      Object.defineProperty(target, key, existing);
      return;
    }
    Reflect.deleteProperty(target, key);
  });
}

function installLayout(metrics: { scrollWidth: number; clientWidth: number; innerWidth: number }) {
  stubOwnProperty(document.documentElement, "scrollWidth", metrics.scrollWidth);
  stubOwnProperty(document.documentElement, "clientWidth", metrics.clientWidth);
  stubOwnProperty(window, "innerWidth", metrics.innerWidth);
}

function createPage() {
  const emulateMediaCalls: unknown[] = [];
  const page = {
    emulateMedia: async (media: { reducedMotion?: "reduce" | "no-preference" | null }) => {
      emulateMediaCalls.push(media);
    },
    evaluate: async (fn: (arg?: unknown) => unknown, arg?: unknown) => fn(arg),
  } as unknown as Page;
  return { page, emulateMediaCalls };
}

function installMotion(options: {
  matches: boolean;
  styles?: Array<{ el: Element; animationDuration: string; transitionDuration: string }>;
}) {
  const styleMap = new Map(options.styles?.map((item) => [item.el, item]) ?? []);
  window.getComputedStyle = ((element: Element) => {
    const entry = styleMap.get(element);
    return {
      animationDuration: entry?.animationDuration ?? "0s",
      transitionDuration: entry?.transitionDuration ?? "0s",
    };
  }) as typeof getComputedStyle;
  window.matchMedia = ((query: string) =>
    ({
      matches: options.matches && query.includes("prefers-reduced-motion"),
      media: query,
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent() {
        return false;
      },
    }) as MediaQueryList);
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

function installVisibleDom() {
  const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
  HTMLElement.prototype.getBoundingClientRect = () => ({
    bottom: 44,
    height: 44,
    left: 0,
    right: 100,
    top: 0,
    width: 100,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
  restores.push(() => {
    HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
  });
  window.getComputedStyle = (() => ({
    display: "block",
    visibility: "visible",
  })) as typeof getComputedStyle;
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
    installLayout({ scrollWidth: 1001, clientWidth: 1000, innerWidth: 1000 });
    await expect(expectNoHorizontalOverflow(createPage().page)).resolves.toBeUndefined();
  });

  it("fails when overflow exceeds the default 1px tolerance", async () => {
    installLayout({ scrollWidth: 1002, clientWidth: 1000, innerWidth: 1000 });
    await expect(expectNoHorizontalOverflow(createPage().page)).rejects.toThrow(/1px/);
  });

  it("honors an explicit overflow tolerance", async () => {
    installLayout({ scrollWidth: 1002, clientWidth: 1000, innerWidth: 1000 });
    await expect(expectNoHorizontalOverflow(createPage().page, 2)).resolves.toBeUndefined();
  });

  it("measures overflow against documentElement.clientWidth, not window.innerWidth", async () => {
    const { page } = createPage();
    installLayout({ scrollWidth: 1010, clientWidth: 1000, innerWidth: 1015 });
    await expect(expectNoHorizontalOverflow(page)).rejects.toThrow(/10px/);

    installLayout({ scrollWidth: 1000, clientWidth: 1000, innerWidth: 985 });
    await expect(expectNoHorizontalOverflow(page)).resolves.toBeUndefined();
  });

  it("fails targets smaller than the default 44px minimum", async () => {
    await expect(expectMinimumTargetSize(locatorWithBox({ width: 43, height: 44 }))).rejects.toThrow(/44px/);
    await expect(expectMinimumTargetSize(locatorWithBox({ width: 44, height: 43 }))).rejects.toThrow(/44px/);
  });

  it("accepts 44px targets and an explicit minimum", async () => {
    await expect(expectMinimumTargetSize(locatorWithBox({ width: 44, height: 44 }))).resolves.toBeUndefined();
    await expect(expectMinimumTargetSize(locatorWithBox({ width: 44, height: 43.999 }))).resolves.toBeUndefined();
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

  it("enables reduced motion and rejects lingering descendant animation", async () => {
    const child = document.createElement("div");
    document.body.append(child);

    const passing = createPage();
    installMotion({
      matches: true,
      styles: [
        { el: document.documentElement, animationDuration: "0s", transitionDuration: "0s" },
        { el: child, animationDuration: "0.001ms", transitionDuration: "0.001ms" },
      ],
    });
    await expect(expectReducedMotion(passing.page)).resolves.toBeUndefined();
    expect(passing.emulateMediaCalls).toEqual([{ reducedMotion: "reduce" }]);

    const lingering = createPage();
    installMotion({
      matches: true,
      styles: [
        { el: document.documentElement, animationDuration: "0s", transitionDuration: "0s" },
        { el: document.body, animationDuration: "0s", transitionDuration: "0s" },
        { el: child, animationDuration: "200ms", transitionDuration: "0s" },
      ],
    });
    await expect(expectReducedMotion(lingering.page)).rejects.toThrow(/reduced motion/i);

    const unmatched = createPage();
    installMotion({ matches: false });
    await expect(expectReducedMotion(unmatched.page)).rejects.toThrow(/reduced motion/i);
  });

  it("rejects anonymous navigation and complementary landmarks even when descendants have text", async () => {
    installVisibleDom();
    document.body.innerHTML = `
      <main></main>
      <nav><a href="/host" aria-label="Go">Go</a></nav>
      <aside><p>Help</p></aside>
    `;
    Object.defineProperty(document.querySelector("nav"), "innerText", {
      configurable: true,
      value: "Go",
    });
    Object.defineProperty(document.querySelector("aside"), "innerText", {
      configurable: true,
      value: "Help",
    });

    await expect(expectNoSeriousAccessibilityFindings(createPage().page)).rejects.toThrow(
      /landmark-name/,
    );
  });

  it("rejects a filled text input without an accessible name", async () => {
    installVisibleDom();
    document.body.innerHTML = `
      <main>
        <input value="filled-but-unlabelled" />
      </main>
    `;

    await expect(expectNoSeriousAccessibilityFindings(createPage().page)).rejects.toThrow(
      /interactive-name/,
    );
  });

  it("preserves author, label, content, alt, and explicit submit naming sources", async () => {
    installVisibleDom();
    document.body.innerHTML = `
      <main>
        <label for="query">Query</label>
        <input id="query" />
        <button type="button">Save</button>
        <input type="submit" value="Send" />
        <input type="image" alt="Upload cover" />
      </main>
      <nav aria-label="Primary"><a href="/host" aria-label="Host">Host</a></nav>
      <span id="related-heading">Related</span>
      <aside aria-labelledby="related-heading"></aside>
    `;
    Object.defineProperty(document.querySelector("button"), "innerText", {
      configurable: true,
      value: "Save",
    });

    await expect(expectNoSeriousAccessibilityFindings(createPage().page)).resolves.toEqual([]);
  });

  it("excludes hidden and inert ancestor subtrees without skipping visible ARIA references", async () => {
    installVisibleDom();
    document.body.innerHTML = `
      <main>
        <div hidden><nav></nav></div>
        <div inert><aside></aside></div>
        <button aria-label="Open" aria-controls="missing-panel"></button>
      </main>
    `;

    const finding = await expectNoSeriousAccessibilityFindings(createPage().page).catch(
      (error: unknown) => error,
    );
    expect(finding).toBeInstanceOf(Error);
    expect((finding as Error).message).toContain("aria-valid-reference button");
    expect((finding as Error).message).not.toContain("landmark-name");
  });
});
