const INTERACTIVE_SELECTOR = "button, a[href], [role='button'], [role='link']";

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
