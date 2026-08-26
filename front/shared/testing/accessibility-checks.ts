const INTERACTIVE_SELECTOR = "button, a[href], [role='button'], [role='link']";
const LIVE_REGION_SELECTOR = "[aria-live], [role='alert'], [role='status'], [role='log']";
const LIVE_ROLES = new Set(["alert", "status", "log"]);

export function findUnnamedInteractiveElements(container: HTMLElement): HTMLElement[] {
  const elements = Array.from(
    container.querySelectorAll<HTMLElement>(INTERACTIVE_SELECTOR),
  );
  return elements.filter((el) => {
    const text = getVisibleText(el).trim();
    const ariaLabel = el.getAttribute("aria-label")?.trim();
    const labelledBy = getLabelledByText(el).trim();
    const title = el.getAttribute("title")?.trim();
    return !text && !ariaLabel && !labelledBy && !title;
  });
}

export function findNestedLiveRegions(container: HTMLElement): HTMLElement[] {
  const elements = Array.from(container.querySelectorAll<HTMLElement>(LIVE_REGION_SELECTOR));
  return elements.filter((el) => {
    if (!isLiveRegion(el)) {
      return false;
    }
    for (let parent = el.parentElement; parent; parent = parent.parentElement) {
      if (isLiveRegion(parent)) {
        return true;
      }
    }
    return false;
  });
}

function isLiveRegion(el: HTMLElement): boolean {
  const ariaLive = el.getAttribute("aria-live")?.trim().toLowerCase();
  if (ariaLive === "off") {
    return false;
  }
  if (ariaLive === "polite" || ariaLive === "assertive") {
    return true;
  }
  const role = el.getAttribute("role")?.trim().toLowerCase();
  return role !== undefined && LIVE_ROLES.has(role);
}

function getLabelledByText(el: HTMLElement): string {
  const labelledBy = el.getAttribute("aria-labelledby")?.trim();
  if (!labelledBy) {
    return "";
  }

  return labelledBy
    .split(/\s+/)
    .map((id) => {
      const labelEl = findElementByIdInTree(el, id);
      return labelEl ? getVisibleText(labelEl).trim() : "";
    })
    .filter(Boolean)
    .join(" ");
}

function findElementByIdInTree(el: HTMLElement, id: string): HTMLElement | null {
  let root = el;
  while (root.parentElement) {
    root = root.parentElement;
  }
  if (root.id === id) {
    return root;
  }
  return Array.from(root.querySelectorAll<HTMLElement>("[id]")).find((node) => node.id === id) ?? null;
}

function getVisibleText(el: HTMLElement): string {
  const textNodes = el.ownerDocument.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const parts: string[] = [];
  let current = textNodes.nextNode();

  while (current) {
    const text = current.textContent?.trim();
    const parent = current.parentElement;
    if (text && parent && isVisible(parent)) {
      parts.push(text);
    }
    current = textNodes.nextNode();
  }

  return parts.join(" ");
}

function isVisible(el: HTMLElement): boolean {
  for (let current: HTMLElement | null = el; current; current = current.parentElement) {
    if (current.hidden || current.getAttribute("aria-hidden") === "true") {
      return false;
    }
    const style = current.ownerDocument.defaultView?.getComputedStyle(current);
    if (style?.display === "none" || style?.visibility === "hidden") {
      return false;
    }
  }
  return true;
}
