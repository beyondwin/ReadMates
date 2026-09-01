import { useLayoutEffect, useRef, useState } from "react";

export const ADMIN_TODAY_SPLIT_MIN_WIDTH = 960;

export type AdminContentLayout = "flow" | "split";

export function useAdminContentWidth<ElementType extends HTMLElement>() {
  const ref = useRef<ElementType>(null);
  const [width, setWidth] = useState<number | null>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries.find((candidate) => candidate.target === element);
      if (!entry) return;
      setWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return {
    ref,
    width: width ?? 0,
    layout: (width != null && width >= ADMIN_TODAY_SPLIT_MIN_WIDTH ? "split" : "flow") as AdminContentLayout,
  };
}
