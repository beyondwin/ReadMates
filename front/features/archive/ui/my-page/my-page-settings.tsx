import { type ReactNode, useEffect, useRef } from "react";

function isOutsideViewport(element: HTMLElement) {
  const { top, bottom } = element.getBoundingClientRect();
  return top < 0 || bottom > globalThis.innerHeight;
}

function reducedMotionPreferred() {
  return globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

export function MyPageSettings({ open, children }: { open: boolean; children: ReactNode }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const wasOpenRef = useRef(open);

  useEffect(() => {
    const wasOpen = wasOpenRef.current;
    wasOpenRef.current = open;

    if (!open || wasOpen) {
      return;
    }

    const focusHeading = () => {
      const heading = headingRef.current;
      if (!heading) {
        return;
      }

      heading.focus({ preventScroll: true });
      if (isOutsideViewport(heading)) {
        heading.scrollIntoView({ block: "start", behavior: reducedMotionPreferred() ? "auto" : "smooth" });
      }
    };
    const frame = globalThis.requestAnimationFrame?.(focusHeading);
    const timeout = frame === undefined ? globalThis.setTimeout(focusHeading, 0) : undefined;

    return () => {
      if (frame !== undefined) {
        globalThis.cancelAnimationFrame(frame);
      }
      if (timeout !== undefined) {
        globalThis.clearTimeout(timeout);
      }
    };
  }, [open]);

  return (
    <section id="my-page-settings" className="rm-my-shelf-settings" aria-labelledby="my-page-settings-title" hidden={!open}>
      <h2 id="my-page-settings-title" ref={headingRef} tabIndex={-1}>
        계정과 알림
      </h2>
      {children}
    </section>
  );
}
