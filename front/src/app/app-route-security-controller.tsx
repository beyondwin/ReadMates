import { useEffect, useRef, useState } from "react";
import type { ClubWorkspace } from "@/shared/model/app-club-shell";
import { consumeWorkspaceTransition } from "@/src/app/app-route-security-transition";

const workspaceLabels: Record<ClubWorkspace, string> = {
  member: "멤버 공간",
  host: "호스트 공간",
};

export function AppRouteSecurityController({ workspace }: { workspace: ClubWorkspace }) {
  const previousWorkspace = useRef(workspace);
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    const changedInPlace = previousWorkspace.current !== workspace;
    const requestedAcrossLayouts = consumeWorkspaceTransition(workspace);
    if (!changedInPlace && !requestedAcrossLayouts) {
      return;
    }

    previousWorkspace.current = workspace;
    const label = workspaceLabels[workspace];
    setAnnouncement(`${label}으로 전환했습니다`);
    document.title = document.title.includes(label)
      ? document.title
      : `${label} · ${document.title || "읽는사이"}`;

    const focusHeading = () => {
      const heading = document.querySelector<HTMLElement>("main h1, h1");
      if (!heading) {
        return;
      }
      if (!heading.hasAttribute("tabindex")) {
        heading.setAttribute("tabindex", "-1");
      }
      heading.focus({ preventScroll: true });
    };
    const frame = window.requestAnimationFrame(focusHeading);
    return () => window.cancelAnimationFrame(frame);
  }, [workspace]);

  return (
    <div data-app-route-security-controller>
      {announcement ? (
        <span className="rm-sr-only" role="status" aria-live="polite" aria-atomic="true">
          {announcement}
        </span>
      ) : null}
    </div>
  );
}
