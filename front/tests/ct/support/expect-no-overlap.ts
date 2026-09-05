import type { Locator } from "@playwright/experimental-ct-react";

export async function expectNoTextOverlap(container: Locator): Promise<void> {
  const boxes = await container.locator("a, button, strong, span, p, h1, h2, h3").evaluateAll((nodes) =>
    nodes
      .filter((node) => {
        if ((node.textContent ?? "").trim().length === 0) return false;
        if (node.classList.contains("rm-sr-only")) return false;
        const style = getComputedStyle(node);
        if (style.visibility === "hidden" || style.display === "none") return false;
        const rect = node.getBoundingClientRect();
        return rect.width >= 2 && rect.height >= 2;
      })
      .map((node) => {
        const rect = node.getBoundingClientRect();
        const depth = (function depthOf(element: Element | null, count = 0): number {
          return element ? depthOf(element.parentElement, count + 1) : count;
        })(node);
        return {
          x: rect.x,
          y: rect.y,
          w: rect.width,
          h: rect.height,
          t: (node.textContent ?? "").trim().slice(0, 20),
          depth,
        };
      }),
  );

  const leaves = boxes.filter(
    (box) =>
      !boxes.some(
        (other) =>
          other !== box &&
          other.depth > box.depth &&
          other.x >= box.x &&
          other.y >= box.y &&
          other.x + other.w <= box.x + box.w + 1 &&
          other.y + other.h <= box.y + box.h + 1,
      ),
  );

  for (let i = 0; i < leaves.length; i += 1) {
    for (let j = i + 1; j < leaves.length; j += 1) {
      const a = leaves[i]!;
      const b = leaves[j]!;
      const overlap =
        a.x < b.x + b.w - 2 &&
        b.x < a.x + a.w - 2 &&
        a.y < b.y + b.h - 2 &&
        b.y < a.y + a.h - 2;
      if (overlap) throw new Error(`text overlap: "${a.t}" × "${b.t}"`);
    }
  }
}
