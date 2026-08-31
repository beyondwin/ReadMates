import assert from "node:assert/strict";
import type { Locator, Page } from "@playwright/test";

export type SeriousAccessibilityFinding = {
  impact: "critical" | "serious";
  rule: string;
  selector: string;
  detail: string;
};

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
  const subpixel = 0.05;
  assert.ok(
    box.width + subpixel >= minimum && box.height + subpixel >= minimum,
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

export async function expectNoSeriousAccessibilityFindings(
  page: Page,
): Promise<SeriousAccessibilityFinding[]> {
  const findings = await page.evaluate(() => {
    type Finding = {
      impact: "critical" | "serious";
      rule: string;
      selector: string;
      detail: string;
    };
    const result: Finding[] = [];
    const isVisible = (element: Element) => {
      if (!(element instanceof HTMLElement)) return false;
      const closedDetails = element.closest("details:not([open])");
      const closedSummary = closedDetails?.querySelector(":scope > summary");
      if (closedDetails && !closedSummary?.contains(element)) return false;
      for (let current: HTMLElement | null = element; current; current = current.parentElement) {
        if (
          current.hidden
          || current.inert
          || current.getAttribute("aria-hidden") === "true"
        ) return false;
        const currentStyle = getComputedStyle(current);
        if (currentStyle.display === "none" || currentStyle.visibility === "hidden") return false;
      }
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      return style.display !== "none"
        && style.visibility !== "hidden"
        && box.width > 0
        && box.height > 0;
    };
    const selectorFor = (element: Element) => {
      if (element.id) return `#${CSS.escape(element.id)}`;
      const role = element.getAttribute("role");
      return role ? `${element.tagName.toLowerCase()}[role="${role}"]` : element.tagName.toLowerCase();
    };
    const referencedText = (element: Element, attribute: string) => (
      (element.getAttribute(attribute) ?? "")
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((id) => document.getElementById(id)?.textContent?.trim() ?? "")
        .filter(Boolean)
        .join(" ")
    );
    const accessibleName = (element: Element) => {
      const html = element as HTMLElement;
      const formControl = element as HTMLInputElement;
      return element.getAttribute("aria-label")?.trim()
        || referencedText(element, "aria-labelledby")
        || Array.from(formControl.labels ?? []).map((label) => label.textContent?.trim() ?? "").filter(Boolean).join(" ")
        || element.getAttribute("alt")?.trim()
        || element.getAttribute("title")?.trim()
        || html.innerText?.trim()
        || formControl.value?.trim()
        || "";
    };

    const visibleMain = Array.from(document.querySelectorAll("main, [role='main']")).filter(isVisible);
    if (visibleMain.length !== 1) {
      result.push({
        impact: "critical",
        rule: "landmark-one-main",
        selector: "main, [role='main']",
        detail: `expected one visible main landmark, received ${visibleMain.length}`,
      });
    }

    const interactiveSelector = [
      "a[href]", "button", "input:not([type='hidden'])", "select", "textarea",
      "[role='button']", "[role='link']", "[role='checkbox']", "[role='radio']",
      "[role='tab']", "[role='menuitem']", "[role='option']",
    ].join(",");
    for (const element of Array.from(document.querySelectorAll(interactiveSelector)).filter(isVisible)) {
      if (!accessibleName(element)) {
        result.push({
          impact: "critical",
          rule: "interactive-name",
          selector: selectorFor(element),
          detail: `visible interactive element has no accessible name: ${element.outerHTML.slice(0, 240)}`,
        });
      }
      if (element.parentElement?.closest(interactiveSelector)) {
        result.push({
          impact: "critical",
          rule: "nested-interactive",
          selector: selectorFor(element),
          detail: "visible interactive element is nested inside another interactive element",
        });
      }
    }

    for (const attribute of ["aria-labelledby", "aria-describedby", "aria-controls"] as const) {
      for (const element of document.querySelectorAll(`[${attribute}]`)) {
        if (!isVisible(element)) continue;
        const missing = (element.getAttribute(attribute) ?? "")
          .trim()
          .split(/\s+/)
          .filter((id) => id && !document.getElementById(id));
        if (missing.length > 0) {
          result.push({
            impact: "serious",
            rule: "aria-valid-reference",
            selector: selectorFor(element),
            detail: `${attribute} references missing id ${missing.join(", ")}`,
          });
        }
      }
    }

    const landmarkNames = new Map<string, Element>();
    for (const landmark of Array.from(document.querySelectorAll(
      "nav, aside, [role='navigation'], [role='complementary']",
    )).filter(isVisible)) {
      const role = landmark.getAttribute("role")
        ?? (landmark.tagName.toLowerCase() === "nav" ? "navigation" : "complementary");
      const name = accessibleName(landmark);
      if (!name) {
        result.push({
          impact: "serious",
          rule: "landmark-name",
          selector: selectorFor(landmark),
          detail: `${role} landmark has no accessible name`,
        });
        continue;
      }
      const key = `${role}:${name}`;
      if (landmarkNames.has(key)) {
        result.push({
          impact: "serious",
          rule: "landmark-unique-name",
          selector: selectorFor(landmark),
          detail: `${role} landmark name is duplicated: ${name}`,
        });
      } else {
        landmarkNames.set(key, landmark);
      }
    }

    return result;
  });

  assert.deepEqual(
    findings,
    [],
    `serious/critical accessibility findings:\n${findings
      .map((finding) => `${finding.impact} ${finding.rule} ${finding.selector}: ${finding.detail}`)
      .join("\n")}`,
  );
  return findings;
}
